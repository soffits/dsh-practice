# dsh-practice

A DSH plugin: the language-practice page over the `practice` command line.

- `index.js`: the Host row, its config schema and wiring. `src/routes.js` holds the `/api/practice/*` routes (each decided per request from `requestIdentity`, `src/people.js`); `src/practice.js` is the command adapter (execFile, never a shell, free text always as `--flag=value`); `src/jobs.js` runs slow calls detached in a job folder and announces them by an `exit` file; `src/audio.js` is the streamed upload and the range playback; `src/changes.js` watches the practice root and the jobs folder (inotify) for the events stream; `src/web.js` serves `web/` by exact routes with content tags.
- `client.js`: the sidebar entry, the words (`/api/practice/strings`, from `locale/`) and the styles; it loads the page from `web/` (`page.js` and what it imports, `ui.js` first). `web/format.js` and `web/recorder.js` hold the pure parts (formatting, the MIME ladder, blockers), tested in Node. `test/fixtures/` holds export lists `test/page.test.js` checks the page's DSH and kit names against.

Rules: the plugin never keeps a copy of practice data, and every write goes through the command. Nothing about a particular home or person goes in code, docs or tests (no names, paths, learner data). Views follow changes through the events stream, never a polling timer. After UI changes look at the page at 390 and 1280 px, in light and dark, in two languages. `npm run check`, `npm test`. Conventional Commits, squash merges, semver from commit types.

Releases: bump `package.json` and `CHANGELOG.md`, merge, then push the tag `vX.Y.Z`. `.github/workflows/publish.yml` publishes to npm by trusted publishing (OIDC, with provenance, no stored token; the package's trusted publisher on npmjs.com names this repo and `publish.yml`, so renaming either breaks it) and creates the GitHub release from the changelog section. Don't publish by hand. A new version goes into a running DSH from its package tarball, not a link: an in-place reload of a linked multi-file plugin keeps the old ES modules of `src/`.

Dependencies: whatever DSH itself ships (`@deepseek-ai/schemastery`) is a peer dependency, never a dependency. A profile's package manager keeps a private nested copy of a pinned dependency and removes or moves it when versions change; a running DSH keeps the old path in its module cache, so the in-place reload after that update fails with ENOENT on the nested path until DSH restarts. `test/package.test.js` loads the packed tarball from a clean folder.

Folders: `dataDir/jobs` and the practice root are created when missing and watched again if they are removed while the plugin runs (`changes.ensure`, called before a job folder is made and when a page connects; a watcher on a removed folder never fires again, so it is replaced, not kept).

Route names: `/api/practice/strings` answered an empty 400 in an early build and the route was named `words`. It is not a reserved name in DSH (other plugins serve `/api/<name>/strings` on the same DSH, and nothing in the connection or web server layer names it); the web server turns any error thrown inside a route handler into an empty 400, which is what an unfinished handler did. `words` stays, since the client calls it.

