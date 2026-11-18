/**
 * Change notices for open pages, from the file system. The practice root and the jobs folder are
 * watched (inotify, recursive) for as long as the plugin runs; every write the `practice` command
 * makes, whoever made it (this page, the assistant in a chat, a script), reaches every open page
 * of that learner within a moment. Nothing is polled. Events inside one short window come as one notice.
 */
import { mkdir } from 'node:fs/promises'
import { watch } from 'node:fs'
import { basename, sep } from 'node:path'

/** What a reader of the data does not need to hear about: the CLI's lock file and our own temp files. */
const QUIET = name => name === '.lock' || name.endsWith('.tmp')

/**
 * @param {object} o
 * @param {string} o.root - the practice root
 * @param {string} o.jobsDir
 * @param {(hash: string, id: string) => void} [o.onJobExit] - a job's `exit` file appeared
 * @param {number} [o.windowMs]
 */
export function createChanges({ root, jobsDir, onJobExit = () => {}, windowMs = 150 }) {
  const listeners = new Set()
  const watchers = []

  async function start() {
    if (watchers.length > 0) return
    await mkdir(root, { recursive: true })
    await mkdir(jobsDir, { recursive: true, mode: 0o700 })
    watchers.push(watch(root, { recursive: true }, (_event, name) => {
      if (name === null) return
      const [learner, ...rest] = String(name).split(sep)
      if (rest.length === 0 || QUIET(basename(String(name)))) return
      for (const listener of listeners) if (listener.learner === learner) listener.touch('data')
    }))
    watchers.push(watch(jobsDir, { recursive: true }, (_event, name) => {
      if (name === null) return
      const [hash, id, file] = String(name).split(sep)
      if (file === undefined || QUIET(file)) return
      if (file === 'exit') onJobExit(hash, id)
      for (const listener of listeners) if (listener.hash === hash) listener.touch('jobs')
    }))
    for (const watcher of watchers) watcher.on('error', () => {})
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
    for (const listener of listeners) listener.cancel()
    listeners.clear()
    for (const watcher of watchers.splice(0)) watcher.close()
  }

  return { start, listen, stop }
}
