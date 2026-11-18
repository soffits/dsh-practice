/**
 * Change notices for open pages, from the file system. The practice root and the jobs folder are
 * watched (inotify, recursive) for as long as the plugin runs; every write the `practice` command
 * makes, whoever made it (this page, the assistant in a chat, a script), reaches every open page
 * of that learner within a moment. Nothing is polled. Events inside one short window come as one notice.
 */
import { mkdir, stat } from 'node:fs/promises'
import { watch } from 'node:fs'
import { basename, sep } from 'node:path'

/** What a reader of the data does not need to hear about: the CLI's lock file and our own temp files. */
const QUIET = name => name === '.lock' || name.endsWith('.tmp')

/**
 * @param {object} o
 * @param {string} o.root - the practice root
 * @param {string} o.jobsDir
 * @param {(hash: string, id: string) => void} [o.onJobExit] - a job's `exit` file appeared
 * @param {() => void} [o.onRearm] - a folder had to be created or watched again
 * @param {number} [o.windowMs]
 */
export function createChanges({ root, jobsDir, onJobExit = () => {}, onRearm = () => {}, windowMs = 150 }) {
  const listeners = new Set()
  /** One entry per watched folder: where it is, which folder it was when armed (its inode) and its watcher. */
  const folders = []
  let running = false
  let queue = null

  const touchAll = () => { for (const listener of listeners) { listener.touch('data'); listener.touch('jobs') } }

  const onRoot = (_event, name) => {
    if (name === null) return
    if (name === '') return void retry() // the folder itself was removed or replaced
    const [learner, ...rest] = String(name).split(sep)
    if (rest.length === 0 || QUIET(basename(String(name)))) return
    for (const listener of listeners) if (listener.learner === learner) listener.touch('data')
  }
  const onJobs = (_event, name) => {
    if (name === null) return
    if (name === '') return void retry()
    const [hash, id, file] = String(name).split(sep)
    if (file === undefined || QUIET(file)) return
    if (file === 'exit') onJobExit(hash, id)
    for (const listener of listeners) if (listener.hash === hash) listener.touch('jobs')
  }

  /** Create the folder when it is missing and watch it. A watcher on a removed folder never fires again, so it is replaced. */
  async function arm(folder) {
    folder.watcher?.close()
    folder.watcher = undefined
    await mkdir(folder.path, { recursive: true, mode: folder.mode })
    folder.ino = (await stat(folder.path)).ino
    folder.watcher = watch(folder.path, { recursive: true }, folder.handler)
    folder.watcher.on('error', retry)
  }

  /**
   * Make sure both folders exist and are watched: called before a job folder is made and whenever a
   * page connects, so a folder that was deleted while the plugin ran (a cleanup, a restore) never
   * leaves it deaf until a restart. Open pages and the jobs reaper hear about a re-arm.
   */
  function ensure() {
    if (!running) return Promise.resolve()
    const pass = async () => {
      let rearmed = false
      for (const folder of folders) {
        const now = await stat(folder.path).then(info => info.ino, () => null)
        if (folder.watcher !== undefined && now === folder.ino) continue
        await arm(folder)
        rearmed = true
      }
      if (rearmed) { touchAll(); onRearm() }
    }
    // Passes queue, so a call made while one runs still sees what was removed after that one started.
    const run = (queue ?? Promise.resolve()).catch(() => {}).then(pass)
    queue = run
    const clear = () => { if (queue === run) queue = null }
    run.then(clear, clear)
    return run
  }

  const retry = () => ensure().catch(() => {}) // the next use tries again

  async function start() {
    if (running) return
    running = true
    folders.push({ path: root, handler: onRoot, mode: undefined }, { path: jobsDir, handler: onJobs, mode: 0o700 })
    for (const folder of folders) await arm(folder)
  }

  /**
   * Hear about changes to a learner's data and a person's jobs. `send(what)` gets an array of
   * 'data' and/or 'jobs'. Returns a stop function.
   */
  function listen({ learner, hash }, send) {
    let pending = new Set()
    let timer
    const listener = {
      learner,
      hash,
      touch(what) {
        pending.add(what)
        timer ??= setTimeout(() => {
          const batch = [...pending]
          pending = new Set()
          timer = undefined
          send(batch)
        }, windowMs)
      },
      cancel: () => clearTimeout(timer),
    }
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
      listener.cancel()
    }
  }

  function stop() {
    running = false
    for (const listener of listeners) listener.cancel()
    listeners.clear()
    for (const folder of folders.splice(0)) folder.watcher?.close()
  }

  return { start, ensure, listen, stop }
}
