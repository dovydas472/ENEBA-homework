/** Joins CSS class names and skips the empty ones: cx(styles.button, loading && styles.loading, className). */
export function cx(...names: (string | false | null | undefined)[]): string {
  return names.filter(Boolean).join(" ");
}
