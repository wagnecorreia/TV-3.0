import http from 'node:http'
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { proxyFetch } from '../netlify/functions/proxy.mjs'
import { epgLookup } from '../netlify/functions/epg.mjs'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public')
const PORT = process.env.PORT || 8090
const MIME = { '.html': 'text/html', '.json': 'application/json', '.m3u': 'audio/x-mpegurl', '.m3u8': 'application/vnd.apple.mpegurl', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.ico': 'image/x-icon', '.svg': 'image/svg+xml', '.txt': 'text/plain', '.webmanifest': 'application/manifest+json' }

async function handleProxy(req, res) {
  const u = new URL(req.url, 'http://localhost/proxy').searchParams.get('url')
  if (!u) { res.writeHead(400, { 'Content-Type': 'text/plain' }); res.end('falta ?url='); return }
  const selfBase = 'http://localhost:' + PORT + '/api/proxy'
  const r = await proxyFetch(u, selfBase)
  const headers = { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' }
  if (r.text) { headers['Content-Type'] = 'text/plain'; res.writeHead(r.status, headers); res.end(r.text); return }
  headers['Content-Type'] = (r.headers && r.headers['Content-Type']) || 'application/octet-stream'
  res.writeHead(r.status, headers)
  res.end(r.body)
}

async function handleEpg(req, res) {
  const ch = (new URL(req.url, 'http://localhost/epg').searchParams.get('ch') || '').slice(0, 80)
  if (!ch) { res.writeHead(400, { 'Content-Type': 'text/plain' }); res.end('falta ?ch='); return }
  try {
    const data = await epgLookup(ch)
    if (!data) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'sem epg para ' + ch })); return }
    res.writeHead(200, { 'Cache-Control': 'public, max-age=120', 'Content-Type': 'application/json' })
    res.end(JSON.stringify(data))
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'epg erro: ' + e.message }))
  }
}

http.createServer((req, res) => {
  const p = decodeURIComponent((req.url || '/').split('?')[0])
  if (p === '/api/epg' || p === '/.netlify/functions/epg') {
    handleEpg(req, res).catch(() => { try { res.writeHead(502); res.end('epg erro') } catch (e) {} })
    return
  }
  if (p === '/api/proxy' || p === '/.netlify/functions/proxy') {
    handleProxy(req, res).catch(() => { try { res.writeHead(502); res.end('proxy erro') } catch (e) {} })
    return
  }
  let f = p === '/' ? '/index.html' : p
  const file = path.join(ROOT, f)
  if (!existsSync(file)) { res.writeHead(404); res.end('404'); return }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Access-Control-Allow-Origin': '*' })
  res.end(readFileSync(file))
}).listen(PORT, '127.0.0.1', () => console.log('TV 3.0 servindo http://localhost:' + PORT))