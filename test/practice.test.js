import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fakePractice } from './helpers.js'
import { messageOf } from '../src/practice.js'

test('a call is the command, --learner and --json, then the arguments, with the root in its environment', async () => {
  const { practice, root, calls } = await fakePractice()
  const status = await practice.run('ana', ['--lang', 'en', 'status'])
  assert.equal(status.lang, 'en')
  const [call] = await calls()
  assert.deepEqual(call.argv, ['--learner', 'ana', '--json', '--lang', 'en', 'status'])
  assert.equal(call.root, root)
})

test('the command\'s own error message is what the caller sees', async () => {
  const { practice } = await fakePractice({ env: { FAKE_PRACTICE_FAIL: 'no session \'x\'' } })
  await assert.rejects(practice.run('ana', ['status']), { message: 'no session \'x\'', status: 422 })
})

test('a missing command says so, and a learner without data is not an error', async () => {
  const { practice, root } = await fakePractice()
  const { createPractice } = await import('../src/practice.js')
  const missing = createPractice({ command: ['/nonexistent/practice'], root, env: process.env })
  await assert.rejects(missing.run('ana', ['status']), /was not found/)
  assert.equal(await practice.exists('ana'), true)
  assert.equal(await practice.exists('nobody'), false)
})

test('messageOf reads the last JSON line of stderr and cuts anything else short', () => {
  assert.equal(messageOf('warning\n{"error": "boom"}\n'), 'boom')
  assert.equal(messageOf('Traceback…'), 'Traceback…')
  assert.equal(messageOf(''), null)
})
