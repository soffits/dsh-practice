import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { apply } from '../index.js'
import { scratch, until } from './helpers.js'

const watchHandles = () => process.getActiveResourcesInfo().filter(kind => kind === 'FSEventWrap').length

// Cordis 4 has no 'dispose' event: a listener on it never runs. Only effects are torn down.
function fakeContext() {
  const disposers = []
  const logger = { info() {}, warn() {}, error() {} }
  return {
    ctx: {
      logger: () => logger,
      get: () => undefined,
      connection: { fetch: { register() {} } },
      on() { return () => true },
      effect(execute) { disposers.push(execute()) },
    },
    unload: () => { for (const dispose of disposers.reverse()) dispose() },
  }
}

test('the folder watchers close when the plugin unloads', async () => {
  const dir = await scratch()
  await mkdir(join(dir, 'root'), { recursive: true })
  const before = watchHandles()
  const { ctx, unload } = fakeContext()
  apply(ctx, { command: ['true'], root: join(dir, 'root'), dataDir: join(dir, 'data') })
  await until(() => watchHandles() > before)
  unload()
  await sleep(50)
  assert.equal(watchHandles(), before)
})
