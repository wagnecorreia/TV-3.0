// TV 3.0 — Cloudflare Worker: proxy HLS HTTP -> HTTPS (para canais como a Globo)
// Deploy: rode o comando no README (worker/README.md) ou cole este código
// no dashboard da Cloudflare (Workers & Pages -> Criar -> Worker) e clique em Deploy.
//
// Uso:  https://SEU-WORKER.workers.dev/?url=<encodeURIComponent(canal original)>
// A página TV 3.0 já envia assim quando você configura o proxy.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Max-Age': '86400',
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') {
      return new Response('', { status: 204, headers: CORS })
    }

    const url = new URL(request.url)
    // Liberar apenas nós mesmos (opcional, mas recomendado) e o GitHub Pages:
    const origin = request.headers.get('Origin') || url.origin
    const allowed = !origin || origin.startsWith('https://wagnecorreia.github.io')
    if (!allowed) {
      return new Response('Origin nao permitido', { status: 403, headers: CORS })
    }

    const targetRaw = url.searchParams.get('url')
    if (!targetRaw) {
      return new Response('Faltou o parametro url', { status: 400, headers: CORS })
    }

    let target
    try {
      target = new URL(targetRaw)
    } catch (e) {
      // aceita URL relativa contra o próprio worker? não — obriga absoluta.
      return new Response('URL invalida', { status: 400, headers: CORS })
    }
    if (target.protocol !== 'http:' && target.protocol !== 'https:') {
      return new Response('Protocolo nao suportado', { status: 400, headers: CORS })
    }
    // Impede o worker de virar open-proxy geral: só relay de .m3u8/TS de streaming
    // (libera qualquer host http/https, mas você pode restringir abaixo se quiser a Globo)
    // const hostsPermitidos = ['45.190.28.50']
    // if (!hostsPermitidos.includes(target.hostname)) return new Response('Host nao permitido', { status: 403 })

    const upstream = await fetch(target, {
      headers: {
        'User-Agent': request.headers.get('User-Agent') || 'Mozilla/5.0 TV-3.0',
        'Referer': target.origin + '/',
      },
      redirect: 'follow',
    })

    const contentType = upstream.headers.get('Content-Type') || ''
    let body = upstream.body

    // Se for playlist m3u8, reescreve as URLs internas para voltar pelo proxy
    if (contentType.includes('mpegurl') || target.pathname.endsWith('.m3u8')) {
      const text = await upstream.text()
      const rewritten = text.split('\n').map((line) => {
        const l = line.trim()
        if (l === '' || l.startsWith('#')) return line
        // resolve relativo contra o target atual
        const abs = new URL(l, target).toString()
        const fwd = new URL(url.origin) // mesmo worker
        fwd.pathname = '/'
        fwd.search = ''
        fwd.searchParams.set('url', abs)
        return fwd.toString()
      }).join('\n')
      body = new Response(rewritten, {
        status: upstream.status,
        headers: upstream.headers,
      }).body
    }

    const headers = new Headers(upstream.headers)
    headers.set('Access-Control-Allow-Origin', '*')
    headers.set('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Content-Type, Accept-Ranges')

    return new Response(body, {
      status: upstream.status,
      headers,
    })
  },
}
