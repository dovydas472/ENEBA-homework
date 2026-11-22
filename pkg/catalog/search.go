package catalog

import (
	"context"
	"fmt"
	"regexp"
	"strings"
	"unicode/utf8"

	"github.com/jackc/pgx/v5"
)

// ---------------------------------------------------------------------------
// Search (Task 13a): which games match the text `q`, and how well.
//
// A game matches when its TITLE or one of its ALIASES (table game_aliases,
// e.g. "GTA V") either
//   - CONTAINS q, case-insensitively (ILIKE '%q%'), or
//   - is SIMILAR to q with pg_trgm: `q <% term`, i.e. word_similarity(q, term)
//     >= the threshold. word_similarity compares q with the best matching PART
//     of the term, so "witchr 3" is close to "The Witcher 3: Wild Hunt" even
//     though the whole title is much longer than the query.
//
// Both conditions are served by the GIN trigram indexes games_title_trgm_idx and
// game_aliases_alias_trgm_idx (one index answers ILIKE and <%).
//
// EXCEPTION (Task 13c): a 2-character query is too short for "contains" - "re"
// would be found inside "Dishonored" - so it matches only at the START OF A WORD
// of the title or alias: the beginning of the text or right after a space or
// punctuation ("re" -> "Red Dead Redemption", "Half-Life" matches "li" but
// "Dishonored" does not match "re"). No trigram match for these either.
//
// Rank of one matching term (lower = better):
//
//	0 exact     the whole title/alias equals q ("portal" -> Portal)
//	1 prefix    it starts with q ("portal" -> Portal 2)
//	2 contains  q is inside it ("witcher" -> The Witcher 3)
//	3 similar   typo match only ("eldn ring" -> Elden Ring)
//
// then the similarity score (higher first), then popularity, then id.
// A game's rank is the rank of its BEST term.
// ---------------------------------------------------------------------------

// Query length limits (decided by the owner), counted in characters after trimming.
const (
	MinQueryLen = 2
	MaxQueryLen = 100
)

// wordStartMaxLen: queries of up to this many characters use the word-start rule
// instead of contains / similar (see the exception above).
const wordStartMaxLen = 2

// MaxSuggestions is the size of the search-box dropdown.
const MaxSuggestions = 6

// searchThresholdSQL sets the threshold of the `<%` operator for THIS batch only.
//
// Why 0.55 and not the default 0.6: tuned with real queries against our 50 games
// (table in docs/reports/TASK_13a_search_backend.md). At 0.6 "witchr 3" (score
// 0.58) and "halflife" (0.58) find nothing; at 0.5 "the witcher" also returns
// Zelda (0.50, it only shares "the") and "hl2" returns Half-Life.
//
// Why set_config(..., true): `true` = local to the current transaction. pgx runs
// a batch as ONE implicit transaction, so the value lives exactly as long as the
// batch and is gone afterwards. That matters with PgBouncer in transaction mode:
// a plain SET would stay on the server connection and leak into other clients'
// requests. (Checked through the Neon pooler: inside the batch 0.55, the next
// query 0.6 again.)
const searchThresholdSQL = `SELECT set_config('pg_trgm.word_similarity_threshold', '0.55', true)`

// searchCTEs: one row per matching game (game_matches). Parameters:
//
//	@q            text     the normalized query; NULL = no search (then no rows)
//	@q_prefix     text     LIKE pattern "q%"   (wildcards in q escaped)
//	@q_contains   text     LIKE pattern "%q%"
//	@short_query  boolean  q has at most 2 characters: use the word-start rule
//	@q_word_start text     regex "word start + q" (special characters escaped); NULL for longer queries
//
// The match step reads: short query -> word start only; otherwise contains OR similar.
// `~*` is Postgres' case-insensitive regex match. The pattern
// (^|[^[:alnum:]])re means: "re" at the start of the text, or right after one
// character that is not a letter or digit (space, ":", "-", "'", ".", "(" ...).
// The same GIN trigram indexes can also answer `~*` (pg_trgm extracts the
// trigrams the pattern needs), so this condition stays index-friendly; on our
// tiny tables the planner reads them sequentially anyway.
// For longer queries @short_query is false: the planner sees the real value, drops
// the word-start half and the plan is the one described above.
//
// matched_alias is the alias of the best term, but only when the TITLE did not
// match at all - so the UI can show "GTA 5 -> Grand Theft Auto V", and never an
// alias next to a title that the user can already see matches.
const searchCTEs = `
matched_terms AS (   -- every title and alias that matches; each half uses its own trigram index
    SELECT g.id AS game_id, g.title AS term, NULL::text AS alias
    FROM games g
    WHERE (@short_query::boolean AND g.title ~* @q_word_start::text)
       OR (NOT @short_query::boolean AND (g.title ILIKE @q_contains::text OR @q::text <% g.title))
    UNION ALL
    SELECT a.game_id, a.alias, a.alias
    FROM game_aliases a
    WHERE (@short_query::boolean AND a.alias ~* @q_word_start::text)
       OR (NOT @short_query::boolean AND (a.alias ILIKE @q_contains::text OR @q::text <% a.alias))
),
ranked_terms AS (
    SELECT game_id, alias,
           CASE WHEN lower(term) = lower(@q::text) THEN 0  -- exact
                WHEN term ILIKE @q_prefix::text    THEN 1  -- prefix
                WHEN term ILIKE @q_contains::text  THEN 2  -- contains (also a word start inside the text)
                ELSE 3                                     -- similar (typo)
           END AS tier,
           word_similarity(@q::text, term) AS score,
           bool_or(alias IS NULL) OVER (PARTITION BY game_id) AS title_matched
    FROM matched_terms
),
game_matches AS (    -- the best term of each game decides its rank; title before alias on a tie
    SELECT DISTINCT ON (game_id)
           game_id, tier AS match_tier, score AS match_score,
           CASE WHEN title_matched THEN NULL ELSE alias END AS matched_alias
    FROM ranked_terms
    -- COLLATE "C" = byte order: the same tie-break on every server, whatever its default collation
    ORDER BY game_id, tier, score DESC, alias COLLATE "C" NULLS FIRST
)`

// NormalizeQuery trims q and collapses inner whitespace ("  witchr   3 " ->
// "witchr 3"), so extra spaces never change the result or the cache key.
func NormalizeQuery(q string) string {
	return strings.Join(strings.Fields(q), " ")
}

// likeEscaper escapes the LIKE wildcards in user text: "100%" must match the
// characters "100%", not "100 followed by anything". Backslash is ILIKE's
// default escape character, so it is escaped first.
var likeEscaper = strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`)

// wordStartPrefix is the regex for "the beginning of a word": the start of the
// text, or one character that is not a letter or digit.
const wordStartPrefix = `(^|[^[:alnum:]])`

// searchArgs returns the search parameters for a normalized query. An empty
// query gives NULLs: the search CTEs return no rows and base does not filter.
func searchArgs(q string) pgx.NamedArgs {
	if q == "" {
		return pgx.NamedArgs{"q": nil, "q_prefix": nil, "q_contains": nil, "q_word_start": nil, "short_query": nil}
	}
	esc := likeEscaper.Replace(q)
	args := pgx.NamedArgs{"q": q, "q_prefix": esc + "%", "q_contains": "%" + esc + "%",
		"q_word_start": nil, "short_query": false}
	if utf8.RuneCountInString(q) <= wordStartMaxLen { // characters, not bytes: "ü?" is 2
		// QuoteMeta makes ".", "*", "(" ... plain characters; it never produces a letter escape like \d.
		args["q_word_start"] = wordStartPrefix + regexp.QuoteMeta(q)
		args["short_query"] = true
	}
	return args
}

// suggestSQL: the best matching games (at most @limit), each with ONE product to
// link to: its cheapest product that is in stock, or - when none is - its first
// product in the store's popularity order (products have no popularity of their
// own, so the tie-break is the id: the game's main platform, Global, Standard).
const suggestSQL = `
WITH ` + statsCTEs + `,
` + searchCTEs + `
SELECT g.title, p.slug, p.edition, pl.slug, pl.name, r.slug, r.name, g.cover_url,
       pick.min_price_cents, gm.matched_alias
FROM game_matches gm
JOIN games g ON g.id = gm.game_id
CROSS JOIN LATERAL (
    SELECT pr.id, ps.min_price_cents
    FROM products pr
    LEFT JOIN product_stats ps ON ps.product_id = pr.id
    WHERE pr.game_id = g.id
    ORDER BY ps.min_price_cents ASC NULLS LAST, pr.id  -- NULL price = out of stock = last
    LIMIT 1
) pick
JOIN products  p  ON p.id  = pick.id
JOIN platforms pl ON pl.id = p.platform_id
JOIN regions   r  ON r.id  = p.region_id
ORDER BY gm.match_tier, gm.match_score DESC, g.popularity DESC, g.id
LIMIT @limit`

// Suggest returns up to MaxSuggestions games for the search-box dropdown, best
// match first, one item per game. q must already be normalized and validated
// (pkg/server). The threshold and the query go out in one batch.
func (s *Store) Suggest(ctx context.Context, q string) ([]Suggestion, error) {
	conn, err := s.src.Acquire(ctx)
	if err != nil {
		return nil, err
	}
	defer conn.Release()

	args := searchArgs(q)
	args["limit"] = MaxSuggestions
	batch := &pgx.Batch{}
	batch.Queue(searchThresholdSQL)
	batch.Queue(suggestSQL, args)
	br := conn.SendBatch(ctx, batch)
	defer br.Close()

	if _, err := br.Exec(); err != nil {
		return nil, fmt.Errorf("catalog: search threshold: %w", err)
	}
	rows, err := br.Query()
	if err != nil {
		return nil, fmt.Errorf("catalog: suggest: %w", err)
	}
	out := []Suggestion{} // never nil: the JSON must be [] not null
	for rows.Next() {
		var sg Suggestion
		if err := rows.Scan(&sg.GameTitle, &sg.ProductSlug, &sg.Edition, &sg.Platform.Slug, &sg.Platform.Name,
			&sg.Region.Slug, &sg.Region.Name, &sg.CoverURL, &sg.PriceCents, &sg.MatchedAlias); err != nil {
			rows.Close()
			return nil, fmt.Errorf("catalog: scan suggestion: %w", err)
		}
		sg.InStock = sg.PriceCents != nil
		out = append(out, sg)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("catalog: suggest: %w", err)
	}
	return out, br.Close()
}
