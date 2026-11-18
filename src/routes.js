/**
 * The page's API: exact Fetch routes under DSH's `/api`, so DSH admits the browser first and the
 * sign-in plugin's `requestIdentity` sees the request. Every answer is decided here per request
 * and comes from the `practice` command, one call per view where the command can answer it at once;
 * nothing is kept between requests.
 *
 *   GET  /api/practice/state?lang=        who, languages, status, the open session (or today's plan), its attempts, running jobs (`overview`)
 *   GET  /api/practice/plan?lang=&minutes=  today's plan for a time budget
 *   GET  /api/practice/review?lang=       due cards, with answers (the page hides them until asked)
 *   GET  /api/practice/progress?lang=     progress, facts, recent sessions and attempts (`progress --recent`)
 *   GET  /api/practice/lessons?lang=      the foundations lessons with their state (`lesson list`)
 *   GET  /api/practice/lesson?lang=&id=   one lesson with its items and clips (`lesson show`; the next lesson without an id)
 *   GET  /api/practice/lesson/listen?lang=&id=  the lesson as one listen-and-repeat file: { file }
 *   POST /api/practice/lesson/done        { lang, lesson, session?, minutes? }
 *   GET  /api/practice/audio?lang=&file=  an example clip from the practice tool, with byte ranges
 *   POST /api/practice/session/start      { lang, minutes?, focus? }
 *   POST /api/practice/session/finish     { lang, session, minutes? }
 *   POST /api/practice/session/abandon    { lang, session }
 *   POST /api/practice/review/grade       { lang, session?, grades: [{ card, rating, answer? }] }
 *   POST /api/practice/attempt/text       { lang, session?, item?, task, variant?, text, minutes? }
 *   POST /api/practice/attempt/objective  { lang, session?, item?, task, variant?, correct, total, minutes? }
 *   POST /api/practice/attempt/audio      query (lang, session, item, task, variant, minutes, lesson, lesson_items) + the clip as the body: starts a job, answers { job }
 *   POST /api/practice/attempt/analyze    { lang, attempt }: analysis again, as a job
 *   GET  /api/practice/attempt/clip       ?lang&id: the stored clip, with byte ranges
 *   POST /api/practice/job/dismiss        { id }
 *   GET  /api/practice/events             text/event-stream: a notice whenever the learner's data or jobs change
 *   GET  /api/practice/words              the page's words by language tag
 */
import { personHash } from './jobs.js'
import { exampleRoute, playRoute, uploadRoute } from './audio.js'
import { ATTEMPT, CARD, ITEM, LANG, LESSON, RATINGS, SESSION, TASK, body, checked, fail, get, guard, json, numeric, post } from './http.js'

export const PREFIX = '/api/practice'
const HEARTBEAT_MS = 25 * 1000
const MAX_TEXT = 20000
const RECENT = 6
const RECENT_SESSIONS = 5
const REVIEW_BATCH = 40
const SKILLS = ['listening', 'reading', 'writing', 'speaking']

/**
 * @param {object} o
 * @param {ReturnType<import('./practice.js').createPractice>} o.practice
 * @param {ReturnType<import('./jobs.js').createJobs>} o.jobs
 * @param {ReturnType<import('./changes.js').createChanges>} o.changes
 * @param {ReturnType<import('./people.js').createPeople>} o.people
 * @param {() => any} o.identity - the requestIdentity service now, if any
 * @param {{ owner: string, learners: Record<string, string> }} o.settings
 * @param {() => Promise<object>} o.strings
 * @param {number} o.maxClipBytes
 * @param {(error: Error) => void} [o.log]
 */
export function createRoutes({ practice, jobs, changes, people, identity, settings, strings, maxClipBytes, log }) {
  const secured = (fn, options) => guard({ people, identity, settings, log }, fn, options)
  const empty = viewer => ({ me: { person: viewer.person, name: viewer.name }, learner: null })
  const call = (viewer, lang, args) => practice.run(viewer.learner, ['--lang', lang, ...args])
  const langOf = request => checked(new URL(request.url).searchParams.get('lang') ?? '', LANG, 'lang')

  /** Each attempt with whether its analysis is under way, interrupted (pending with no job running) or not pending. */
  const marked = (attempts, running) => attempts.map(attempt => ({ ...attempt, analysing: attempt.speech?.status === 'pending' ? (running ? 'running' : 'interrupted') : null }))
  const runningIn = (jobsOfPerson, lang) => jobsOfPerson.filter(job => job.lang === lang)

  const state = secured(async (request, viewer) => {
    const wanted = new URL(request.url).searchParams.get('lang') ?? ''
    const me = { person: viewer.person, name: viewer.name }
    if (!(await practice.exists(viewer.learner))) return json(200, { me, learner: { id: viewer.learner, exists: false } })
    const [overview, jobsOfPerson] = await Promise.all([
      practice.run(viewer.learner, [...(LANG.test(wanted) ? ['--lang', wanted] : []), 'overview']),
      jobs.list(viewer.person),
    ])
    const { languages, lang, status, session, plan, attempts } = overview
    if (lang === null) return json(200, { me, learner: { id: viewer.learner, exists: true }, languages })
    const running = runningIn(jobsOfPerson, lang)
    return json(200, { me, learner: { id: viewer.learner, exists: true }, languages, lang, status, session, plan, attempts: marked(attempts, running.some(job => job.state === 'running')), jobs: running })
  }, { empty })

  const plan = secured(async (request, viewer) => {
    const query = new URL(request.url).searchParams
    const minutes = numeric(query.get('minutes'), 'minutes', { min: 1, max: 240 })
    return json(200, await call(viewer, langOf(request), ['plan', ...(minutes ? ['--minutes', minutes] : [])]))
  })

  const review = secured(async (request, viewer) => json(200, await call(viewer, langOf(request), ['review', 'due', '--limit', REVIEW_BATCH])))

  const progress = secured(async (request, viewer) => {
    const lang = langOf(request)
    const [overall, jobsOfPerson] = await Promise.all([call(viewer, lang, ['progress', '--recent', RECENT]), jobs.list(viewer.person)])
    const { facts, recent, ...rest } = overall
    const running = runningIn(jobsOfPerson, lang).some(job => job.state === 'running')
    return json(200, { progress: rest, facts: facts ?? null, sessions: recent.sessions.slice(0, RECENT_SESSIONS), recent: marked(recent.attempts, running) })
  })

  const lessons = secured(async (request, viewer) => json(200, await call(viewer, langOf(request), ['lesson', 'list'])))

  const lesson = secured(async (request, viewer) => {
    const id = new URL(request.url).searchParams.get('id')
    return json(200, await call(viewer, langOf(request), ['lesson', 'show', ...(id ? [checked(id, LESSON, 'id')] : [])]))
  })

  const listen = secured(async (request, viewer) => {
    const track = await call(viewer, langOf(request), ['lesson', 'audio', checked(new URL(request.url).searchParams.get('id'), LESSON, 'id')])
    return json(200, { lesson: track.lesson, file: track.file, seconds: track.seconds })
  })

  const lessonDone = secured(async (request, viewer) => {
    const value = await body(request)
    const minutes = numeric(value.minutes, 'minutes', { max: 600 })
    const args = ['lesson', 'done', checked(value.lesson, LESSON, 'lesson')]
    if (value.session) args.push('--session', checked(value.session, SESSION, 'session'))
    if (minutes) args.push('--minutes', minutes)
    return json(200, await call(viewer, checked(value.lang, LANG, 'lang'), args))
  })

  const start = secured(async (request, viewer) => {
    const value = await body(request)
    const lang = checked(value.lang, LANG, 'lang')
    const minutes = numeric(value.minutes, 'minutes', { min: 1, max: 240 })
    const args = ['session', 'start']
    if (minutes) args.push('--minutes', minutes)
    if (value.focus !== undefined && value.focus !== null && value.focus !== '') {
      if (!SKILLS.includes(value.focus)) throw fail(400, 'Check focus.')
      args.push('--focus', value.focus)
    }
    return json(200, await call(viewer, lang, args))
  })

  const finish = secured(async (request, viewer) => {
    const value = await body(request)
    const minutes = numeric(value.minutes, 'minutes', { min: 0, max: 600 })
    return json(200, await call(viewer, checked(value.lang, LANG, 'lang'), ['session', 'finish', checked(value.session, SESSION, 'session'), ...(minutes ? ['--minutes', minutes] : [])]))
  })

  const abandon = secured(async (request, viewer) => {
    const value = await body(request)
    return json(200, await call(viewer, checked(value.lang, LANG, 'lang'), ['session', 'abandon', checked(value.session, SESSION, 'session')]))
  })

  const grade = secured(async (request, viewer) => {
    const value = await body(request)
    const lang = checked(value.lang, LANG, 'lang')
    if (!Array.isArray(value.grades) || value.grades.length === 0 || value.grades.length > REVIEW_BATCH) throw fail(400, 'Send grades.')
    const grades = value.grades.map(row => {
      if (!RATINGS.includes(row?.rating)) throw fail(400, 'Check rating.')
      return `${checked(row.card, CARD, 'card')}=${row.rating}`
    })
    const args = ['review', 'grade']
    if (value.session) args.push('--session', checked(value.session, SESSION, 'session'))
    if (grades.length === 1 && typeof value.grades[0].answer === 'string' && value.grades[0].answer.trim() !== '') args.push(`--answer=${value.grades[0].answer.slice(0, 500)}`)
    return json(200, await call(viewer, lang, [...args, ...grades]))
  })

  /** The arguments shared by the text and objective attempts: where it belongs and how long it took. */
  function placement(value) {
    const args = ['attempt', 'add', '--task', checked(value.task, TASK, 'task')]
    if (value.session) args.push('--session', checked(value.session, SESSION, 'session'))
    if (value.item) args.push('--item', checked(value.item, ITEM, 'item'))
    if (value.variant) {
      if (value.variant !== 'full' && value.variant !== 'mini') throw fail(400, 'Check variant.')
      args.push('--variant', value.variant)
    }
    const minutes = numeric(value.minutes, 'minutes', { max: 600 })
    if (minutes !== undefined) args.push('--minutes', minutes)
    return args
  }

  const text = secured(async (request, viewer) => {
    const value = await body(request)
    const answer = typeof value.text === 'string' ? value.text.trim() : ''
    if (answer === '') throw fail(400, 'An empty answer says nothing.')
    if (answer.length > MAX_TEXT) throw fail(413, 'That answer is too long.')
    return json(200, await call(viewer, checked(value.lang, LANG, 'lang'), [...placement(value), `--text=${answer}`]))
  })

  const objective = secured(async (request, viewer) => {
    const value = await body(request)
    const correct = numeric(value.correct, 'correct', { max: 1000 })
    const total = numeric(value.total, 'total', { min: 1, max: 1000 })
    if (correct === undefined || total === undefined || !Number.isInteger(correct) || !Number.isInteger(total) || correct > total) throw fail(400, 'Check correct and total.')
    return json(200, await call(viewer, checked(value.lang, LANG, 'lang'), [...placement(value), '--correct', correct, '--total', total]))
  })

  const upload = secured(uploadRoute({ jobs, maxBytes: maxClipBytes, env: practice.env }))
  const play = secured(playRoute({ practice }))
  const example = secured(exampleRoute({ practice }))

  const analyze = secured(async (request, viewer) => {
    const value = await body(request)
    const lang = checked(value.lang, LANG, 'lang')
    const attempt = checked(value.attempt, ATTEMPT, 'attempt')
    const prepared = await jobs.prepare(viewer.person)
    const id = await jobs.launch(prepared, { kind: 'analyze', learner: viewer.learner, lang, attempt }, ['--lang', lang, 'attempt', 'analyze', attempt])
    return json(202, { job: id })
  })

  const dismiss = secured(async (request, viewer) => {
    const value = await body(request)
    return json(200, { ok: await jobs.dismiss(viewer.person, String(value.id ?? '')) })
  })

  const events = secured(async (request, viewer) => {
    const encoder = new TextEncoder()
    let stop = () => {}
    const stream = new ReadableStream({
      start(controller) {
        const write = chunk => {
          try {
            controller.enqueue(encoder.encode(chunk))
          } catch {
            stop()
          }
        }
        write('retry: 5000\n: open\n\n')
        changes.ensure().catch(error => log?.(error))
        const unlisten = changes.listen({ learner: viewer.learner, hash: personHash(viewer.person) }, what => write(`data: ${JSON.stringify({ type: 'change', what, at: new Date().toISOString() })}\n\n`))
        const beat = setInterval(() => write(': beat\n\n'), HEARTBEAT_MS)
        stop = () => { unlisten(); clearInterval(beat) }
        request.signal?.addEventListener('abort', () => {
          stop()
          try { controller.close() } catch { /* already closed */ }
        }, { once: true })
      },
      cancel() { stop() },
    })
    return new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'private, no-cache, no-transform', 'x-accel-buffering': 'no', 'x-content-type-options': 'nosniff' } })
  })

  const words = async () => {
    try {
      return json(200, { tables: await strings() }, { 'cache-control': 'private, no-cache' })
    } catch (error) {
      log?.(error)
      return json(500, { error: 'The words are not available.' })
    }
  }

  const streaming = (path, fetch) => ({ path, methods: ['POST'], requestBody: 'streaming', fetch })
  return [
    get(`${PREFIX}/state`, state),
    get(`${PREFIX}/plan`, plan),
    get(`${PREFIX}/review`, review),
    get(`${PREFIX}/progress`, progress),
    get(`${PREFIX}/lessons`, lessons),
    get(`${PREFIX}/lesson`, lesson),
    get(`${PREFIX}/lesson/listen`, listen),
    post(`${PREFIX}/lesson/done`, lessonDone),
    get(`${PREFIX}/audio`, example),
    post(`${PREFIX}/session/start`, start),
    post(`${PREFIX}/session/finish`, finish),
    post(`${PREFIX}/session/abandon`, abandon),
    post(`${PREFIX}/review/grade`, grade),
    post(`${PREFIX}/attempt/text`, text),
    post(`${PREFIX}/attempt/objective`, objective),
    streaming(`${PREFIX}/attempt/audio`, upload),
    post(`${PREFIX}/attempt/analyze`, analyze),
    get(`${PREFIX}/attempt/clip`, play),
    post(`${PREFIX}/job/dismiss`, dismiss),
    get(`${PREFIX}/events`, events),
    get(`${PREFIX}/words`, words),
  ]
}
