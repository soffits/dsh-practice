/** Plain formatting for the page: durations, counts, labels for numbers. No React, so Node tests can load it. */

export const clock = seconds => {
  const whole = Math.max(0, Math.ceil(seconds))
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`
}

/** "1.5" for 1.5, "12" for 12.0: a short number for chips. */
export const short = (value, digits = 1) => (Number.isFinite(value) ? String(Number(value.toFixed(digits))) : '')

/** What the page tells about a measurement, by metric name: its label key, unit key, digits and the order they are shown in. */
export const METRICS = Object.freeze({
  speech_rate_wpm: { unit: 'wpm', digits: 0 },
  articulation_rate_syll_per_s: { unit: 'syll/s', digits: 1 },
  phonation_time_ratio: { percent: true },
  mean_length_of_run_words: { unit: 'words', digits: 1 },
  pauses_per_min: { unit: '/min', digits: 1 },
  long_pauses_per_min: { unit: '/min', digits: 1 },
  longest_pause_s: { unit: 's', digits: 1 },
  fillers_per_100_words: { unit: '/100', digits: 1 },
  response_time_share: { percent: true },
  words: { digits: 0 },
  duration_s: { clock: true },
  median_sentence_range_st: { unit: 'st', digits: 1 },
  flat_sentence_share: { percent: true },
  asr_confidence_mean: { percent: true },
  phone_error_rate: { percent: true },
  repeated_sound_patterns: { digits: 0 },
  errors_per_100_words: { unit: '/100', digits: 1 },
  accuracy: { percent: true },
})

/** The speaking signals shown as a strip on an attempt, then in the trends. */
export const SPEAKING_SIGNALS = Object.freeze(['duration_s', 'words', 'speech_rate_wpm', 'pauses_per_min', 'fillers_per_100_words', 'phonation_time_ratio', 'mean_length_of_run_words', 'response_time_share'])
export const TREND_SIGNALS = Object.freeze(['speech_rate_wpm', 'pauses_per_min', 'fillers_per_100_words', 'phonation_time_ratio', 'mean_length_of_run_words', 'articulation_rate_syll_per_s', 'median_sentence_range_st'])

/** A metric value as text: "128 wpm", "62%", "1:12". Unknown metrics come back as the bare number. */
export function metricText(name, value) {
  if (!Number.isFinite(value)) return ''
  const spec = METRICS[name] ?? {}
  if (spec.clock) return clock(value)
  if (spec.percent) return `${Math.round(value * 100)}%`
  return `${short(value, spec.digits ?? 1)}${spec.unit ? ` ${spec.unit}` : ''}`
}

/** The newest value of each series, for a sparkline's number. */
export const lastValue = series => (series?.length ? series.at(-1).value : null)

/** The first time-like field as a Date, or null. */
export const when = value => {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

/** Number of finished items over all items of a session plan. */
export function sessionProgress(session) {
  const items = session?.plan?.items ?? []
  return { done: items.filter(item => item.state === 'done').length, total: items.length }
}

/** The item to work on next: the first one not done. */
export const nextItem = session => (session?.plan?.items ?? []).find(item => item.state !== 'done') ?? null

/** Minutes shown on a button or chip: 5 -> "5 min" with the unit word given by the caller. */
export const minutesOf = item => item?.minutes ?? null

/** Count the units of a text the way the practice tool does for the word limit hint: words for spaced scripts, characters for CJK. */
export function countUnits(text) {
  const cjk = text.match(/[㐀-鿿぀-ヿ가-힯]/g)?.length ?? 0
  const words = text.replace(/[㐀-鿿぀-ヿ가-힯]/g, ' ').match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu)?.length ?? 0
  return words + cjk
}
