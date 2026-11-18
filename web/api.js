/** Requests to the Host half's /api/practice routes. Every failure is an Error with the server's message. */
export const url = (path, query = {}) => {
  const target = new URL(`api/practice/${path}`, document.baseURI)
  for (const [key, value] of Object.entries(query)) if (value !== undefined && value !== null && value !== '') target.searchParams.set(key, String(value))
  return target.href
}

async function answer(response) {
  let body = null
  try {
    body = await response.json()
  } catch { /* not JSON */ }
  if (!response.ok) throw new Error(body?.error ?? `HTTP ${response.status}`)
  return body
}

export const read = (path, query) => fetch(url(path, query), { headers: { accept: 'application/json' } }).then(answer)
export const write = (path, body) => fetch(url(path), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(answer)

/** A picked file's type as the server knows it: browsers label an audio-only .webm or .mp4 as video/*. */
export const clipType = type => {
  const base = String(type || '').split(';')[0].trim().toLowerCase()
  return { 'video/webm': 'audio/webm', 'video/mp4': 'audio/mp4', 'video/ogg': 'audio/ogg', 'application/ogg': 'audio/ogg', 'audio/x-m4a': 'audio/mp4', 'audio/mp3': 'audio/mpeg' }[base] ?? base
}

/**
 * Upload a recording with progress (fetch has none for uploads). Resolves to the job's answer.
 * @param {Blob} clip
 * @param {Record<string, string | number | undefined>} query
 * @param {(fraction: number) => void} [onProgress]
 */
export function upload(clip, query, onProgress = () => {}) {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest()
    request.open('POST', url('attempt/audio', query))
    request.setRequestHeader('content-type', clipType(clip.type) || 'application/octet-stream')
    request.upload.onprogress = event => { if (event.lengthComputable) onProgress(event.loaded / event.total) }
    request.onerror = () => reject(new Error('The upload could not reach the server.'))
    request.onload = () => {
      let body = null
      try { body = JSON.parse(request.responseText) } catch { /* not JSON */ }
      if (request.status >= 200 && request.status < 300) resolve(body)
      else reject(new Error(body?.error ?? `HTTP ${request.status}`))
    }
    request.send(clip)
  })
}
