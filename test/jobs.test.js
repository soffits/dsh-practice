import { test } from 'node:test'
import assert from 'node:assert/strict'
import { access, writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { createJobs, personHash } from '../src/jobs.js'
import { fakePractice, until } from './helpers.js'

const exists = path => access(path).then(() => true, () => false)

async function setup(env) {
  const fake = await fakePractice({ env })
  const jobs = createJobs({ dir: join(fake.dir, 'jobs'), practice: fake.practice })
  return { ...fake, jobs }
}

test('a job runs detached in its own folder, shows as running, and is removed when it succeeded', async () => {
  const { jobs, calls, dir } = await setup({ FAKE_PRACTICE_SLEEP_MS: '300' })
  const prepared = await jobs.prepare('ana')
  await writeFile(join(prepared.path, 'clip.webm'), 'x'.repeat(2000))
  const id = await jobs.launch(prepared, { kind: 'attempt', learner: 'ana', lang: 'en', session: 's1' }, ['--lang', 'en', 'attempt', 'add', '--audio', 'clip.webm'])
  const [running] = await jobs.list('ana')
  assert.deepEqual([running.id, running.state, running.lang, running.session], [id, 'running', 'en', 's1'])
  assert.deepEqual(await jobs.list('bo'), [], 'another person sees nothing')
  await until(() => exists(join(prepared.path, 'exit')))
  assert.deepEqual(await jobs.list('ana'), [], 'a succeeded job is not listed')
  assert.equal(await jobs.reap(personHash('ana'), id), true)
  assert.equal(await exists(prepared.path), false)
  const [call] = await calls()
  assert.equal(call.cwd.endsWith(id), true, 'it runs in the job folder, so the clip is found by its short name')
  assert.deepEqual(call.argv.slice(-2), ['--audio', 'clip.webm'])
  assert.ok(dir)
})

test('a failed job keeps the command\'s message until it is dismissed', async () => {
  const { jobs } = await setup({ FAKE_PRACTICE_FAIL: 'unknown task' })
  const prepared = await jobs.prepare('ana')
  const id = await jobs.launch(prepared, { kind: 'attempt', learner: 'ana', lang: 'en' }, ['attempt', 'add'])
  await until(() => exists(join(prepared.path, 'exit')))
  const [failed] = await jobs.list('ana')
  assert.deepEqual([failed.state, failed.error], ['failed', 'unknown task'])
  assert.equal(await jobs.reap(personHash('ana'), id), false, 'a failure is not reaped')
  assert.equal(await jobs.dismiss('ana', id), true)
  assert.deepEqual(await jobs.list('ana'), [])
})

test('a job whose process died without finishing is lost, and reapAll cleans what finished while nobody watched', async () => {
  const { jobs, dir } = await setup()
  const lost = createJobs({ dir: join(dir, 'jobs'), practice: (await fakePractice()).practice, alive: () => false })
  const prepared = await jobs.prepare('ana')
  await writeFile(join(prepared.path, 'meta.json'), JSON.stringify({ id: prepared.id, kind: 'attempt', lang: 'en', pid: 999999, started: new Date().toISOString() }))
  assert.equal((await lost.list('ana'))[0].state, 'lost')
  const done = await jobs.prepare('bo')
  await writeFile(join(done.path, 'exit'), '0\n')
  await jobs.reapAll()
  assert.equal(await exists(done.path), false)
  assert.equal(await exists(prepared.path), true, 'a lost job stays for the person to see')
})

test('job ids and hashes from outside are checked before they touch a path', async () => {
  const { jobs, dir } = await setup()
  await mkdir(join(dir, 'jobs', 'keep'), { recursive: true })
  assert.equal(await jobs.dismiss('ana', '../keep'), false)
  assert.equal(await jobs.reap('..', 'x'), false)
  assert.equal(await exists(join(dir, 'jobs', 'keep')), true)
})
