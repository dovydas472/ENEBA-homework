/** A piece of a title: `match` = this piece is the typed text and is drawn highlighted. */
export interface HighlightPart {
  text: string;
  match: boolean;
}

/**
 * Queries of up to this many characters match only at the START of a word on the server (pkg/catalog/search.go,
 * Task 13c): "re" finds "Red Dead Redemption", not "Dishonored". The highlight follows the same rule.
 */
const WORD_START_MAX_LEN = 2;

/** A letter or digit in any language: what the server's `[[:alnum:]]` stands for. */
const isLetterOrDigit = (char: string) => /[\p{L}\p{N}]/u.test(char);

/**
 * Splits `text` around the FIRST place where `query` appears, ignoring upper/lower case:
 *   highlightParts("The Witcher 3", "witch") -> [{"The ", false}, {"Witch", true}, {"er 3", false}]
 * The highlighted piece keeps the title's own spelling ("Witch", not "witch").
 * For a 2-character query only a place at the start of a word counts (the beginning of the text or right after a
 * character that is not a letter or digit): ("Half-Life", "li") marks "Li" after the "-".
 * No match (e.g. a typo "witchr" or an alias hit "gta") -> the whole text as one plain part: the server found it
 * by similarity or by an alias, so there is no exact piece to mark.
 */
export function highlightParts(text: string, query: string): HighlightPart[] {
  const needle = query.trim().toLowerCase();
  const haystack = text.toLowerCase();
  // A few letters change length when lower-cased (e.g. "İ"); then the positions would not line up. Rare: just skip.
  const index = needle && haystack.length === text.length ? findMatch(haystack, needle) : -1;
  if (index === -1) return [{ text, match: false }];

  const end = index + needle.length;
  const parts: HighlightPart[] = [
    { text: text.slice(0, index), match: false },
    { text: text.slice(index, end), match: true },
    { text: text.slice(end), match: false },
  ];
  return parts.filter((part) => part.text !== "");
}

/** The index of the first place `needle` appears in `haystack` (both lower-case), or -1. */
function findMatch(haystack: string, needle: string): number {
  if ([...needle].length > WORD_START_MAX_LEN) return haystack.indexOf(needle);
  for (let i = haystack.indexOf(needle); i !== -1; i = haystack.indexOf(needle, i + 1)) {
    if (i === 0 || !isLetterOrDigit(haystack[i - 1])) return i;
  }
  return -1;
}
