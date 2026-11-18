/**
 * Slow `practice` calls (speech analysis takes a minute or more) run as detached jobs, so a page
 * never waits on one and a DSH restart does not cut one off. A job is a folder:
 *
 *   <dir>/<person hash>/<job id>/  meta.json  clip.<ext> (an upload)  out.json  err.txt  exit
 *
 * The command runs under `sh` in that folder and the shell writes `exit` last, so a finished job
 * is announced by a file appearing (watched, never polled). A job that succeeded is removed at
 * once, since the practice data now holds its result; one that failed, or lost its process, stays
 * until the person dismisses it, so the page can say what happened.
 */
import { spawn } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { messageOf } from './practice.js'

const JOB_ID = /^[a-z0-9]{6,40}-[a-f0-9]{6}$/
const RUN = '"$@" >out.json 2>err.txt; code=$?; echo "$code" >exit.tmp; mv exit.tmp exit'

export const personHash = person => createHash('sha256').update(String(person)).digest('hex').slice(0, 16)

/** @param {{ dir: string, practice: ReturnType<import('./practice.js').createPractice>, alive?: (pid: number) => boolean, beforePrepare?: () => Promise<void> }} o `beforePrepare` runs before a job folder is made: the place to put the jobs folder and its watcher back if they were removed. */
export function createJobs({ dir, practice, alive = pidAlive, beforePrepare = async () => {} }) {
  const folder = (person, id) => join(dir, personHash(person), id)

  /** A new job folder for an upload to be written into. */
  async function prepare(person) {
    await beforePrepare()
    const id = `${Date.now().toString(36)}-${randomBytes(3).toString('hex')}`
    const path = folder(person, id)
    await mkdir(path, { recursive: true, mode: 0o700 })
    return { id, path }
  }

  /** Start the command detached in the job's folder; `meta` is what the page may show about it. */
  async function launch(prepared, meta, args) {
    const child = spawn('sh', ['-c', RUN, 'sh', practice.file, ...practice.argv(meta.learner, args)], { cwd: prepared.path, env: practice.env, detached: true, stdio: 'ignore' })
    child.on('error', () => {})
    child.unref()
    await writeFile(join(prepared.path, 'meta.json'), JSON.stringify({ ...meta, id: prepared.id, pid: child.pid, started: new Date().toISOString() }))
    return prepared.id
  }

  async function read(path, name) {
    return readFile(join(path, name), 'utf8').then(text => text, () => null)
  }

  /** This person's jobs that are running, failed or lost, newest first. */
  async function list(person) {
    const root = join(dir, personHash(person))
    const names = await readdir(root).catch(() => [])
    const out = []
    for (const id of names.filter(name => JOB_ID.test(name))) {
      const path = join(root, id)
      const meta = JSON.parse((await read(path, 'meta.json')) ?? 'null')
      if (meta === null) continue // still being written
      const exit = await read(path, 'exit')
      let state = 'running'
      let error
      if (exit !== null) {
        if (exit.trim() === '0') continue // done: reaped, or about to be
        state = 'failed'
        error = messageOf(await read(path, 'err.txt')) ?? 'The command failed.'
      } else if (!alive(meta.pid)) {
        state = 'lost'
      }
      out.push({ id, state, error, kind: meta.kind, lang: meta.lang, session: meta.session ?? null, item: meta.item ?? null, task: meta.task ?? null, attempt: meta.attempt ?? null, started: meta.started })
    }
    return out.sort((a, b) => String(b.started).localeCompare(String(a.started)))
  }

  /** Remove a succeeded job's folder (its result is in the practice data now). Returns true when it was one. */
  async function reap(hash, id) {
    if (!/^[a-f0-9]{16}$/.test(hash) || !JOB_ID.test(id)) return false
    const path = join(dir, hash, id)
    if ((await read(path, 'exit'))?.trim() !== '0') return false
    await rm(path, { recursive: true, force: true })
    return true
  }

  /** Reap every job that succeeded while nobody watched (DSH was down). */
  async function reapAll() {
    for (const hash of await readdir(dir).catch(() => [])) {
      for (const id of await readdir(join(dir, hash)).catch(() => [])) await reap(hash, id)
    }
  }

  async function dismiss(person, id) {
    if (!JOB_ID.test(id)) return false
    await rm(folder(person, id), { recursive: true, force: true })
    return true
  }

  return { prepare, launch, list, reap, reapAll, dismiss, dir }
}

function pidAlive(pid) {
  if (!Number.isInteger(pid)) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return error.code === 'EPERM'
  }
}
