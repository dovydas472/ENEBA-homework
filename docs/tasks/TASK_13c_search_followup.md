# Task 13c – Search follow-up: 2-letter queries match word starts; edition in suggestions

**Model:** Sonnet · **Effort:** high
**Runs in parallel with Task 14** (auth) – another session works in the main folder, so use a worktree:
```
git worktree add ../ENEBA-homework-13c -b task/13c-search-followup origin/main
```
Remove it after the PR is opened. No migration in this task.

## Decisions (owner answers to the open questions of Task 13b)
1. **2-character queries** (after normalising): match only at the **start of a word** in the title or an alias (case-insensitive) – no substring match in the middle of a word, no trigram. 3+ characters keep the current rules (contains OR `word_similarity` ≥ 0.55). Applies to both `GET /api/products?q=` and `GET /api/search/suggest`. Ranking unchanged.
   Word start = the beginning of the string or after a space or punctuation (`:`, `-`, `'`, `.`, `(` …). Keep it index-friendly where possible and explain the SQL; with our data size a correct and readable condition matters more than an index for this case.
2. **`edition` in suggestions:** add `edition` (string) to each suggest item. The UI shows it in the row when it is not "Standard" (e.g. "Game of the Year Edition"), the same way the Store card does.

## 1. Branch
Standard workflow from `CLAUDE.md` (`task/13c-search-followup`, in the worktree).

## 2. Tests
- Go unit + integration (CI): `re` no longer returns mid-word hits such as "Dishonored"; `re` still finds words that start with "re" (e.g. "Red Dead Redemption", "Resident Evil" if present – use real games from the seed); `gt` still finds GTA via the alias start; `ac` finds Assassin's Creed via "AC"; 3+ character queries unchanged (the 13a query table still passes); suggest item contains `edition`.
- Vitest: suggestion row shows the edition only when not "Standard".
- Update the 2-letter table in the report: before → after.

## 3. Docs
`docs/DATA_MODEL.md` (search sketch), README (search rules), `docs/PAAISKINIMAI_LT.md` (why 2-letter queries use word starts), `src/api/types.ts` contract.

## Report
As defined in `CLAUDE.md` (incl. Self-review). Export the session log at the end and commit it on this branch.
