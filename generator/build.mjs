import { readFileSync, writeFileSync, mkdirSync, rmSync, copyFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const OUT = path.join(ROOT, 'public')
const SOURCES = path.join(ROOT, 'sources', 'channels.json')

const IPTV_ORG = 'https://raw.githubusercontent.com/iptv-org/iptv/master/streams/br.m3u'
const GOVERNMENTAL_ONLY = process.argv.includes('--gov-only') // teste local

const APP_NAME = 'TV 3.0'
const APP_TAG = 'Sinal de TV, de graça, pra onde não existe.'

function log(m) { console.log(m) }

function cleanName(name) {
  return name
    .replace(/\s*@\w+\s*$/i, '')        // "@SD" / "@HD" / "@FHD" no fim
    .replace(/\s*\(\d{3,4}p\)\s*$/i, '') // "(720p)" / "(1080p)"
    .replace(/\s*\[[^\]]*\]\s*$/i, '')   // tags no fim
    .replace(/\s+\d+p\s*$/i, '')
    .replace(/\s*\.(br|es|pt|us|en)\s*$/i, '') // sufixo de país tipo ".br"
    .replace(/\s+/g, ' ')
    .trim()
}

function displayName(name) {
  const c = cleanName(name)
  return c.replace(/\b\p{L}/gu, (m) => m.toUpperCase())
}

function normalizedKey(name) {
  return cleanName(name)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '')
    .trim()
}

function loadCurated() {
  const raw = readFileSync(SOURCES, 'utf8')
  const j = JSON.parse(raw)
  return (j.channels || []).map((c) => {
    const baseUf = Array.isArray(c.uf) ? c.uf : []
    const inferred = inferUfs(c.name || '')
    const uf = [...new Set([...baseUf, ...inferred])]
    return {
      id: c.id,
      name: c.name,
      logo: c.logo || '',
      url: c.url,
      links: Array.isArray(c.links) ? c.links.map((l) => ({ q: l.q || '', url: l.url || '', globo: !!l.globo, yt: l.yt || '' })) : [],
      uf,
      num: c.num || '',
      national: isNational(c.name || ''),
    }
  })
}

// --- Inferência de UF a partir do nome do canal ---
// Mapa simples cidade (sem acento) -> UF
const CITY_UF = {
  'manaus': 'AM', 'macapa': 'AP', 'sao luis': 'MA', 'sao luiz': 'MA', 'teresina': 'PI', 'fortaleza': 'CE',
  'natal': 'RN', 'joao pessoa': 'PB', 'recife': 'PE', 'maceio': 'AL', 'aracaju': 'SE', 'salvador': 'BA',
  'feira de santana': 'BA', 'cuiaba': 'MT', 'campo grande': 'MS', 'goiania': 'GO', 'brasilia': 'DF',
  'belo horizonte': 'MG', 'uberlandia': 'MG', 'juiz de fora': 'MG', 'vitoria': 'ES', 'rio de janeiro': 'RJ',
  'sao paulo': 'SP', 'campinas': 'SP', 'santos': 'SP', 'ribeirao preto': 'SP', 'curitiba': 'PR',
  'londrina': 'PR', 'maringa': 'PR', 'florianopolis': 'SC', 'joinville': 'SC', 'porto alegre': 'RS',
  'caxias do sul': 'RS', 'pelotas': 'RS', 'belem': 'PA', 'porto velho': 'RO', 'rio branco': 'AC',
  'boa vista': 'RR', 'palmas': 'TO',
  // Região dos Lagos (RJ)
  'buzios': 'RJ', 'arboreto do buzios': 'RJ', 'cabo frio': 'RJ', 'araruama': 'RJ', 'saquarema': 'RJ',
  'saquarema': 'RJ', 'sao pedro da aldeia': 'RJ', 'iguaba grande': 'RJ', 'arraial do cabo': 'RJ',
  'rio das ostras': 'RJ', 'casimiro de abreu': 'RJ', 'marica': 'RJ', 'silva jardim': 'RJ', 'tangua': 'RJ',
}

// UFs para canais "nacionais" (emissoras de rede com retransmissoras por todo o Brasil)
const NATIONAL_UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO']

function inferUfs(name) {
  const clean = cleanName(name)
  const lower = clean.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  const ufs = new Set()

  // 1) sufixo/prefixo explícito de UF (ex.: "Band RJ", "RBS TV RS", "Globo SP")
  const m = lower.match(/(?:^|\s)(ac|al|ap|am|ba|ce|df|es|go|ma|mt|ms|mg|pa|pb|pr|pe|pi|rj|rn|rs|ro|rr|sc|sp|se|to)(?:\s|$)/)
  if (m && m[1] && NATIONAL_UFS.includes(m[1].toUpperCase())) ufs.add(m[1].toUpperCase())

  // 2) cidade conhecida
  for (const [city, uf] of Object.entries(CITY_UF)) {
    if (lower.includes(city)) { ufs.add(uf); break }
  }

  // 3) canais nacionais (rede) -> todas as UFs (para exibir em qualquer estado)
  const nat = /^(globo|record|sbt|band|redetv|rede tv|cultura|rbs|npctv|uhtv|ric|meionorte|rondonia|sbtbrasil)$|afiliada|nacional/i
  // (deixamos o "marcador nacional" para quem chama decidir via flag abaixo)

  return [...ufs]
}

function isNational(channelName) {
  const n = normalizedKey(channelName)
  const networks = ['globo', 'record', 'sbt', 'band', 'redetv', 'tv cultura', 'cultura', 'rbs', 'meionorte', 'sbtbrasil', 'canal gov', 'canal educacao', 'tv brasil', 'multishow', 'spor tv', 'mega', 'telcine', 'telecine']
  const ok = networks.some((x) => n.includes(x))
  // canais que pela cidade não deram nada mas são rede grande
  return ok
}

function slugify(name) {
  return normalizedKey(name).replace(/\s+/g, '-')
}

function parseIptvOrg(m3u) {
  const lines = m3u.split(/\r?\n/)
  const out = []
  let pendingName = null
  let pendingBlocked = false
  let pendingOffline = false

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line.startsWith('#EXTINF')) {
      const nameMatch = line.match(/,\s*(.+?)\s*$/)
      const tvgNameMatch = line.match(/tvg-name="([^"]*)"|tvg-id="([^"]*)"/)
      let name = nameMatch ? nameMatch[1] : ''
      name = (tvgNameMatch && (tvgNameMatch[1] || tvgNameMatch[2])) || name
      pendingName = name.trim()
      pendingBlocked = /\[Geo-blocked\]/i.test(line)
      pendingOffline = /\[Not 24\/7\]/i.test(line)
      continue
    }
    if (line.startsWith('#EXTVLCOPT') || line.startsWith('#EXTVLCOPT-')) continue
    if (line.startsWith('#')) continue
    if (line.trim() === '') continue

    if (pendingName) {
      const url = line.trim()
      if (/^https:\/\//i.test(url) && !pendingBlocked && !pendingOffline) {
        out.push({ name: pendingName, url })
      }
      pendingName = null
      pendingBlocked = false
      pendingOffline = false
    }
  }
  return dedupeByKey(out, (it) => normalizedKey(it.name) + '|' + it.url)
}

function dedupeByKey(list, keyFn) {
  const seen = new Set()
  const res = []
  for (const it of list) {
    const k = keyFn(it)
    if (seen.has(k)) continue
    seen.add(k)
    res.push(it)
  }
  return res
}

function merge(base, complement) {
  const baseKeysByName = new Map()
  for (const c of base) baseKeysByName.set(normalizedKey(c.name), c)
  const out = []

  for (const c of base) out.push({ ...c, source: 'curada' })

  const usedKeys = new Set([...baseKeysByName.keys()])
  for (const cand of complement) {
    const k = normalizedKey(cand.name)
    // pula se já existe na base (por nome) OU já foi adicionado
    if (baseKeysByName.has(k) || usedKeys.has(k)) continue
    // pulo canais que são claramente a mesma emissora com nome a quase igual (mesmo 1o token)
    usedKeys.add(k)
    out.push({
      id: slugify(displayName(cand.name)),
      name: displayName(cand.name),
      logo: '',
      url: cand.url,
      uf: inferUfs(displayName(cand.name)),
      national: isNational(displayName(cand.name)),
      source: 'iptv-org',
    })
  }
  return out
}

async function fetchIptvOrg() {
  if (GOVERNMENTAL_ONLY) return []  // teste local: não baixa rede
  const res = await fetch(IPTV_ORG, { signal: AbortSignal.timeout(60000) })
  if (!res.ok) throw new Error(`iptv-org HTTP ${res.status}`)
  return parseIptvOrg(await res.text())
}

function buildIndexHtml(channels) {
  const cryptoItems = channels.map((c) => ({
    name: c.name.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/</g, '\\u003c'),
    logo: c.logo,
    url: c.url,
    links: (c.links || []).map((l) => ({ q: l.q, url: (l.url || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"'), globo: !!l.globo, yt: l.yt || '' })),
    uf: c.uf || [],
    num: c.num || '',
    national: !!c.national,
  }))
  const dataJson = JSON.stringify(cryptoItems)
  const template = readFileSync(path.join(ROOT, 'generator', 'app.template.html'), 'utf8')
  return template.replace('/*__DATA__*/', dataJson)
}

function buildManifest() {
  return {
    name: APP_NAME,
    short_name: 'TV 3.0',
    description: APP_TAG,
    start_url: './',
    display: 'standalone',
    background_color: '#0b0e14',
    theme_color: '#0b0e14',
    icons: [
      { src: './favicon.png', sizes: 'any', type: 'image/png', purpose: 'any' },
      { src: './icon.png', sizes: 'any', type: 'image/png', purpose: 'maskable' },
    ],
  }
}

// Ordena: canais numerados do dial (ex: 2.1, 4.1) na frente na ordem do canais.json, depois curados em ordem alfabética, depois iptv-org.
function orderLists(merged) {
  const curated = merged.filter((c) => c.source === 'curada')
  const iptv = merged.filter((c) => c.source === 'iptv-org')
  const byName = (a, b) => a.name.localeCompare(b.name, 'pt-BR')
  const pinned = curated.filter((c) => c.num)
  const rest = curated.filter((c) => !c.num)
  return [...pinned, ...rest.sort(byName), ...iptv.sort(byName)]
}

async function checkHls(ch) {
  if (!/^https:\/\//i.test(ch.url)) return true // http: não toca na página, mas mantém p/ playlist externa
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 6500)
  try {
    const res = await fetch(ch.url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36' },
      signal: ctrl.signal,
    })
    if (!res.ok && res.status !== 206) return false
    const body = await res.text()
    return body.includes('#EXTM3U') || /^#EXT/i.test(body)
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

async function verifyOnly(list, source) {
  const toCheck = list.filter((c) => c.source === source)
  const keepMap = new Map()

  let cursor = 0
  const WORKERS = 12
  async function worker() {
    while (cursor < toCheck.length) {
      const idx = cursor++
      const c = toCheck[idx]
      keepMap.set(c.id, await checkHls(c))
    }
  }
  await Promise.all(Array.from({ length: WORKERS }, worker))

  const kept = list.filter((c) => c.source !== source || keepMap.get(c.id))
  const dead = list.length - kept.length
  return { kept, dead }
}

async function main() {
  log('TV 3.0 · gerando…')
  const base = loadCurated()

  // Modo "dial": se há canais numerados (2.1 … 13.1), a TV só entrega eles — o resto fica de reserva.
  const ONLY_DIAL = base.some((c) => c.num)

  let complement = []
  if (!ONLY_DIAL) {
    try {
      complement = await fetchIptvOrg()
      log(`  iptv-org: ${complement.length} candidatos HTTPS`)
    } catch (err) {
      log(`  aviso: não deu pra buscar iptv-org (${err.message}) — segue só com a base.`)
    }
  } else {
    log('  modo dial: sem busca iptv-org')
  }

  const merged = merge(base, complement)
  log(`  mesclado: ${merged.length} (${base.length} curados + ${merged.length - base.length} do iptv-org)`)

  // Verifica (rapidamente) os canais do iptv-org e remove os que não respondem HLS.
  let finalList = merged
  let dead = 0
  if (!GOVERNMENTAL_ONLY && !ONLY_DIAL) {
    log('  verificando canais HTTPS do iptv-org (removendo mortos/lentos)…')
    const r = await verifyOnly(merged, 'iptv-org')
    finalList = r.kept
    dead = r.dead
    log(`  verificacao: ${finalList.length - base.length} aprovados, ${dead} removidos`)
  }

  finalList = orderLists(finalList)
  if (ONLY_DIAL) finalList = finalList.filter((c) => c.num)
  const fromBase = finalList.filter((c) => c.source === 'curada').length
  const fromIptv = finalList.filter((c) => c.source === 'iptv-org').length

  rmSync(OUT, { recursive: true, force: true })
  mkdirSync(OUT, { recursive: true })

  const assets = path.join(ROOT, 'assets')
  if (existsSync(assets)) {
    for (const f of readdirSync(assets)) {
      if (statSync(path.join(assets, f)).isFile()) copyFileSync(path.join(assets, f), path.join(OUT, f))
    }
  }

  writeFileSync(path.join(OUT, 'index.html'), buildIndexHtml(finalList), 'utf8')
  writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(buildManifest(), null, 2), 'utf8')

  log(`  destino: public/ (${finalList.length} canais: ${fromBase} curados + ${fromIptv} do iptv-org)`)
  log('TV 3.0 · OK')
}

main().catch((err) => {
  console.error('FALHOU:', err)
  process.exit(1)
})
