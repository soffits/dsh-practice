import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createChanges } from '../src/changes.js'
import { scratch, until } from './helpers.js'

async function setup(extra = {}) {
  const dir = await scratch()
  const root = join(dir, 'root')
  const jobsDir = join(dir, 'jobs')
  const changes = createChanges({ root, jobsDir, windowMs: 40, ...extra })
  await changes.start()
  return { root, jobsDir, changes }
}

test('a write in a learner\'s folder reaches that learner\'s listeners only, as one notice', async () => {
  const { root, changes } = await setup()
  const ana = []
  const bo = []
  const stopAna = changes.listen({ learner: 'ana', hash: 'h1' }, what => ana.push(what))
  const stopBo = changes.listen({ learner: 'bo', hash: 'h2' }, what => bo.push(what))
  await mkdir(join(root, 'ana', 'en'), { recursive: true })
  await writeFile(join(root, 'ana', 'en', 'deck.jsonl'), 'a')
  await writeFile(join(root, 'ana', 'en', 'reviews.jsonl'), 'b')
  await until(() => ana.length > 0)
  await new Promise(done => setTimeout(done, 150))
  assert.deepEqual(ana, [['data']])
  assert.deepEqual(bo, [])
  stopAna(); stopBo(); changes.stop()
})

test('the command\'s lock file and temp files make no noise, so reading never wakes a page', async () => {
  const { root, changes } = await setup()
  await mkdir(join(root, 'ana', 'en'), { recursive: true })
  await new Promise(done => setTimeout(done, 100))
  const heard = []
  changes.listen({ learner: 'ana', hash: 'h1' }, what => heard.push(what))
  await writeFile(join(root, 'ana', 'en', '.lock'), '')
  await writeFile(join(root, 'ana', 'en', 'deck.jsonl.tmp'), 'x')
  await new Promise(done => setTimeout(done, 250))
  assert.deepEqual(heard, [])
  changes.stop()
})

test('a job\'s files tell its person, and its exit file tells the plugin', async () => {
  const exits = []
  const { jobsDir, changes } = await setup({ onJobExit: (hash, id) => exits.push([hash, id]) })
  const heard = []
  changes.listen({ learner: 'ana', hash: 'abcdef0123456789' }, what => heard.push(what))
  await mkdir(join(jobsDir, 'abcdef0123456789', 'job1-aaaaaa'), { recursive: true })
  await writeFile(join(jobsDir, 'abcdef0123456789', 'job1-aaaaaa', 'exit'), '0\n')
  await until(() => heard.length > 0)
  assert.deepEqual(heard[0], ['jobs'])
  assert.deepEqual(exits[0], ['abcdef0123456789', 'job1-aaaaaa'])
  changes.stop()
})
