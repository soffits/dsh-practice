/**
 * Recordings: the upload of a clip (a streamed request body, written to a job folder and handed
 * to `practice attempt add --audio`) and playing a stored clip back to its owner, with byte ranges
 * (Safari will not play audio without them).
 */
import { execFile } from 'node:child_process'
import { createReadStream, createWriteStream } from 'node:fs'
import { readdir, rename, rm, stat } from 'node:fs/promises'
import { join, resolve, sep } from 'node:path'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { ATTEMPT, ITEM, LANG, LESSON, LESSON_ITEMS, SESSION, TASK, checked, fail, json, numeric } from './http.js'

/** What MediaRecorder produces in each browser, by media type; the extension is what `practice` and ffmpeg see. */
export const CLIP_TYPES = Object.freeze({
  'audio/webm': '.webm',
  'audio/ogg': '.ogg',
  'audio/mp4': '.m4a',
  'audio/x-m4a': '.m4a',
  'audio/aac': '.aac',
  'audio/mpeg': '.mp3',
  'audio/wav': '.wav',
  'audio/x-wav': '.wav',
  'audio/flac': '.flac',
  'video/webm': '.webm',
  'video/mp4': '.mp4',
  'application/ogg': '.ogg',
  'audio/mp3': '.mp3',
})
const PLAY_TYPES = Object.freeze({ '.webm': 'audio/webm', '.ogg': 'audio/ogg', '.oga': 'audio/ogg', '.opus': 'audio/ogg', '.m4a': 'audio/mp4', '.mp4': 'audio/mp4', '.aac': 'audio/aac', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.flac': 'audio/flac' })
const MIN_BYTES = 1500
const REMUX_MS = 30_000

/**
 * A browser writes WebM as a live stream, with no duration in it, so a player shows 0:00 / 0:00 and cannot seek.
 * Copying the streams into a fresh file with ffmpeg writes the duration. Where ffmpeg is missing or fails the
 * clip stays as it came: the recording is what matters, the duration is a courtesy.
 */
export async function withDuration(path, env) {
  if (!path.endsWith('.webm')) return
  const fixed = `${path}.fixed.webm`
  const ok = await new Promise(done => {
    execFile('ffmpeg', ['-v', 'error', '-y', '-i', path, '-c', 'copy', fixed], { env, timeout: REMUX_MS }, error => done(!error))
  })
  if (ok && (await stat(fixed).catch(() => null))?.size > 0) await rename(fixed, path)
  else await rm(fixed, { force: true })
}

export const mediaType = header => String(header ?? '').split(';')[0].trim().toLowerCase()

/** A transform that fails the stream once more than `limit` bytes went through. */
function capped(limit) {
  let seen = 0
  return new Transform({
    transform(chunk, _encoding, done) {
      seen += chunk.length
      done(seen > limit ? fail(413, 'That recording is too large.') : null, chunk)
    },
  })
}

/**
 * POST /api/practice/attempt/audio?lang&session&item&task&variant&minutes&lesson&lesson_items, body: the clip
 * (`lesson` makes it a repeat-after-me of a foundations lesson, `lesson_items` the item ids that were repeated).
 * @param {object} o
 * @param {ReturnType<import('./jobs.js').createJobs>} o.jobs
 * @param {number} o.maxBytes
 * @param {NodeJS.ProcessEnv} [o.env] - where `ffmpeg` is looked up
 */
export function uploadRoute({ jobs, maxBytes, env = process.env }) {
  return async (request, viewer) => {
    const query = new URL(request.url).searchParams
    const lang = checked(query.get('lang'), LANG, 'lang')
    const type = mediaType(request.headers.get('content-type'))
    const extension = CLIP_TYPES[type]
    if (extension === undefined) throw fail(415, `Cannot take ${type || 'that'} audio.`)
    const args = ['--lang', lang, 'attempt', 'add']
    const meta = { kind: 'attempt', learner: viewer.learner, lang }
    for (const [key, pattern, flag] of [['session', SESSION], ['item', ITEM], ['task', TASK], ['lesson', LESSON], ['lesson_items', LESSON_ITEMS, 'lesson-item']]) {
      const value = query.get(key)
      if (value === null || value === '') continue
      checked(value, pattern, key)
      args.push(`--${flag ?? key}`, value)
      meta[key] = value
    }
    const variant = query.get('variant')
    if (variant !== null && variant !== '') {
      if (variant !== 'full' && variant !== 'mini') throw fail(400, 'Check variant.')
      args.push('--variant', variant)
    }
    const minutes = numeric(query.get('minutes'), 'minutes', { max: 600 })
    if (minutes !== undefined) args.push('--minutes', minutes)
    if (request.body === null) throw fail(400, 'No recording was sent.')

    const prepared = await jobs.prepare(viewer.person)
    const clip = join(prepared.path, `clip${extension}`)
    try {
      await pipeline(Readable.fromWeb(request.body), capped(maxBytes), createWriteStream(clip, { mode: 0o600 }))
      if ((await stat(clip)).size < MIN_BYTES) throw fail(400, 'That recording is empty.')
      await withDuration(clip, env)
    } catch (error) {
      await jobs.dismiss(viewer.person, prepared.id)
      throw error.status ? error : fail(400, 'The recording did not arrive whole.')
    }
    args.push('--audio', `clip${extension}`)
    const id = await jobs.launch(prepared, meta, args)
    return json(202, { job: id })
  }
}

/** A file answered whole or by byte range; Safari will not play audio without ranges. */
async function serve(path, type, request, cache) {
  const { size } = await stat(path)
  const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get('range') ?? '')
  const common = { 'content-type': type, 'accept-ranges': 'bytes', 'cache-control': cache, 'x-content-type-options': 'nosniff' }
  if (range === null) return new Response(Readable.toWeb(createReadStream(path)), { status: 200, headers: { ...common, 'content-length': String(size) } })
  let start = range[1] === '' ? Math.max(0, size - Number(range[2])) : Number(range[1])
  const end = range[1] === '' || range[2] === '' ? size - 1 : Math.min(Number(range[2]), size - 1)
  if (!(start <= end) || start >= size) return new Response(null, { status: 416, headers: { 'content-range': `bytes */${size}` } })
  start = Math.max(0, start)
  return new Response(Readable.toWeb(createReadStream(path, { start, end })), { status: 206, headers: { ...common, 'content-range': `bytes ${start}-${end}/${size}`, 'content-length': String(end - start + 1) } })
}

/** GET /api/practice/attempt/clip?lang&id: the clip kept with an attempt, to its owner only. */
export function playRoute({ practice }) {
  return async (request, viewer) => {
    const query = new URL(request.url).searchParams
    const lang = checked(query.get('lang'), LANG, 'lang')
    const id = checked(query.get('id'), ATTEMPT, 'id')
    const attempt = await practice.run(viewer.learner, ['--lang', lang, 'attempt', 'show', id])
    const owned = resolve(practice.root, viewer.learner) + sep
    const folder = resolve(String(attempt.folder ?? ''))
    if (!folder.startsWith(owned)) throw fail(404, 'No recording.')
    const name = (await readdir(folder).catch(() => [])).find(file => /^audio\.[a-z0-9]+$/.test(file) && PLAY_TYPES[file.slice(5)] !== undefined)
    if (name === undefined) throw fail(404, 'No recording was kept for this attempt.')
    return serve(join(folder, name), PLAY_TYPES[name.slice(5)], request, 'private, max-age=300')
  }
}

/** The example audio the practice tool made: `audio/<hash>.<ext>` or `audio/listen-<hash>.<ext>` in a language folder. */
const EXAMPLE_CLIP = /^audio\/(?:[0-9a-f]{12}|listen-[0-9a-f]{8})\.(mp3|ogg|wav|m4a)$/

/** GET /api/practice/audio?lang&file: an example clip (named by content, so it can be cached for good), to its learner only. */
export function exampleRoute({ practice }) {
  return async (request, viewer) => {
    const query = new URL(request.url).searchParams
    const lang = checked(query.get('lang'), LANG, 'lang')
    const file = checked(query.get('file'), EXAMPLE_CLIP, 'file')
    const path = join(practice.root, viewer.learner, lang, file)
    if (!(await stat(path).then(info => info.isFile(), () => false))) throw fail(404, 'No such clip.')
    return serve(path, PLAY_TYPES[`.${file.split('.').at(-1)}`], request, 'private, max-age=31536000, immutable')
  }
}
