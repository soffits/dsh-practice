import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdir, readFile, readdir, symlink } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { scratch } from './helpers.js'

const repo = fileURLToPath(new URL('..', import.meta.url))
const manifest = JSON.parse(await readFile(join(repo, 'package.json'), 'utf8'))

test('the package depends on nothing the profile could move: what DSH provides is a peer, never a dependency', () => {
  assert.equal(manifest.dependencies, undefined)
  assert.ok(manifest.peerDependencies['@deepseek-ai/schemastery'])
})

test('the packed tarball loads from a clean folder and its host entry applies', async () => {
  const dir = await scratch()
  const packed = JSON.parse(execFileSync('npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', dir], { cwd: repo, encoding: 'utf8' }))[0]
  const site = join(dir, 'site')
  await mkdir(join(site, 'node_modules', '@deepseek-ai'), { recursive: true })
  execFileSync('tar', ['-xzf', join(dir, packed.filename), '-C', site])
  const installed = join(site, 'package')
  // The peer comes from the folder above the plugin, as in a DSH profile.
  await symlink(resolve(repo, 'node_modules/@deepseek-ai/schemastery'), join(site, 'node_modules', '@deepseek-ai', 'schemastery'))
  await symlink(installed, join(site, 'node_modules', 'plugin'))
  const files = await readdir(installed)
  assert.ok(files.includes('index.js') && files.includes('client.js') && files.includes('web'))
  const script = `
    const m = await import(${JSON.stringify(pathToFileURL(join(site, 'node_modules', 'plugin', 'index.js')).href)})
    const routes = []
    const ctx = { logger: () => ({ warn() {}, info() {} }), connection: { fetch: { register: route => routes.push(route.path) } }, get: () => undefined, on() {} }
    m.apply(ctx, m.Config({ root: ${JSON.stringify(join(dir, 'root'))}, dataDir: ${JSON.stringify(join(dir, 'data'))} }))
    console.log(JSON.stringify({ name: m.name, routes: routes.length }))
    setTimeout(() => process.exit(), 200)`
  const out = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', script], { cwd: site, encoding: 'utf8' }).trim().split('\n').at(-1))
  assert.equal(out.name, 'dsh-practice')
  assert.ok(out.routes > 20)
})
