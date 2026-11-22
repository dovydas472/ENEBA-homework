const dateFormat = new Intl.DateTimeFormat("en-IE", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

/**
 * "2015-05-19" -> "19 May 2015". The API sends a calendar DATE (no time), so it is read and printed in UTC:
 * a local time zone west of UTC would otherwise turn it into the 18th. Anything unexpected is shown as sent.
 */
export function formatReleaseDate(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) return isoDate;
  const [, year, month, day] = match;
  return dateFormat.format(new Date(Date.UTC(Number(year), Number(month) - 1, Number(day))));
}
