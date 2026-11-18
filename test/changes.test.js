import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, rm, stat, writeFile } from 'node:fs/promises'
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

test('a watched folder removed while running is made again and watched again, and pages are told', async () => {
  const { root, jobsDir, changes } = await setup({ windowMs: 20 })
  const heard = []
  changes.listen({ learner: 'ana', hash: 'abcdef0123456789' }, what => heard.push(what))
  await rm(jobsDir, { recursive: true })
  await rm(root, { recursive: true })
  await changes.ensure()
  assert.ok((await stat(jobsDir)).isDirectory())
  assert.ok((await stat(root)).isDirectory())
  await until(() => heard.flat().includes('jobs'))
  heard.length = 0
  await mkdir(join(jobsDir, 'abcdef0123456789', 'j-1'), { recursive: true })
  await writeFile(join(jobsDir, 'abcdef0123456789', 'j-1', 'meta.json'), '{}')
  await mkdir(join(root, 'ana'), { recursive: true })
  await writeFile(join(root, 'ana', 'deck.jsonl'), 'a')
  await until(() => heard.flat().includes('jobs') && heard.flat().includes('data'))
  changes.stop()
})

test('a folder removed under a running plugin is noticed without anyone asking', async () => {
  const rearmed = []
  const { jobsDir, changes } = await setup({ windowMs: 20, onRearm: () => rearmed.push(1) })
  await rm(jobsDir, { recursive: true })
  await until(() => rearmed.length > 0)
  assert.ok((await stat(jobsDir)).isDirectory())
  changes.stop()
})
