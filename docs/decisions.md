# Decisions

## Own page over the `practice` command (2026-11)

Nothing exists for this: DSH has voice input that only transcribes, and the community plugins (checked 2026-11) cover other ground. So the page is a thin lens over the `practice` CLI, which stays the one reader and writer of the learner's files (the CLI's JSON shapes are its public interface). The page keeps nothing; a view is a CLI call, cached by nobody.

## Recording: native MediaRecorder with a type ladder

Checked 2026-11: Chrome, Edge and Firefox record WebM/Opus (Firefox Ogg/Opus too), Safari 18.4 added WebM/Opus, older Safari and iPhones before iOS 18.4 record MP4/AAC only; Safari's Opus frames are 2.5 ms, so a custom bitrate can break cross-browser playback. The page asks `isTypeSupported` over `webm;opus`, `ogg;opus`, `mp4`, and sets no bitrate. No recorder library: RecordRTC, opus-media-recorder and extendable-media-recorder exist to produce WAV or Ogg where a browser lacks them, which speech-check does not need (ffmpeg reads all three containers). The microphone is opened when the person starts, kept through preparation, and closed when recording ends. Where recording is impossible (no https, no API) the page says why and takes an audio file instead.

## Upload: streamed body, detached job

A clip goes up as the raw request body (`requestBody: 'streaming'`, our own byte cap) with progress from XHR, is written into a job folder and handed to `practice attempt add --audio` run detached under `sh`, which writes an `exit` file last. The attempt is saved by the CLI before the slow analysis starts (speech status `pending`), so the page shows it as analysing from the data itself; the job only says whether a process is still behind it. A job that succeeded is removed at once, one that failed or lost its process stays until dismissed. Jobs survive a DSH restart because nothing about them is in memory.

## Change signal: the file system

`fs.watch` (recursive) on the practice root and the jobs folder, a 150 ms window per listener, the CLI's `.lock` and temp files ignored. A write by anyone reaches every open page of that learner; the page re-reads on each notice and once when the stream (re)connects. No timer reads data. Time-dependent text (countdowns, "analysing for 0:42") ticks on the clock because there the clock is the source.

## Who is who

The learner id is the person id unless `learners` says otherwise; the person comes from `requestIdentity` mapped through `people` or `peopleFile`, the same shape other plugins of this kind use. A learner id is checked as a safe folder name before it reaches a command. The browser never names a learner. Free text goes to the CLI as `--flag=value` so it can never be read as a flag.

## The prompt of a task

The CLI's plan has the task's name, hint and timers, not its prompt text, which the tutor chooses. The CLI gained `session prompt` so the tutor attaches the text to a plan item; the page shows it, and without one shows a button that asks the tutor for it.

## Points

The page never computes or shows scores or penalties: finishing a session calls the CLI once, and the page shows the ledger's answer.
