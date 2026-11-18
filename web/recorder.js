/**
 * Recording in the browser with MediaRecorder.
 *
 * What a browser can record differs (checked 2026-11): Chrome, Edge and Firefox write WebM/Opus (Firefox
 * also Ogg/Opus), Safari 18.4 and later writes WebM/Opus too, older Safari and every iPhone browser
 * before iOS 18.4 write MP4/AAC. So the type is asked of the browser, never guessed from its name, and
 * the server and speech-check take any of them (ffmpeg reads them all).
 */

/** The preference order: the smallest files that every speech tool reads first. */
export const MIME_LADDER = Object.freeze(['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg'])

/** The first type the browser says it can record, or '' to let it choose its own default. */
export function pickMime(isTypeSupported) {
  if (typeof isTypeSupported !== 'function') return ''
  return MIME_LADDER.find(type => { try { return isTypeSupported(type) } catch { return false } }) ?? ''
}

/** Why recording is not possible here, or null: no secure context (a plain http page), no microphone API, no MediaRecorder. */
export function recordingBlocker(env = globalThis) {
  if (env.isSecureContext === false) return 'insecure'
  if (!env.navigator?.mediaDevices?.getUserMedia) return 'no-microphone'
  if (typeof env.MediaRecorder !== 'function') return 'no-recorder'
  return null
}

/** A microphone error as one of a few reasons the page has words for. */
export function reasonOf(error) {
  switch (error?.name) {
    case 'NotAllowedError': case 'SecurityError': return 'denied'
    case 'NotFoundError': case 'OverconstrainedError': return 'no-device'
    case 'NotReadableError': case 'AbortError': return 'busy'
    default: return 'failed'
  }
}

/** A short file name stem for a downloaded or uploaded clip, from its media type. */
export const extensionOf = type => ({ 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a' })[String(type).split(';')[0]] ?? 'audio'

/** Ask for the microphone (this is where the browser asks the person); the stream goes to startRecording or is stopped with `closeStream`. */
export const openMicrophone = () => navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1 } })
export const closeStream = stream => { for (const track of stream?.getTracks?.() ?? []) track.stop() }

/**
 * Start recording the microphone.
 * @param {{ stream?: MediaStream, onLevel?: (level: number) => void }} [options] - stream: one from `openMicrophone`, else it is opened here
 * @returns {Promise<{ stop: () => Promise<Blob>, cancel: () => void, mime: string }>}
 */
export async function startRecording({ stream: given, onLevel } = {}) {
  const stream = given ?? await openMicrophone()
  const mime = pickMime(MediaRecorder.isTypeSupported?.bind(MediaRecorder))
  let recorder
  try {
    recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream)
  } catch (error) {
    for (const track of stream.getTracks()) track.stop()
    throw error
  }
  const chunks = []
  recorder.ondataavailable = event => { if (event.data?.size > 0) chunks.push(event.data) }
  const meter = onLevel ? levelMeter(stream, onLevel) : () => {}
  const release = () => { meter(); for (const track of stream.getTracks()) track.stop() }
  const done = new Promise((resolve, reject) => {
    recorder.onstop = () => { release(); resolve(new Blob(chunks, { type: recorder.mimeType || mime || 'audio/webm' })) }
    recorder.onerror = event => { release(); reject(event.error ?? new Error('Recording failed.')) }
  })
  recorder.start(1000)
  return {
    mime: recorder.mimeType || mime,
    stop: () => { if (recorder.state !== 'inactive') recorder.stop(); return done },
    cancel: () => { recorder.onstop = release; if (recorder.state !== 'inactive') recorder.stop(); else release() },
  }
}

/** A level between 0 and 1 for a meter, from the live stream; a no-op where the Web Audio API is missing. */
function levelMeter(stream, onLevel) {
  const Context = globalThis.AudioContext ?? globalThis.webkitAudioContext
  if (!Context) return () => {}
  let context
  try {
    context = new Context()
    const analyser = context.createAnalyser()
    analyser.fftSize = 512
    context.createMediaStreamSource(stream).connect(analyser)
    const data = new Uint8Array(analyser.fftSize)
    let frame
    const tick = () => {
      analyser.getByteTimeDomainData(data)
      let peak = 0
      for (const value of data) peak = Math.max(peak, Math.abs(value - 128))
      onLevel(Math.min(1, peak / 90))
      frame = requestAnimationFrame(tick)
    }
    tick()
    return () => { cancelAnimationFrame(frame); context.close().catch(() => {}); onLevel(0) }
  } catch {
    context?.close().catch(() => {})
    return () => {}
  }
}
