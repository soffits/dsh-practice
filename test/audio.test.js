import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { withDuration } from '../src/audio.js'
import { scratch } from './helpers.js'

const hasFfmpeg = (() => { try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); return true } catch { return false } })()
const duration = file => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { encoding: 'utf8' }))

test('a WebM recorded as a live stream gets its duration, and a clip ffmpeg cannot read is left alone', { skip: !hasFfmpeg }, async () => {
  const dir = await scratch()
  const clip = join(dir, 'clip.webm')
  await writeFile(clip, execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'sine=d=2', '-c:a', 'libopus', '-f', 'webm', '-']))
  assert.ok(Number.isNaN(duration(clip)))
  await withDuration(clip, process.env)
  assert.ok(Math.abs(duration(clip) - 2) < 0.1)
  const junk = join(dir, 'junk.webm')
  await writeFile(junk, 'not audio at all')
  await withDuration(junk, process.env)
  assert.equal(await readFile(junk, 'utf8'), 'not audio at all')
  const other = join(dir, 'clip.m4a')
  await writeFile(other, 'x')
  await withDuration(other, process.env)
  assert.equal(await readFile(other, 'utf8'), 'x')
})
