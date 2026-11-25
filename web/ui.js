/**
 * Shared pieces of the practice page: React and DSH's components handed over by client.js, small
 * icons for what the kit has none of, buttons, notices and the "Ask the tutor" starter.
 */
export let React
export let h
/** DSH's own components (@deepseek-ai/dsh-client-ui-primitives). */
export let P
/** The shared kit (@soffits/dsh-plugin-sdk, ctx.uiKit). */
export let K

const SOURCE = '@soffits/dsh-practice'
let actions = null
let sourceName = () => ''

/** React's hooks, looked up at call time: the page's React arrives through `init`, after these modules were imported. */
export const useState = (...args) => React.useState(...args)
export const useEffect = (...args) => React.useEffect(...args)
export const useRef = (...args) => React.useRef(...args)
export const useCallback = (...args) => React.useCallback(...args)
export const useMemo = (...args) => React.useMemo(...args)

/** Called once by client.js before any view renders. */
export function init(react, { primitives, kit }) {
  React = react
  h = react.createElement
  P = primitives
  K = kit
}

/** The actions service (ui-actions) for "Ask", or null without it. */
export function setActions(value, name) {
  actions = value
  sourceName = name
}
export const canAsk = () => actions !== null

/**
 * Open a new conversation about something, attached to the message box as a card the person writes beside.
 * @param {{ title: string, lines?: string[], context?: object }} about
 * @param {string} [prompt] - the start of the person's own message
 */
export function ask({ title, lines = [], context }, prompt = '') {
  return actions?.chat({ source: SOURCE, sourceName: sourceName(), title, lines: lines.filter(Boolean), context }, { prompt })
}

/** DSH's Button, compact on a desk and 40 px tall on a touch screen. */
export const Btn = ({ variant = 'outline', size = 'sm', className, ...rest }) => h(P.Button, { variant, size, className: className ? `${K.TOUCH} ${className}` : K.TOUCH, ...rest })

const stroke = { stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round', fill: 'none' }
const svg = (size, ...children) => h('svg', { width: size, height: size, viewBox: '0 0 16 16', 'aria-hidden': true, focusable: 'false' }, ...children)

/** Small drawings the kit's icon set lacks. */
export const Glyph = {
  mic: ({ size = 16 }) => svg(size, h('rect', { x: 5.5, y: 1.5, width: 5, height: 8, rx: 2.5, ...stroke }), h('path', { d: 'M3 7.5a5 5 0 0 0 10 0M8 12.5v2M5.5 14.5h5', ...stroke })),
  stop: ({ size = 16 }) => svg(size, h('rect', { x: 4, y: 4, width: 8, height: 8, rx: 1.6, fill: 'currentColor' })),
  record: ({ size = 16 }) => svg(size, h('circle', { cx: 8, cy: 8, r: 4.5, fill: 'currentColor' })),
  check: ({ size = 16 }) => svg(size, h('path', { d: 'm3.5 8.5 3 3 6-7', ...stroke })),
  pen: ({ size = 16 }) => svg(size, h('path', { d: 'M3 13l.6-2.6 7-7a1.4 1.4 0 0 1 2 2l-7 7L3 13ZM9.6 4.6l2 2', ...stroke })),
  send: ({ size = 16 }) => svg(size, h('path', { d: 'm2.5 8 11-5-4.5 10-1.8-4.2L2.5 8Z', ...stroke })),
  chat: ({ size = 16 }) => svg(size, h('path', { d: 'M3 4.5A1.5 1.5 0 0 1 4.5 3h7A1.5 1.5 0 0 1 13 4.5v5a1.5 1.5 0 0 1-1.5 1.5H7l-3 2.5V11h.5A1.5 1.5 0 0 1 3 9.5Z', ...stroke })),
  play: ({ size = 16 }) => svg(size, h('path', { d: 'M5 3.2v9.6L13 8Z', fill: 'currentColor' })),
  speaker: ({ size = 16 }) => svg(size, h('path', { d: 'M2.5 6.2h2.6L8.5 3.4v9.2L5.1 9.8H2.5Z', ...stroke }), h('path', { d: 'M11 5.6a3.4 3.4 0 0 1 0 4.8M12.6 3.9a5.8 5.8 0 0 1 0 8.2', ...stroke })),
  file: ({ size = 16 }) => svg(size, h('path', { d: 'M4 2h5l3 3v9H4zM9 2v3h3', ...stroke })),
}

/** The tile icon for a skill: a drawing, or a kit icon by name. */
export const TILE = Object.freeze({ sm: 32, md: 38, lg: 52 })
export function SkillTile({ skill, size = 'md', tone }) {
  const spec = { speaking: [null, 'accent'], writing: ['notebook-pen', 'violet'], reading: ['book-open', 'ok'], listening: ['headphones', 'warn'], review: ['rotate-ccw', 'accent'], lesson: ['headphones', 'accent'] }[skill] ?? ['sparkles', 'muted']
  const pixels = TILE[size] ?? TILE.md
  // The kit's tile draws its own icons by name; the microphone is ours, on the same tile surface.
  if (skill === 'speaking') return h('span', { className: 'uk-tile', style: { '--uk-size': `${pixels}px`, color: K.toneColor(tone ?? spec[1]) }, 'aria-hidden': true }, h(Glyph.mic, { size: Math.round(pixels * 0.5) }))
  return h(K.Tile, { icon: spec[0], tone: tone ?? spec[1], size: pixels })
}

/** One line of failure text. */
export const Problem = ({ children }) => (children ? h('p', { className: 'pr-error', role: 'alert' }, children) : null)

/** A quiet page-sized message with an icon and optional actions. */
export function Empty({ icon = 'sparkles', title, children }) {
  return h('div', { className: 'pr-empty', role: 'status' },
    h(K.Tile, { icon, tone: 'muted', size: TILE.lg }),
    title && h('h2', null, title),
    children && h('p', null, children))
}

/** A section with a small heading. */
export const Section = ({ title, aside, children, className }) => h('section', { className: `pr-section${className ? ` ${className}` : ''}` },
  (title || aside) && h('div', { className: 'pr-sectionHead' }, title && h('h2', null, title), aside),
  children)

/** A number with a label under it. */
export const Stat = ({ value, label, tone }) => h('div', { className: 'pr-stat', 'data-tone': tone },
  h('span', { className: 'pr-statValue' }, value),
  h('span', { className: 'pr-statLabel' }, label))

/** A responsive flag: true on a phone-sized viewport. */
export function useNarrow(query = '(max-width: 760px)') {
  const [narrow, setNarrow] = React.useState(() => matchMedia(query).matches)
  React.useEffect(() => {
    const list = matchMedia(query)
    const on = () => setNarrow(list.matches)
    list.addEventListener('change', on)
    return () => list.removeEventListener('change', on)
  }, [query])
  return narrow
}
