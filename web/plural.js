/** Counted words in the page's language: `<key>.<one|few|many|other…>` entries, chosen by the language's own plural rules (CLDR), `.other` always present. No React, so Node tests can load it. */

/**
 * @param {((key: string, vars?: object) => string) & { language?: string }} t
 * @param {string} key - the base key, such as `status.due`
 * @param {number} n
 */
export function counted(t, key, n, vars = {}) {
  let category = 'other'
  try { category = new Intl.PluralRules(t.language || 'en').select(n) } catch { /* an unknown tag: the general form */ }
  const form = `${key}.${category}`
  const text = category === 'other' ? form : t(form, { ...vars, n })
  return text === form || !text ? t(`${key}.other`, { ...vars, n }) : text
}

/** The base keys of counted entries: `a.b.one` and `a.b.other` are both `a.b`. */
export const PLURAL_FORM = /\.(zero|one|two|few|many|other)$/
