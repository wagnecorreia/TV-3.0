import { readFileSync, writeFileSync } from 'node:fs'

const URI = 'https://frostview.cloutteam.com/proxy/hls/'
function b64(id) {
  return Buffer.from(`http://praia13.com:80/live/939041/8SA9sh/${id}.m3u8`, 'utf8').toString('base64')
}
function l(url) { return URI + url + '.m3u8' }
function link(id, q) { return { q, url: l(b64(id)) } }

// ordem: HD primeiro (preferência de início), depois FHD, SD e por fim 4K
const MAP = {
  'globo':                [['131163', 'HD'], ['72025', 'FHD'], ['131182', 'SD']],
  'globo-sp':             [['131212', 'HD'], ['72040', 'FHD'], ['72042', 'SD']],
  'globo-minas':          [['131159', 'HD'], ['131200', 'FHD'], ['131209', 'SD']],
  'globo-rede-bahia':     [['131123', 'HD'], ['131213', 'FHD'], ['72024', 'SD']],
  'globo-rpc-curitiba':   [['72626', 'HD'], ['131199', 'FHD'], ['131127', 'SD']],
  'globo-rbs-porto-alegre': [['72017', 'HD'], ['131102', 'FHD'], ['131198', 'SD']],
  'globo-nordeste':       [['131157', 'HD'], ['72001', 'FHD'], ['72003', 'SD']],
  'sbt':                  [['108682', 'HD'], ['108681', 'FHD'], ['108683', 'SD']],
  'record':               [['72594', 'HD'], ['106638', 'FHD'], ['96526', 'SD']],
  'redetv':               [['72299', 'HD'], ['72297', 'FHD'], ['72300', 'SD'], ['178532', '4K']],
}

// cultura: mantém o URL oficial (player uol) como primeiro link "confiável", praia13 como reserva
const CULTURA = [
  { q: 'HD·UOL', url: 'https://player-tvcultura.stream.uol.com.br/live/tvcultura.m3u8' },
  link('71851', 'FHD'),
  link('71853', 'HD'),
  link('71854', 'SD'),
  link('103513', '4K'),
]

// novidades: canais de notícia com 4K quando existir
const NEWS = {
  'globo-news':   [['71999', 'HD'], ['71998', 'FHD'], ['131112', 'SD'], ['90248', '4K']],
  'record-news':  [['72272', 'HD'], ['72271', 'FHD'], ['72273', 'SD'], ['178523', '4K']],
  'cnn-brasil':   [['71839', 'HD'], ['71837', 'FHD'], ['71840', 'SD'], ['71798', '4K']],
  'jovem-pan':    [['134024', 'HD'], ['134023', 'FHD'], ['134025', 'SD'], ['134021', '4K']],
}

const path = new URL('../sources/channels.json', import.meta.url)
const j = JSON.parse(readFileSync(path, 'utf8'))

let changed = 0
for (const ch of j.channels) {
  let links = null
  if (ch.id === 'tvcultura') {
    links = CULTURA
  } else if (MAP[ch.id]) {
    links = MAP[ch.id].map(([id, q]) => link(id, q))
  } else if (NEWS[ch.id]) {
    links = NEWS[ch.id].map(([id, q]) => link(id, q))
  }
  if (links) { ch.links = links; changed++; }
}

writeFileSync(path, JSON.stringify(j, null, 2), 'utf8')
console.log('canais atualizados com links:', changed)