import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
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
  return (j.channels || []).map((c) => ({
    id: c.id,
    name: c.name,
    logo: c.logo || '',
    url: c.url,
    uf: Array.isArray(c.uf) ? c.uf : [],
  }))
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
      uf: [],
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
    name: c.name.replace(/\\/g, '\\\\').replace(/"/g, '\\"'),
    logo: c.logo,
    url: c.url,
  }))
  const dataJson = JSON.stringify(cryptoItems)
  const total = channels.length

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#0b0e14">
<title>${APP_NAME} · ${APP_TAG}</title>
<link rel="manifest" href="./manifest.json">
<link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>📺</text></svg>">
<style>
  :root { --bg:#0b0e14; --panel:#12161f; --panel2:#181d29; --fg:#e7ebf3; --muted:#8b93a7; --accent:#3f6cff; --accent2:#22d3ee; }
  * { box-sizing:border-box; margin:0; padding:0; }
  html,body { height:100%; }
  body { font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif; background:var(--bg); color:var(--fg); overflow:hidden; }
  #app { height:100%; display:flex; flex-direction:column; }
  header { display:flex; align-items:center; gap:14px; padding:12px 18px; background:var(--panel); border-bottom:1px solid #1f2634; flex:0 0 auto; }
  header .brand { font-weight:800; font-size:18px; letter-spacing:.3px; }
  header .brand span { color:var(--accent); }
  header .hint { color:var(--muted); font-size:13px; margin-left:6px; }
  header .ch-count { margin-left:auto; color:var(--muted); font-size:13px; }
  #stage { flex:1 1 auto; position:relative; background:#000; }
  video { width:100%; height:100%; background:#000; outline:none; }
  #poster { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:16px; color:var(--muted); text-align:center; padding:24px; z-index:2; background:radial-gradient(circle at 50% 40%, #141a28, #000); }
  #poster.hide { display:none; }
  #poster img { width:120px; height:120px; object-fit:contain; filter:drop-shadow(0 6px 18px rgba(0,0,0,.6)); border-radius:16px; background:#11161f; }
  #poster .msg { font-size:15px; }
  #poster .small { font-size:13px; color:#5c6478; }
  #now { flex:0 0 auto; display:flex; align-items:center; gap:14px; padding:12px 18px; background:var(--panel); border-top:1px solid #1f2634; }
  #now .logo { width:52px; height:52px; flex:0 0 auto; object-fit:contain; background:#11161f; border-radius:10px; padding:6px; }
  #now .meta { min-width:0; }
  #now .name { font-weight:700; font-size:16px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  #now .sub { font-size:12px; color:var(--muted); }
  .controls { display:flex; gap:10px; margin-left:auto; flex:0 0 auto; }
  .ctrl { background:var(--panel2); border:1px solid #242c3d; color:var(--fg); width:52px; height:52px; border-radius:12px; font-size:22px; cursor:pointer; display:flex; align-items:center; justify-content:center; transition:.12s; }
  .ctrl:hover { border-color:var(--accent); background:#1d2435; }
  .ctrl:active { transform:scale(.95); }
  .kbd { margin-left:auto; color:#5c6478; font-size:11px; }
  @media (max-width:560px) { .kbd{display:none;} .ctrl{width:46px;height:46px;font-size:20px;} #now .logo{width:44px;height:44px;} }
</style>
</head>
<body>
<div id="app">
  <header>
    <div class="brand">TV <span>3.0</span></div>
    <div class="hint">zapeia com setas ou ▲/▼</div>
    <div class="ch-count">${total} canais</div>
  </header>

  <div id="stage">
    <video id="video" playsinline autoplay muted></video>
    <video id="previd" playsinline muted preload="metadata" style="position:absolute;width:1px;height:1px;opacity:0;pointer-events:none"></video>
    <div id="poster">
      <img id="posterLogo" alt="">
      <div class="msg" id="posterMsg">Carregando sinal…</div>
      <div class="small">Se ficar parado, aperte ► ou troque de canal</div>
    </div>
  </div>

  <div id="now">
    <img id="nowLogo" class="logo" alt="">
    <div class="meta">
      <div class="name" id="nowName">—</div>
      <div class="sub" id="nowSub"></div>
    </div>
    <div class="controls">
      <button class="ctrl" id="prev" title="Anterior (←)">⏮</button>
      <button class="ctrl" id="play" title="Play/Pause (Espaço)">⏯</button>
      <button class="ctrl" id="next" title="Próximo (→)">⏭</button>
    </div>
  </div>
</div>

<script src="https://cdn.jsdelivr.net/npm/hls.js@1"></script>
<script>
const CHANNELS = ${dataJson};
const video = document.getElementById('video');
const poster = document.getElementById('poster');
const posterMsg = document.getElementById('posterMsg');
const posterLogo = document.getElementById('posterLogo');
const nowLogo = document.getElementById('nowLogo');
const nowName = document.getElementById('nowName');
const nowSub = document.getElementById('nowSub');
const prevBtn = document.getElementById('prev');
const nextBtn = document.getElementById('next');
const playBtn = document.getElementById('play');

let idx = 0;
let live = true;
let loadTimer = null;
let tryingIndex = -1;

const START_TIMEOUT = 10000; // 10s sem iniciar -> pula para o proximo canal

function setPoster(show, msg) {
  poster.classList.toggle('hide', !show);
  if (msg) posterMsg.textContent = msg;
}
function renderNow() {
  const c = CHANNELS[idx];
  nowName.textContent = (idx + 1) + '. ' + c.name;
  nowSub.textContent = c.url || 'sem url';
  if (c.logo) { nowLogo.src = c.logo; nowLogo.style.display = ''; } else { nowLogo.style.display = 'none'; }
  posterLogo.src = c.logo || '';
}
function destroyHls(el) {
  if (el._hls) { try { el._hls.destroy(); } catch (e) {} el._hls = null; }
  try { el.pause(); el.removeAttribute('src'); el.load(); } catch (e) {}
}
function armLoadTimer(i) {
  clearTimeout(loadTimer);
  loadTimer = setTimeout(() => {
    if (tryingIndex === i) {
      setPoster(true, 'Sinal lento/fora do ar — pulando para o proximo…');
      next();
    }
  }, START_TIMEOUT);
}

function playChannel(i) {
  i = ((i % CHANNELS.length) + CHANNELS.length) % CHANNELS.length;
  idx = i;
  tryingIndex = i;
  const c = CHANNELS[idx];
  destroyHls(video);
  clearTimeout(loadTimer);
  renderNow();
  if (!c.url || !(c.url.startsWith('https://') || c.url.startsWith('http://'))) {
    setPoster(true, 'Sem link para este canal.');
    next();
    return;
  }
  if (c.url.startsWith('http://')) {
    // HTTP nao toca na pagina segura; pula automaticamente continuando a busca por um HTTPS.
    setPoster(true, '🔒 Pulo canal HTTP (só na playlist.m3u). Buscando o próximo…');
    let k = 1;
    while (k < CHANNELS.length) {
      const j = (i + k) % CHANNELS.length;
      if (CHANNELS[j].url && CHANNELS[j].url.startsWith('https://')) break;
      k++;
    }
    playChannel(i + k);
    return;
  }
  setPoster(true, 'Carregando: ' + c.name + '…');
  if (Hls.isSupported()) {
    try {
      const h = new Hls({ autoStartLoad: true, startLevel: -1 });
      h.on(Hls.Events.ERROR, (e, data) => {
        if (data && data.fatal && tryingIndex === idx) { next(); }
      });
      h.on(Hls.Events.MANIFEST_PARSED, () => {
        if (tryingIndex === idx) { setPoster(false); clearTimeout(loadTimer); tryingIndex = -1; preloadNext(); }
      });
      video._hls = h;
      if (video.paused) video.play().catch(()=>{});
      h.loadSource(c.url);
      h.attachMedia(video);
      armLoadTimer(i);
    } catch (e) { setPoster(true, 'Erro no player.'); }
  } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
    video.src = c.url;
    if (video.paused) video.play().catch(()=>{});
    setPoster(false); clearTimeout(loadTimer); tryingIndex = -1; preloadNext();
  } else {
    setPoster(true, 'Seu navegador não suporta HLS.');
  }
}

function preloadNext() {
  const el = document.getElementById('previd');
  const j = (idx + 1) % CHANNELS.length;
  const c = CHANNELS[j];
  destroyHls(el);
  if (!c.url || !c.url.startsWith('https://')) return;
  if (!Hls.isSupported()) return;
  try {
    const h = new Hls({ autoStartLoad: true, startLevel: -1 });
    h.on(Hls.Events.ERROR, () => {});
    el._hls = h;
    h.loadSource(c.url);
    h.attachMedia(el);
  } catch (e) {}
}

function next() { live = true; playChannel(idx + 1); }
function prev() { live = true; playChannel(idx - 1); }
function toggle() { if (video.paused) { video.play().catch(()=>{}); } else { video.pause(); } }

prevBtn.onclick = prev;
nextBtn.onclick = next;
playBtn.onclick = toggle;

document.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowRight') next();
  else if (e.key === 'ArrowLeft') prev();
  else if (e.key === ' ' || e.code === 'Space') { e.preventDefault(); toggle(); }
});

playChannel(0);
</script>
</body>
</html>`
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
  }
}

function buildM3u(channels) {
  const lines = ['#EXTM3U']
  for (const c of channels) {
    if (!c.url) continue
    const logo = c.logo ? ` tvg-logo="${c.logo}"` : ''
    lines.push(`#EXTINF:-1${logo},${c.name}`)
    lines.push(c.url)
  }
  return lines.join('\n') + '\n'
}

// Ordena colocando os canais curados (confiaveis) primeiro, depois os do iptv-org.
function orderLists(merged) {
  const curated = merged.filter((c) => c.source === 'curada')
  const iptv = merged.filter((c) => c.source === 'iptv-org')
  const byName = (a, b) => a.name.localeCompare(b.name, 'pt-BR')
  return [...curated.sort(byName), ...iptv.sort(byName)]
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

  let complement = []
  try {
    complement = await fetchIptvOrg()
    log(`  iptv-org: ${complement.length} candidatos HTTPS`)
  } catch (err) {
    log(`  aviso: não deu pra buscar iptv-org (${err.message}) — segue só com a base.`)
  }

  const merged = merge(base, complement)
  log(`  mesclado: ${merged.length} (${base.length} curados + ${merged.length - base.length} do iptv-org)`)

  // Verifica (rapidamente) os canais do iptv-org e remove os que não respondem HLS.
  let finalList = merged
  let dead = 0
  if (!GOVERNMENTAL_ONLY) {
    log('  verificando canais HTTPS do iptv-org (removendo mortos/lentos)…')
    const r = await verifyOnly(merged, 'iptv-org')
    finalList = r.kept
    dead = r.dead
    log(`  verificacao: ${finalList.length - base.length} aprovados, ${dead} removidos`)
  }

  finalList = orderLists(finalList)
  const fromBase = finalList.filter((c) => c.source === 'curada').length
  const fromIptv = finalList.filter((c) => c.source === 'iptv-org').length

  rmSync(OUT, { recursive: true, force: true })
  mkdirSync(OUT, { recursive: true })

  writeFileSync(path.join(OUT, 'index.html'), buildIndexHtml(finalList), 'utf8')
  writeFileSync(path.join(OUT, 'playlist.m3u'), buildM3u(finalList), 'utf8')
  writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(buildManifest(), null, 2), 'utf8')
  writeFileSync(
    path.join(OUT, 'channels.json'),
    JSON.stringify(finalList.map((c) => ({ id: c.id, name: c.name, logo: c.logo, url: c.url, uf: c.uf })), null, 2),
    'utf8'
  )
  writeFileSync(
    path.join(OUT, 'channels-status.json'),
    JSON.stringify({ generatedAt: new Date().toISOString(), total: finalList.length, fromCurated: fromBase, fromIptvOrg: fromIptv, removedDead: dead }, null, 2),
    'utf8'
  )

  log(`  destino: public/ (${finalList.length} canais: ${fromBase} curados + ${fromIptv} do iptv-org)`)
  log('TV 3.0 · OK')
}

main().catch((err) => {
  console.error('FALHOU:', err)
  process.exit(1)
})
