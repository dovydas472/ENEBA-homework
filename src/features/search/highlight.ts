/** A piece of a title: `match` = this piece is the typed text and is drawn highlighted. */
export interface HighlightPart {
  text: string;
  match: boolean;
}

/**
 * Splits `text` around the FIRST place where `query` appears, ignoring upper/lower case:
 *   highlightParts("The Witcher 3", "witch") -> [{"The ", false}, {"Witch", true}, {"er 3", false}]
 * The highlighted piece keeps the title's own spelling ("Witch", not "witch").
 * No match (e.g. a typo "witchr" or an alias hit "gta") -> the whole text as one plain part: the server found it
 * by similarity or by an alias, so there is no exact piece to mark.
 */
export function highlightParts(text: string, query: string): HighlightPart[] {
  const needle = query.trim().toLowerCase();
  const haystack = text.toLowerCase();
  // A few letters change length when lower-cased (e.g. "İ"); then the positions would not line up. Rare: just skip.
  const index = needle && haystack.length === text.length ? haystack.indexOf(needle) : -1;
  if (index === -1) return [{ text, match: false }];

  const end = index + needle.length;
  const parts: HighlightPart[] = [
    { text: text.slice(0, index), match: false },
    { text: text.slice(index, end), match: true },
    { text: text.slice(end), match: false },
  ];
  return parts.filter((part) => part.text !== "");
}
