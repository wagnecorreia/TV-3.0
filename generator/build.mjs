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
  return (j.channels || []).map((c) => {
    const baseUf = Array.isArray(c.uf) ? c.uf : []
    const inferred = inferUfs(c.name || '')
    const uf = [...new Set([...baseUf, ...inferred])]
    return {
      id: c.id,
      name: c.name,
      logo: c.logo || '',
      url: c.url,
      uf,
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
    name: c.name.replace(/\\/g, '\\\\').replace(/"/g, '\\"'),
    logo: c.logo,
    url: c.url,
    uf: c.uf || [],
    national: !!c.national,
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
  :root { --bg:#07090d; --panel:rgba(16,20,28,.72); --panel-solid:#12161f; --fg:#edf1f8; --muted:#98a0b3; --accent:#3f6cff; --accent2:#22d3ee; }
  * { box-sizing:border-box; margin:0; padding:0; }
  html,body { height:100%; }
  body { font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif; background:var(--bg); color:var(--fg); overflow:hidden; }
  #app { height:100%; position:relative; }

  /* Camada de vídeo (fundo completo) */
  #stage { position:absolute; inset:0; background:#000; }
  video { width:100%; height:100%; background:#000; outline:none; }

  /* Scrims para legibilidade do overlay */
  .scrim-top { position:absolute; top:0; left:0; right:0; height:110px; background:linear-gradient(rgba(0,0,0,.72), rgba(0,0,0,0)); pointer-events:none; z-index:3; }
  .scrim-bottom { position:absolute; bottom:0; left:0; right:0; height:150px; background:linear-gradient(rgba(0,0,0,0), rgba(0,0,0,.78)); pointer-events:none; z-index:3; }

  /* Header integrado (overlay no vídeo) */
  header { position:absolute; top:0; left:0; right:0; display:flex; align-items:center; gap:12px; padding:16px 20px; z-index:4; }
  header .brand { font-weight:800; font-size:19px; letter-spacing:.4px; display:flex; align-items:center; gap:9px; }
  header .brand .dot { width:10px; height:10px; border-radius:50%; background:linear-gradient(135deg,var(--accent),var(--accent2)); box-shadow:0 0 12px var(--accent); }
  header .brand span { color:var(--accent2); }
  header .hint { color:var(--muted); font-size:12px; opacity:.9; }
  .region-btn { margin-left:auto; display:flex; align-items:center; gap:8px; background:var(--panel); border:1px solid rgba(255,255,255,.14); color:var(--fg); padding:9px 14px; border-radius:999px; font-size:13px; font-weight:600; cursor:pointer; backdrop-filter:blur(10px); transition:.15s; }
  .region-btn:hover { border-color:var(--accent2); background:rgba(30,40,60,.8); }
  .region-btn .globe { font-size:15px; }

  /* Poster (loading/erro/first-frame) */
  #poster { position:absolute; inset:0; z-index:2; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:16px; color:var(--muted); text-align:center; padding:24px; background:radial-gradient(circle at 50% 42%, #10151f, #05060a); }
  #poster.hide { display:none; }
  #poster img { width:132px; height:132px; object-fit:contain; filter:drop-shadow(0 8px 24px rgba(0,0,0,.65)); border-radius:20px; background:#11161f; border:1px solid rgba(255,255,255,.06); }
  #poster .msg { font-size:16px; font-weight:600; }
  #poster .small { font-size:13px; color:#606878; }

  /* Barra inferior integrada */
  #now { position:absolute; bottom:0; left:0; right:0; display:flex; align-items:center; gap:16px; padding:18px 22px 26px; z-index:4; }
  #now .logo { width:66px; height:66px; flex:0 0 auto; object-fit:contain; background:rgba(255,255,255,.06); border-radius:14px; padding:8px; border:1px solid rgba(255,255,255,.1); backdrop-filter:blur(6px); }
  #now .meta { min-width:0; }
  #now .name { font-weight:800; font-size:20px; text-shadow:0 2px 12px rgba(0,0,0,.7); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  #now .sub { font-size:12px; color:#aeb6c8; opacity:.85; text-shadow:0 1px 6px rgba(0,0,0,.7); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .controls { display:flex; gap:12px; margin-left:auto; flex:0 0 auto; }
  .ctrl { background:rgba(255,255,255,.08); border:1px solid rgba(255,255,255,.18); color:var(--fg); min-width:56px; height:56px; border-radius:14px; font-size:15px; font-weight:700; cursor:pointer; display:flex; align-items:center; justify-content:center; padding:0 18px; transition:.14s; backdrop-filter:blur(8px); white-space:nowrap; }
  .ctrl:hover { border-color:var(--accent2); background:rgba(34,211,238,.18); transform:translateY(-2px); }
  .ctrl:active { transform:scale(.93); }

  /* Modal de regiões */
  .overlay { position:absolute; inset:0; z-index:20; background:rgba(4,6,10,.6); backdrop-filter:blur(4px); display:none; }
  .overlay.open { display:block; }
  #regionModal { position:absolute; left:50%; top:50%; transform:translate(-50%,-50%); width:min(680px,92vw); max-height:80vh; display:flex; flex-direction:column; background:var(--panel-solid); border:1px solid #232c40; border-radius:20px; overflow:hidden; box-shadow:0 30px 80px rgba(0,0,0,.6); }
  #regionModal .rm-head { display:flex; align-items:center; gap:12px; padding:18px 22px; border-bottom:1px solid #1d2537; }
  #regionModal .rm-head h2 { font-size:18px; font-weight:800; }
  #regionModal .rm-head .rm-close { margin-left:auto; background:none; border:none; color:var(--muted); font-size:26px; cursor:pointer; line-height:1; }
  #regionModal #regionSearch { margin:14px 22px; padding:12px 16px; border-radius:12px; border:1px solid #2a3450; background:#0e1420; color:var(--fg); font-size:15px; }
  #regionModal .rm-body { overflow-y:auto; padding:6px 22px 24px; }
  .region-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(120px,1fr)); gap:10px; }
  .region-item { display:flex; flex-direction:column; align-items:center; gap:4px; padding:14px 8px; border-radius:14px; border:1px solid #222b3f; background:#0d1320; cursor:pointer; transition:.12s; text-align:center; }
  .region-item:hover { border-color:var(--accent2); background:#111a2c; }
  .region-item .code { font-size:20px; font-weight:800; }
  .region-item .nm { font-size:11px; color:var(--muted); }
  .region-item.current { border-color:var(--accent2); background:rgba(34,211,238,.12); }
  .rm-group { font-size:12px; letter-spacing:1px; text-transform:uppercase; color:var(--muted); margin:18px 2px 10px; }
  @media (max-width:560px) { header .hint{display:none;} .ctrl{width:50px;height:50px;font-size:20px;} #now .logo{width:54px;height:54px;} #now .name{font-size:17px;} }
</style>
</head>
<body>
<div id="app">
  <div id="stage">
    <video id="video" playsinline autoplay></video>
    <video id="previd" playsinline muted preload="metadata" style="position:absolute;width:1px;height:1px;opacity:0;pointer-events:none"></video>
    <div class="scrim-top"></div>
    <div class="scrim-bottom"></div>
    <header>
      <div class="brand"><span class="dot"></span>TV <span>3.0</span></div>
      <div class="hint">zapeia com setas do teclado</div>
      <button class="region-btn" id="regionBtn" title="Trocar região"><span class="globe">🌐</span><span id="regionLabel">Detectando…</span></button>
    </header>
    <div id="poster">
      <img id="posterLogo" alt="">
      <div class="msg" id="posterMsg">Carregando sinal…</div>
      <div class="small">Se ficar parado, troque de canal</div>
    </div>
    <div id="now">
      <img id="nowLogo" class="logo" alt="">
      <div class="meta">
        <div class="name" id="nowName">—</div>
        <div class="sub" id="nowSub"></div>
      </div>
      <div class="controls">
        <button class="ctrl" id="prev" title="Canal anterior (←)"><span class="nav-txt">‹ Voltar</span></button>
        <button class="ctrl" id="next" title="Próximo canal (→)"><span class="nav-txt">Avançar ›</span></button>
      </div>
    </div>
  </div>

  <div class="overlay" id="overlay">
    <div id="regionModal">
      <div class="rm-head">
        <h2>Escolha sua região</h2>
        <button class="rm-close" id="rmClose">×</button>
      </div>
      <input id="regionSearch" type="search" placeholder="Procure por estado ou cidade…">
      <div class="rm-body" id="regionBody"></div>
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
const regionBtn = document.getElementById('regionBtn');
const regionLabel = document.getElementById('regionLabel');
const overlay = document.getElementById('overlay');
const rmClose = document.getElementById('rmClose');
const regionSearch = document.getElementById('regionSearch');
const regionBody = document.getElementById('regionBody');

// Proxy para canais HTTP (ex.: Globo). Preencha com a URL do seu Cloudflare Worker.
// Dica: pode testar com  ?proxy=https://SEU-WORKER.workers.dev  sem redeploy.
const PROXY_BASE = (new URLSearchParams(location.search).get('proxy'))
  || localStorage.getItem('tv30_proxy') || '';

const START_TIMEOUT = 10000;

let idx = 0;
let live = true;
let loadTimer = null;
let tryingIndex = -1;
let currentUF = '';

const UF_NAMES = { AC:'Acre', AL:'Alagoas', AP:'Amapá', AM:'Amazonas', BA:'Bahia', CE:'Ceará', DF:'Distrito Federal', ES:'Espírito Santo', GO:'Goiás', MA:'Maranhão', MT:'Mato Grosso', MS:'Mato Grosso do Sul', MG:'Minas Gerais', PA:'Pará', PB:'Paraíba', PR:'Paraná', PE:'Pernambuco', PI:'Piauí', RJ:'Rio de Janeiro', RN:'Rio Grande do Norte', RS:'Rio Grande do Sul', RO:'Rondônia', RR:'Roraima', SC:'Santa Catarina', SP:'São Paulo', SE:'Sergipe', TO:'Tocantins' };
const UF_ORDER = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];

function normalize(s) { return String(s||'').normalize('NFD').replace(/[^a-z0-9]/gi,'').toLowerCase(); }

function onlineUrl(c) {
  if (!PROXY_BASE) return c.url;
  return PROXY_BASE + (PROXY_BASE.endsWith('?') ? '' : '?') + 'url=' + encodeURIComponent(c.url);
}

// --- Geolocalização ---
async function detectRegion() {
  const apis = [
    { url: 'https://ipwho.is/', pick: (j) => j.region_code },
    { url: 'https://ipapi.co/json', pick: (j) => j.region_code },
    { url: 'https://get.geojs.io/v1/ip/geo.json', pick: (j) => j.region },
    { url: 'https://ipinfo.io/json', pick: (j) => (j.region || '').substring(0,2).toUpperCase() },
  ];
  for (const api of apis) {
    try {
      const r = await fetch(api.url, { signal: AbortSignal.timeout(6000) });
      if (!r.ok) continue;
      const j = await r.json();
      let code = api.pick(j);
      if (code) {
        code = String(code).toUpperCase().trim();
        if (code.length === 2 && UF_NAMES[code]) return code;
        // se veio nome do estado, tenta casar com a lista
        const hit = Object.keys(UF_NAMES).find((uf) => normalize(UF_NAMES[uf]) === normalize(code)) ||
                    Object.keys(UF_NAMES).find((uf) => normalize(UF_NAMES[uf]).includes(normalize(code)) || normalize(code).includes(normalize(UF_NAMES[uf])));
        if (hit) return hit;
      }
    } catch (e) {}
  }
  return '';
}

function reorderByRegion(uf) {
  const ranked = CHANNELS.map((c, i) => {
    let score = 2; // outros estados
    if (uf && (c.uf || []).includes(uf)) score = 0;      // do estado
    else if (c.national) score = 1;                        // nacional
    else if (!uf) score = c.national ? 0 : (c.uf.length ? 2 : 1);
    return { c, i, score };
  });
  if (uf) ranked.sort((a, b) => a.score - b.score || a.i - b.i);
  const order = ranked.map((x) => x.c);
  order.forEach((c, k) => { CHANNELS[k] = c; });
}

function setRegion(uf, label) {
  currentUF = uf || '';
  if (uf) reorderByRegion(uf);
  regionLabel.textContent = label || (uf ? (UF_NAMES[uf] ? UF_NAMES[uf] : uf) : 'Todas');
  renderRegionModal();
  playChannel(0);
}

// --- Modal de regiões ---
function openModal() { overlay.classList.add('open'); regionSearch.value = ''; renderRegionModal(); regionSearch.focus(); }
function closeModal() { overlay.classList.remove('open'); }
function renderRegionModal() {
  const q = normalize(regionSearch.value);
  let html = '<div class="rm-group">Nacional</div><div class="region-grid">';
  const mk = (uf, name) => {
    if (q && !normalize(name).includes(q)) return '';
    const cur = currentUF === (uf || '');
    return '<div class="region-item' + (cur ? ' current' : '') + '" data-uf="' + (uf || '') + '"><span class="code">' + (uf || '★') + '</span><span class="nm">' + name + '</span></div>';
  };
  html += mk('', 'Todas as regiões');
  html += mk('BR', 'Nacional') + '</div>';
  html += '<div class="rm-group">Estados</div><div class="region-grid">';
  for (const uf of UF_ORDER) html += mk(uf, UF_NAMES[uf]);
  html += '</div>';
  regionBody.innerHTML = html;
  regionBody.querySelectorAll('.region-item').forEach((el) => {
    el.onclick = () => { setRegion(el.dataset.uf, el.querySelector('.nm').textContent); closeModal(); };
  });
}

// --- Player ---
function setPoster(show, msg) {
  poster.classList.toggle('hide', !show);
  if (msg) posterMsg.textContent = msg;
}
function renderNow() {
  const c = CHANNELS[idx];
  nowName.textContent = (idx + 1) + '. ' + c.name;
  nowSub.textContent = PROXY_BASE && c.url.startsWith('http://') ? 'via proxy' : (c.url || 'sem url');
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
      setPoster(true, 'Sinal lento/fora do ar — pulando para o próximo…');
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
  const isHttp = c.url.startsWith('http://');
  const isHttps = c.url.startsWith('https://');
  if (!c.url || !(isHttps || isHttp)) {
    setPoster(true, 'Sem link para este canal.');
    next();
    return;
  }
  if (isHttp && !PROXY_BASE) {
    setPoster(true, '🔒 Canal via HTTP. Configure o proxy para tocar aqui.');
    let k = 1;
    while (k < CHANNELS.length) {
      const j = (i + k) % CHANNELS.length;
      const u = CHANNELS[j].url;
      if (u.startsWith('https://') || (u.startsWith('http://') && PROXY_BASE)) break;
      k++;
    }
    playChannel(i + k);
    return;
  }
  setPoster(true, 'Carregando: ' + c.name + '…');
  const src = onlineUrl(c);
  if (Hls.isSupported()) {
    try {
      // Configuração otimizada para live: buffer ~15s, startLevel baixo, sobe depois
      const h = new Hls({
        autoStartLoad: true,
        lowLatencyMode: false,
        startLevel: 0,                 // começa na menor qualidade pra encher buffer rápido
        capLevelToPlayerSize: true,
        maxBufferLength: 45,           // segundos de buffer à frente
        maxMaxBufferLength: 90,
        backBufferLength: 20,
        maxBufferSize: 150 * 1000 * 1000,
        maxBufferHole: 0.8,
        manifestLoadingMaxRetry: 4,
        levelLoadingMaxRetry: 4,
        fragLoadingMaxRetry: 4,
        fragLoadingTimeOut: 30000,
        liveSyncDurationCount: 6       // mantém ~6s de atraso pro live não travar
      });
      h.on(Hls.Events.ERROR, (e, data) => {
        if (data && data.fatal && tryingIndex === idx) { next(); }
      });
      h.on(Hls.Events.MANIFEST_PARSED, () => {
        if (tryingIndex === idx) {
          setPoster(false);
          clearTimeout(loadTimer);
          tryingIndex = -1;
          preloadNext();
          // Após ~15s, libera qualidade automática (auto = -1)
          setTimeout(() => { if (h && h.currentLevel !== -1) h.currentLevel = -1; }, 15000);
        }
      });
      video._hls = h;
      if (video.paused) video.play().catch(()=>{});
      h.loadSource(src);
      h.attachMedia(video);
      armLoadTimer(i);
    } catch (e) { setPoster(true, 'Erro no player.'); }
  } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
    video.src = src;
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
    const h = new Hls({
      autoStartLoad: true,
      lowLatencyMode: false,
      startLevel: 0,
      capLevelToPlayerSize: true,
      maxBufferLength: 45,
      maxMaxBufferLength: 90,
      backBufferLength: 20,
      maxBufferSize: 150 * 1000 * 1000,
      maxBufferHole: 0.8,
      manifestLoadingMaxRetry: 4,
      levelLoadingMaxRetry: 4,
      fragLoadingMaxRetry: 4,
      fragLoadingTimeOut: 30000,
      liveSyncDurationCount: 6
    });
    h.on(Hls.Events.ERROR, () => {});
    el._hls = h;
    h.loadSource(c.url);
    h.attachMedia(el);
    setTimeout(() => { if (h && h.currentLevel !== -1) h.currentLevel = -1; }, 15000);
  } catch (e) {}
}

function next() { live = true; playChannel(idx + 1); }
function prev() { live = true; playChannel(idx - 1); }

prevBtn.onclick = prev;
nextBtn.onclick = next;
regionBtn.onclick = openModal;
rmClose.onclick = closeModal;
overlay.onclick = (e) => { if (e.target === overlay) closeModal(); };
document.addEventListener('keydown', (e) => {
  if (overlay.classList.contains('open')) {
    if (e.key === 'Escape') closeModal();
    return;
  }
  if (e.key === 'ArrowRight') next();
  else if (e.key === 'ArrowLeft') prev();
});

(async () => {
  const detected = await detectRegion();
  if (detected) {
    setRegion(detected, UF_NAMES[detected]);
  } else {
    regionLabel.textContent = 'Todas';
    renderRegionModal();
    playChannel(0);
  }
})();
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
    JSON.stringify(finalList.map((c) => ({ id: c.id, name: c.name, logo: c.logo, url: c.url, uf: c.uf, national: c.national })), null, 2),
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
