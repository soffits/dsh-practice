import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createChanges } from '../src/changes.js'
import { createJobs } from '../src/jobs.js'
import { createPeople } from '../src/people.js'
import { createRoutes } from '../src/routes.js'
import { fakePractice, until } from './helpers.js'

const BASE = 'https://dsh.example/api/practice'

async function setup({ env, maxClipBytes = 1024 * 1024, who = 'sub-ana' } = {}) {
  const fake = await fakePractice({ env })
  const jobs = createJobs({ dir: join(fake.dir, 'jobs'), practice: fake.practice })
  const changes = createChanges({ root: fake.root, jobsDir: join(fake.dir, 'jobs'), windowMs: 40, onJobExit: (hash, id) => jobs.reap(hash, id) })
  await changes.start()
  const current = { who }
  const people = createPeople({ people: { 'sub-ana': 'ana', 'sub-bo': 'bo', 'sub-cy': 'cy' } })
  const routes = createRoutes({
    practice: fake.practice, jobs, changes, people,
    identity: () => ({ current: () => (current.who === null ? null : { id: current.who }) }),
    settings: { owner: 'owner', learners: {} },
    strings: async () => ({ en: { title: 'x' } }),
    maxClipBytes,
  })
  const by = Object.fromEntries(routes.map(route => [`${route.methods[0]} ${route.path.replace('/api/practice', '')}`, route]))
  const call = async (key, { query = '', json, body, headers = {} } = {}) => {
    const route = by[key]
    assert.ok(route, key)
    const [method] = key.split(' ')
    const init = { method, headers }
    if (json !== undefined) { init.body = JSON.stringify(json); init.headers = { 'content-type': 'application/json' } }
    if (body !== undefined) { init.body = body; init.duplex = 'half' }
    const response = await route.fetch(new Request(`${BASE}${key.split(' ')[1]}${query}`, init))
    return { status: response.status, response, body: response.headers.get('content-type')?.includes('json') ? await response.json() : null }
  }
  return { ...fake, jobs, changes, current, call, by }
}

test('a person nobody mapped, and a person with no practice folder, see an empty state, not an error', async () => {
  const s = await setup({ who: 'sub-stranger' })
  const stranger = await s.call('GET /state')
  assert.equal(stranger.status, 200)
  assert.equal(stranger.body.learner, null)
  s.current.who = 'sub-bo'
  const fresh = await s.call('GET /state')
  assert.deepEqual(fresh.body.learner, { id: 'bo', exists: false })
  s.changes.stop()
})

test('the state of a learner with data: languages, status, the open session with its attempts', async () => {
  const s = await setup()
  const { status, body } = await s.call('GET /state', { query: '?lang=fr' })
  assert.equal(status, 200)
  assert.deepEqual(body.languages, ['en', 'fr'])
  assert.equal(body.lang, 'fr')
  assert.equal(body.session.id, 's1')
  assert.equal(body.plan, null)
  assert.equal(body.attempts[0].id, 's1-a1')
  assert.equal(body.attempts[0].analysing, null)
  const unknown = await s.call('GET /state', { query: '?lang=zz' })
  assert.equal(unknown.body.lang, 'en', 'an unknown language falls back to the first one')
  s.changes.stop()
})

test('with no open session the state carries today\'s plan', async () => {
  const s = await setup({ env: { FAKE_PRACTICE_NO_SESSION: '1' } })
  const { body } = await s.call('GET /state')
  assert.equal(body.session, null)
  assert.equal(body.plan.items[0].id, 'i1')
  s.changes.stop()
})

test('one person never reaches another person\'s learner: the learner comes from the sign-in, not from the request', async () => {
  const s = await setup()
  await s.call('GET /review', { query: '?lang=en&learner=bo' })
  s.current.who = 'sub-bo'
  await s.call('GET /review', { query: '?lang=en' })
  const learners = (await s.calls()).map(call => call.argv[1])
  assert.deepEqual(learners, ['ana', 'bo'])
  s.changes.stop()
})

test('grading checks card and rating and passes one answer as one argument', async () => {
  const s = await setup()
  assert.equal((await s.call('POST /review/grade', { json: { lang: 'en', grades: [{ card: 'c-abc123', rating: 'great' }] } })).status, 400)
  assert.equal((await s.call('POST /review/grade', { json: { lang: 'en', grades: [{ card: '--evil', rating: 'good' }] } })).status, 400)
  const ok = await s.call('POST /review/grade', { json: { lang: 'en', session: 's1', grades: [{ card: 'c-abc123', rating: 'good', answer: '-flag me' }] } })
  assert.equal(ok.status, 200)
  const [call] = (await s.calls()).slice(-1)
  assert.deepEqual(call.argv.slice(3), ['--lang', 'en', 'review', 'grade', '--session', 's1', '--answer=-flag me', 'c-abc123=good'])
  s.changes.stop()
})

test('a written answer goes in as one argument, even when it starts like a flag; empty and over-long ones are refused', async () => {
  const s = await setup()
  const sent = await s.call('POST /attempt/text', { json: { lang: 'en', session: 's1', item: 'i2', task: 'celpip.writing.1', variant: 'mini', text: '--minutes 99 hello', minutes: 7.5 } })
  assert.equal(sent.status, 200)
  const [call] = (await s.calls()).slice(-1)
  assert.deepEqual(call.argv.slice(3), ['--lang', 'en', 'attempt', 'add', '--task', 'celpip.writing.1', '--session', 's1', '--item', 'i2', '--variant', 'mini', '--minutes', '7.5', '--text=--minutes 99 hello'])
  assert.equal((await s.call('POST /attempt/text', { json: { lang: 'en', task: 'celpip.writing.1', text: '   ' } })).status, 400)
  assert.equal((await s.call('POST /attempt/text', { json: { lang: 'en', task: 'celpip.writing.1', text: 'x'.repeat(20001) } })).status, 413)
  assert.equal((await s.call('POST /attempt/text', { json: { lang: 'en; rm', task: 'celpip.writing.1', text: 'x' } })).status, 400)
  s.changes.stop()
})

test('an objective result needs whole numbers with correct not above total', async () => {
  const s = await setup()
  const bad = [{ correct: 11, total: 10 }, { correct: 1.5, total: 3 }, { correct: 2 }, { correct: -1, total: 3 }]
  for (const result of bad) assert.equal((await s.call('POST /attempt/objective', { json: { lang: 'en', task: 'celpip.reading.1', ...result } })).status, 400, JSON.stringify(result))
  assert.equal((await s.call('POST /attempt/objective', { json: { lang: 'en', task: 'celpip.reading.1', correct: 7, total: 10 } })).status, 200)
  s.changes.stop()
})

test('an upload becomes a detached job that runs attempt add on the clip, and the page is told when it ends', async () => {
  const s = await setup({ env: { FAKE_PRACTICE_SLEEP_MS: '200' } })
  const heard = []
  s.changes.listen({ learner: 'ana', hash: (await import('../src/jobs.js')).personHash('ana') }, what => heard.push(what.join()))
  const clip = Buffer.alloc(4000, 1)
  const sent = await s.call('POST /attempt/audio', { query: '?lang=en&session=s1&item=i1&task=celpip.speaking.1&variant=full&minutes=2.5', body: new Blob([clip]).stream(), headers: { 'content-type': 'audio/webm;codecs=opus' } })
  assert.equal(sent.status, 202)
  const running = (await s.call('GET /state')).body
  assert.equal(running.jobs[0].state, 'running')
  assert.equal(running.attempts[0].id, 's1-a1')
  await until(async () => (await s.jobs.list('ana')).length === 0 && (await s.calls()).some(call => call.argv.includes('--audio')))
  const add = (await s.calls()).find(call => call.argv.includes('--audio'))
  assert.deepEqual(add.argv.slice(3), ['--lang', 'en', 'attempt', 'add', '--session', 's1', '--item', 'i1', '--task', 'celpip.speaking.1', '--variant', 'full', '--minutes', '2.5', '--audio', 'clip.webm'])
  await until(() => heard.join(' ').includes('jobs'))
  s.changes.stop()
})

test('a recording of an unknown type, an empty one or one over the cap is refused and leaves nothing behind', async () => {
  const s = await setup({ maxClipBytes: 5000 })
  const send = (type, size) => s.call('POST /attempt/audio', { query: '?lang=en', body: new Blob([Buffer.alloc(size, 1)]).stream(), headers: { 'content-type': type } })
  assert.equal((await send('video/x-msvideo', 3000)).status, 415)
  assert.equal((await send('audio/webm', 100)).status, 400)
  assert.equal((await send('audio/webm', 9000)).status, 413)
  assert.deepEqual(await s.jobs.list('ana'), [])
  assert.equal((await s.call('POST /attempt/audio', { query: '?lang=en&session=../x', body: new Blob([Buffer.alloc(3000)]).stream(), headers: { 'content-type': 'audio/webm' } })).status, 400)
  const { readdir } = await import('node:fs/promises')
  const { personHash } = await import('../src/jobs.js')
  assert.deepEqual(await readdir(join(s.dir, 'jobs', personHash('ana'))), [], 'no job folder is left')
  s.changes.stop()
})

test('a stored clip plays back to its owner with byte ranges, and only when one was kept', async () => {
  const s = await setup()
  const folder = join(s.root, 'ana', 'en', 'attempts', 's1-a1')
  await mkdir(folder, { recursive: true })
  const none = await s.call('GET /attempt/clip', { query: '?lang=en&id=s1-a1' })
  assert.equal(none.status, 404)
  await writeFile(join(folder, 'audio.m4a'), Buffer.from('0123456789'))
  const whole = await s.call('GET /attempt/clip', { query: '?lang=en&id=s1-a1' })
  assert.equal(whole.status, 200)
  assert.equal(whole.response.headers.get('content-type'), 'audio/mp4')
  assert.equal(whole.response.headers.get('accept-ranges'), 'bytes')
  const part = await s.call('GET /attempt/clip', { query: '?lang=en&id=s1-a1', headers: { range: 'bytes=2-4' } })
  assert.equal(part.status, 206)
  assert.equal(part.response.headers.get('content-range'), 'bytes 2-4/10')
  assert.equal(Buffer.from(await part.response.arrayBuffer()).toString(), '234')
  const tail = await s.call('GET /attempt/clip', { query: '?lang=en&id=s1-a1', headers: { range: 'bytes=-3' } })
  assert.equal(Buffer.from(await tail.response.arrayBuffer()).toString(), '789')
  assert.equal((await s.call('GET /attempt/clip', { query: '?lang=en&id=s1-a1', headers: { range: 'bytes=50-' } })).status, 416)
  s.changes.stop()
})

test('the events stream tells the page when its learner\'s data changes', async () => {
  const s = await setup()
  const { response } = await s.call('GET /events')
  assert.equal(response.headers.get('content-type'), 'text/event-stream; charset=utf-8')
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let text = ''
  await writeFile(join(s.root, 'ana', 'en', 'deck.jsonl'), 'x')
  await until(async () => {
    const { value } = await reader.read()
    text += decoder.decode(value)
    return text.includes('"type":"change"')
  })
  assert.match(text, /"what":\["data"\]/)
  await reader.cancel()
  s.changes.stop()
})

test('the words come as tables by language tag', async () => {
  const s = await setup()
  const { body } = await s.call('GET /words')
  assert.equal(body.tables.en.title, 'x')
  s.changes.stop()
})

test('every route has its own path: DSH refuses one path registered twice, whatever the method', async () => {
  const s = await setup()
  const { webRoutes } = await import('../src/web.js')
  const paths = [...Object.values(s.by), ...webRoutes(new URL('../web/', import.meta.url).pathname)].map(route => route.path)
  assert.equal(new Set(paths).size, paths.length)
  s.changes.stop()
})

test('lessons: the list, one lesson, the whole-lesson file and marking it done go through the practice command', async () => {
  const s = await setup()
  const listed = await s.call('GET /lessons', { query: '?lang=fr' })
  assert.equal(listed.status, 200)
  assert.deepEqual(listed.body.lessons.map(lesson => lesson.done), [true, false])
  const shown = await s.call('GET /lesson', { query: '?lang=fr&id=fr.a.2' })
  assert.equal(shown.body.items[0].audio[0].file, 'audio/0123456789ab.mp3')
  const next = await s.call('GET /lesson', { query: '?lang=fr' })
  assert.equal(next.status, 200)
  assert.equal((await s.call('GET /lesson', { query: '?lang=fr&id=../x' })).status, 400)
  const listen = await s.call('GET /lesson/listen', { query: '?lang=fr&id=fr.a.2' })
  assert.deepEqual(listen.body, { lesson: 'fr.a.2', file: 'audio/listen-0123abcd.mp3', seconds: 12 })
  assert.equal((await s.call('GET /lesson/listen', { query: '?lang=fr' })).status, 400)
  const done = await s.call('POST /lesson/done', { json: { lang: 'fr', lesson: 'fr.a.2', session: 's1', minutes: 6 } })
  assert.equal(done.body.cards_added, 3)
  const calls = (await s.calls()).map(call => call.argv.slice(3))
  assert.deepEqual(calls.at(-1), ['--lang', 'fr', 'lesson', 'done', 'fr.a.2', '--session', 's1', '--minutes', '6'])
  assert.deepEqual(calls.find(argv => argv.includes('show') && !argv.includes('fr.a.2')), ['--lang', 'fr', 'lesson', 'show'])
  assert.equal((await s.call('POST /lesson/done', { json: { lang: 'fr', lesson: 'x y' } })).status, 400)
  s.changes.stop()
})

test('a repeat-after-me recording carries its lesson and items to the command', async () => {
  const s = await setup()
  const clip = Buffer.alloc(3000, 1)
  const sent = await s.call('POST /attempt/audio', { query: '?lang=fr&session=s1&item=i2&lesson=fr.sounds.1&lesson_items=1,2,3&minutes=1', body: new Blob([clip]).stream(), headers: { 'content-type': 'audio/webm' } })
  assert.equal(sent.status, 202)
  await until(async () => (await s.calls()).some(call => call.argv.includes('--audio')))
  const add = (await s.calls()).find(call => call.argv.includes('--audio'))
  assert.deepEqual(add.argv.slice(3), ['--lang', 'fr', 'attempt', 'add', '--session', 's1', '--item', 'i2', '--lesson', 'fr.sounds.1', '--lesson-item', '1,2,3', '--minutes', '1', '--audio', 'clip.webm'])
  const bad = await s.call('POST /attempt/audio', { query: '?lang=fr&lesson_items=1;2', body: new Blob([clip]).stream(), headers: { 'content-type': 'audio/webm' } })
  assert.equal(bad.status, 400)
  s.changes.stop()
})

test('example clips are served from the learner\'s own audio folder only, by byte range too', async () => {
  const s = await setup()
  await mkdir(join(s.root, 'ana', 'fr', 'audio'), { recursive: true })
  await mkdir(join(s.root, 'bo', 'fr', 'audio'), { recursive: true })
  await writeFile(join(s.root, 'ana', 'fr', 'audio', '0123456789ab.mp3'), 'ID3-0123456789')
  await writeFile(join(s.root, 'bo', 'fr', 'audio', 'aaaaaaaaaaaa.mp3'), 'secret')
  const whole = await s.call('GET /audio', { query: '?lang=fr&file=audio/0123456789ab.mp3' })
  assert.equal(whole.status, 200)
  assert.equal(whole.response.headers.get('content-type'), 'audio/mpeg')
  assert.match(whole.response.headers.get('cache-control'), /immutable/)
  assert.equal(await whole.response.text(), 'ID3-0123456789')
  const part = await s.call('GET /audio', { query: '?lang=fr&file=audio/0123456789ab.mp3', headers: { range: 'bytes=0-2' } })
  assert.equal(part.status, 206)
  assert.equal(await part.response.text(), 'ID3')
  for (const file of ['audio/aaaaaaaaaaaa.mp3', 'audio/0123456789ff.mp3']) assert.equal((await s.call('GET /audio', { query: `?lang=fr&file=${file}` })).status, 404, 'someone else\'s clip or none')
  for (const file of ['../bo/fr/audio/aaaaaaaaaaaa.mp3', 'audio/../learner.json', 'audio/0123456789ab.exe', 'learner.json']) assert.equal((await s.call('GET /audio', { query: `?lang=fr&file=${encodeURIComponent(file)}` })).status, 400, file)
  s.changes.stop()
})

test('the words route is never kept by the browser, so a page swapped by an update fetches the new words', async () => {
  const s = await setup()
  try {
    const { status, response } = await s.call('GET /words')
    assert.equal(status, 200)
    assert.match(response.headers.get('cache-control'), /no-cache/)
    assert.doesNotMatch(response.headers.get('cache-control'), /max-age/)
  } finally {
    s.changes.stop()
  }
})
