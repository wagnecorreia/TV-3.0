/* Proxy da TV 3.0 (Netlify Function).
   Uso: GET <base>/api/proxy?url=<alvo>
   - Segue redirects (praia13 302 -> CDN http com token); devolve tudo em https + CORS.
   - Se o alvo for uma playlist m3u8, reescreve cada URL interna para voltar por aqui
     (segmentos relativos viram absolutos e são re-envelopados). */
export const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36'

export async function proxyFetch(target, selfBase) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 25000)
  try {
    const res = await fetch(target, {
      headers: { 'User-Agent': UA, 'Accept': '*/*' },
      redirect: 'follow',
      signal: ctrl.signal,
    })
    if (!res.ok) {
      const t = await res.text().catch(() => '')
      return { status: res.status, text: 'erro ' + res.status + ' ' + res.statusText + ' :: ' + t.slice(0, 300) }
    }
    const buf = Buffer.from(await res.arrayBuffer())
    const ct = res.headers.get('content-type') || ''
    const head = buf.subarray(0, 32).toString('latin1')
    const isPlaylist = /mpegurl/i.test(ct) || head.startsWith('#EXT')
    if (!isPlaylist) {
      return { status: 200, headers: { 'Content-Type': ct || 'application/octet-stream' }, body: buf }
    }
    const finalUrl = res.url || target
    const text = buf.toString('utf8').split(/\r?\n/).map((line) => rewriteLine(line, finalUrl, selfBase)).join('\n')
    return { status: 200, headers: { 'Content-Type': 'application/vnd.apple.mpegurl' }, body: Buffer.from(text) }
  } finally {
    clearTimeout(timer)
  }
}

function rewriteLine(line, base, selfBase) {
  if (line && line.startsWith('#')) {
    if (line.includes('URI=')) line = line.replace(/URI="([^"]+)"/g, (m, u) => 'URI="' + wrap(u, base, selfBase) + '"')
    return line
  }
  if (!line.trim()) return line
  return wrap(line, base, selfBase)
}

function wrap(u, base, selfBase) {
  let abs
  try { abs = /^https?:\/\//i.test(u) ? u : new URL(u, base).href } catch (e) { return u }
  return selfBase + (selfBase.includes('?') ? '&' : '?') + 'url=' + encodeURIComponent(abs)
}

function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': '*',
    'Cache-Control': 'no-store',
  }
}

export async function handler(event) {
  const p = (event.queryStringParameters || {}).url
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors(), body: '' }
  if (!p) return { statusCode: 400, headers: cors(), body: 'falta ?url=' }
  const proto = (event.headers && event.headers['x-forwarded-proto']) || 'https'
  const host = (event.headers && event.headers.host) || 'localhost'
  const selfBase = proto + '://' + host + (event.path || '/api/proxy')
  const r = await proxyFetch(p, selfBase)
  const headers = { ...cors(), 'Content-Type': (r.headers && r.headers['Content-Type']) || 'application/vnd.apple.mpegurl' }
  if (r.body) return { statusCode: r.status, headers, body: r.body.toString('base64'), isBase64Encoded: true }
  return { statusCode: r.status, headers, body: r.text || 'erro' }
}