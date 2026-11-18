/**
 * Reads that may land out of order: each one is shown when it lands unless a newer one already was, so a slow
 * earlier read never hides a newer answer and a newer read never makes the page wait for an older one.
 */
export function newestFirst() {
  let issued = 0
  let shown = 0
  return {
    /** A ticket for a read starting now: `fresh()` says whether its answer may still be shown, `show()` marks it shown. */
    start() {
      const seq = ++issued
      return { fresh: () => seq >= shown, show: () => { shown = seq } }
    },
  }
}
