/** Playing the example clips the practice tool made: one clip at a time, started only by a press. */
import { url } from './api.js'
import { Btn, Glyph, h, useEffect, useRef, useState } from './ui.js'

export const clipUrl = (lang, file) => url('audio', { lang, file })

let playing = null

/** Stop whatever is playing, then play `source`; resolves when it ends (or was stopped). */
export function play(source) {
  playing?.stop()
  const element = new Audio(source)
  let finish = () => {}
  const ended = new Promise(resolve => { finish = resolve })
  const stop = () => { element.pause(); finish(); if (playing?.element === element) playing = null }
  playing = { element, stop }
  element.addEventListener('ended', stop)
  element.addEventListener('error', stop)
  return { element, stop, ended, started: element.play().catch(() => { stop() }) }
}

/** Stop the clip when the part of the page that started it goes away. */
export const useStopOnUnmount = () => {
  const mine = useRef(null)
  useEffect(() => () => { mine.current?.stop() }, [])
  return mine
}

/**
 * A button that plays one clip and shows that it is playing. `file` is relative to the language folder; a missing file
 * (audio not built) shows a disabled button.
 */
export function PlayButton({ lang, file, label, text, autoPlay = false, size = 'sm', variant = 'outline', className }) {
  const [on, setOn] = useState(false)
  const handle = useStopOnUnmount()
  const press = () => {
    if (on) { handle.current?.stop(); return }
    const started = play(clipUrl(lang, file))
    handle.current = started
    setOn(true)
    started.ended.then(() => setOn(false))
  }
  useEffect(() => { if (autoPlay && file) press() }, [file, autoPlay])
  return h(Btn, { variant, size, className, disabled: !file, onClick: press, 'aria-pressed': on, 'aria-label': text ? `${label}: ${text}` : label },
    h(Glyph.speaker, { size: 14 }), label)
}

/** The normal and slow clips of one spoken text. */
export function Clip({ lang, audio, t, big = false }) {
  return h('span', { className: `pr-clip${big ? ' pr-clipBig' : ''}` },
    h(PlayButton, { lang, file: audio.file, text: audio.text, label: t(audio.slow_file ? 'lesson.normal' : 'review.play'), size: big ? 'md' : 'sm', variant: big ? 'primary' : 'outline' }),
    audio.slow_file !== null && audio.slow_file !== undefined && h(PlayButton, { lang, file: audio.slow_file, text: audio.text, label: t('lesson.slow'), size: big ? 'md' : 'sm' }))
}
