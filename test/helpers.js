import { mkdtemp, mkdir, rm, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { after } from 'node:test'
import { createPractice } from '../src/practice.js'

export const FAKE = fileURLToPath(new URL('./fixtures/fake-practice.mjs', import.meta.url))

/** A throwaway folder, removed when the test file ends. */
export async function scratch() {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-practice-test-'))
  after(() => rm(dir, { recursive: true, force: true }))
  return dir
}

/** A practice adapter on the fake command, with a log of its calls. */
export async function fakePractice({ env = {} } = {}) {
  const dir = await scratch()
  const root = join(dir, 'root')
  await mkdir(join(root, 'ana', 'en'), { recursive: true })
  await writeFile(join(root, 'ana', 'learner.json'), '{}')
  const log = join(dir, 'calls.log')
  const practice = createPractice({ command: [FAKE], root, env: { ...process.env, FAKE_PRACTICE_LOG: log, ...env } })
  const calls = async () => (await readFile(log, 'utf8').catch(() => '')).split('\n').filter(Boolean).map(line => JSON.parse(line))
  return { practice, root, dir, calls }
}

export const until = async (check, { ms = 4000, step = 20 } = {}) => {
  const end = Date.now() + ms
  for (;;) {
    const value = await check()
    if (value) return value
    if (Date.now() > end) throw new Error('timed out waiting')
    await new Promise(done => setTimeout(done, step))
  }
}
