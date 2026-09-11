/* EPG (programação agora/em seguida) via epg.pw.
 * - One-shot: baixa epg_BR.xml.gz (~500KB) p/ extrair o mapa nome-de-canal -> id (TTL 60min).
 * - Agora/próximo: API por canal https://epg.pw/api/epg.json?channel_id=&date= (ISO-UTC, TTL 20min).
 * - Exporta epgLookup(channelName) para o serve.mjs local e handler() para o Netlify. */

import { gunzipSync } from 'node:zlib'

const CH_XML = 'https://epg.pw/xmltv/epg_BR.xml.gz'
const API = 'https://epg.pw/api/epg.json'
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0'
const TTL_XML = 60 * 60e3
const TTL_DAY = 20 * 60e3
const BR_OFFSET = -3 * 3600e3

/* alias: nome do nosso canal -> chave no epg.pw */
const ALIAS = [
  ['TV Cultura Rio', 'tvcultura'],
  ['Globo RJ', 'globo'],
  ['RedeTV Rio', 'redetv'],
  ['RedeTV!', 'redetv'],
  ['Band', 'band'],
  ['SBT Rio', 'sbt'],
  ['Record Rio', 'recordtv'],
]

function norm(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

let xmlCache = null

async function loadChannels() {
  if (xmlCache && Date.now() - xmlCache.at < TTL_XML) return xmlCache.nameToId
  const r = await fetch(CH_XML, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(90000) })
  if (!r.ok) throw new Error('epg channels ' + r.status)
  const xml = gunzipSync(Buffer.from(await r.arrayBuffer())).toString('utf8')
  const nameToId = new Map()
  for (const m of xml.matchAll(/<channel id="([^"]+)"[^>]*>\s*<display-name[^>]*>([^<]+)<\/display-name>/g)) {
    nameToId.set(norm(m[2]), m[1])
  }
  xmlCache = { at: Date.now(), nameToId }
  return nameToId
}

async function channelIdFor(name) {
  const nameToId = await loadChannels()
  const n = norm(name)
  if (nameToId.has(n)) return nameToId.get(n)
  const hit = ALIAS.find(([our]) => norm(our) === n)
  if (hit) return nameToId.get(hit[1])
  /* queda: substring — prefere a chave mais curta (evita pegar "globonews" em vez de "globo") */
  let best = null
  for (const k of nameToId.keys()) {
    if (k.includes(n) || n.includes(k)) best = best && best.length <= k.length ? best : k
  }
  return best ? nameToId.get(best) : null
}

let dayCache = new Map() // id -> { at, list, day }

async function dayList(id) {
  const now = new Date()
  const day =
    now.getUTCFullYear().toString() +
    String(now.getUTCMonth() + 1).padStart(2, '0') +
    String(now.getUTCDate()).padStart(2, '0')
  const hit = dayCache.get(id)
  if (hit && hit.day === day && Date.now() - hit.at < TTL_DAY) return hit.list
  const u = API + '?channel_id=' + encodeURIComponent(id) + '&date=' + day
  const r = await fetch(u, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(20000) })
  if (!r.ok) throw new Error('epg day ' + r.status)
  const j = await r.json()
  const list = (j.epg_list || [])
    .map((p) => {
      const t = Date.parse(p.start_date)
      return isNaN(t) ? null : { t0: t, t1: t + 60e3, title: (p.title || '').trim() }
    })
    .filter(Boolean)
    .sort((a, b) => a.t0 - b.t0)
  dayCache.set(id, { at: Date.now(), day, list })
  return list
}

function bt(t) {
  /* HH:MM no fuso de Brasília (-03:00) */
  const d = new Date(t + BR_OFFSET)
  return String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0')
}

export async function epgLookup(channelName) {
  const id = await channelIdFor(channelName)
  if (!id) return null
  const list = await dayList(id)
  if (!list.length) return null
  const now = Date.now()
  let idx = -1
  for (let i = 0; i < list.length; i++) {
    const nxt = list[i + 1]
    if (list[i].t0 <= now && (!nxt || now < nxt.t0)) { idx = i; break }
  }
  if (idx < 0) return null
  const nowP = list[idx]
  const nextP = list[idx + 1]
  return {
    now: { tt: bt(nowP.t0), title: nowP.title },
    next: nextP ? { tt: bt(nextP.t0), title: nextP.title } : null,
  }
}

export async function handler(event) {
  const ch = ((event.queryStringParameters || {}).ch || '').slice(0, 80)
  if (!ch) {
    return { statusCode: 400, headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'falta ?ch=' }) }
  }
  try {
    const data = await epgLookup(ch)
    if (!data) {
      return { statusCode: 404, headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'sem epg para ' + ch }) }
    }
    return { statusCode: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=120', 'Content-Type': 'application/json' }, body: JSON.stringify(data) }
  } catch (e) {
    return { statusCode: 500, headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'epg erro: ' + e.message }) }
  }
}