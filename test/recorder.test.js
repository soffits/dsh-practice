import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MIME_LADDER, extensionOf, pickMime, reasonOf, recordingBlocker } from '../web/recorder.js'
import { clock, countUnits, metricText, nextItem, sessionProgress } from '../web/format.js'

test('the recording type is the first the browser says it can record, by asking, not by its name', () => {
  const only = (...types) => type => types.includes(type)
  assert.equal(pickMime(only('audio/webm;codecs=opus', 'audio/mp4')), 'audio/webm;codecs=opus', 'Chrome, Firefox, Safari 18.4+')
  assert.equal(pickMime(only('audio/mp4')), 'audio/mp4', 'Safari before 18.4 and iPhones before iOS 18.4')
  assert.equal(pickMime(only('audio/ogg;codecs=opus')), 'audio/ogg;codecs=opus')
  assert.equal(pickMime(only()), '', 'nothing known: let the browser choose')
  assert.equal(pickMime(undefined), '')
  assert.equal(pickMime(() => { throw new Error('no') }), '')
  assert.equal(MIME_LADDER[0], 'audio/webm;codecs=opus')
})

test('recording is blocked, with a reason, where the browser cannot do it', () => {
  const full = { isSecureContext: true, navigator: { mediaDevices: { getUserMedia() {} } }, MediaRecorder() {} }
  assert.equal(recordingBlocker(full), null)
  assert.equal(recordingBlocker({ ...full, isSecureContext: false }), 'insecure')
  assert.equal(recordingBlocker({ ...full, navigator: {} }), 'no-microphone')
  assert.equal(recordingBlocker({ ...full, MediaRecorder: undefined }), 'no-recorder')
})

test('a microphone error becomes one of a few reasons', () => {
  assert.equal(reasonOf({ name: 'NotAllowedError' }), 'denied')
  assert.equal(reasonOf({ name: 'NotFoundError' }), 'no-device')
  assert.equal(reasonOf({ name: 'NotReadableError' }), 'busy')
  assert.equal(reasonOf(new Error('x')), 'failed')
  assert.equal(extensionOf('audio/webm;codecs=opus'), 'webm')
  assert.equal(extensionOf('audio/mp4'), 'm4a')
})

test('numbers are told in the units a learner knows', () => {
  assert.equal(clock(90), '1:30')
  assert.equal(clock(29.2), '0:30')
  assert.equal(metricText('speech_rate_wpm', 127.6), '128 wpm')
  assert.equal(metricText('phonation_time_ratio', 0.623), '62%')
  assert.equal(metricText('duration_s', 72), '1:12')
  assert.equal(metricText('unknown_metric', 3.14159), '3.1')
  assert.equal(metricText('words', null), '')
})

test('words are counted by word for spaced scripts and by character for CJK, accents included', () => {
  assert.equal(countUnits('Many people who have children like it.'), 7)
  assert.equal(countUnits("L'équipe n'a pas fini — c'est dommage"), 6)
  assert.equal(countUnits('我喜欢这个城市'), 7)
  assert.equal(countUnits('I like 东京 a lot'), 6)
  assert.equal(countUnits('   '), 0)
})

test('a session shows how far it is and what comes next', () => {
  const session = { plan: { items: [{ id: 'i1', state: 'done' }, { id: 'i2', state: 'todo' }, { id: 'i3', state: 'todo' }] } }
  assert.deepEqual(sessionProgress(session), { done: 1, total: 3 })
  assert.equal(nextItem(session).id, 'i2')
  assert.equal(nextItem({ plan: { items: [{ id: 'i1', state: 'done' }] } }), null)
})

test('a picked audio file labelled as video, or with a vendor type, is sent under the audio type the server takes', async () => {
  const { clipType } = await import('../web/api.js')
  assert.equal(clipType('video/webm'), 'audio/webm')
  assert.equal(clipType('video/mp4;codecs=avc1'), 'audio/mp4')
  assert.equal(clipType('audio/x-m4a'), 'audio/mp4')
  assert.equal(clipType('audio/webm;codecs=opus'), 'audio/webm')
  assert.equal(clipType(''), '')
})
