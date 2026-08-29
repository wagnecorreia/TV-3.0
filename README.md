# TV 3.0

Web TV: **um player único e discreto** que "zapeia" canais (**▲/▼** ou setas do teclado), com a lista atualizada automaticamente toda semana (cron via GitHub Actions).

> "Levar um sinal pra onde não existe." — TV 3.0

## URL

Depois do primeiro deploy:
```
https://SEU_USUARIO.github.io/TV-3.0/
```

Arquivos gerados em `public/`:
- `index.html` — o player (HTTPS, hls.js, troca de faixa entre canais)
- `playlist.m3u` — playlist única (abra num player externo tipo VLC)
- `channels.json` — lista de canais consumida pela página

## Como funciona

- `generator/build.mjs`:
  1. Lê a lista **curada** em `sources/channels.json` (sempre mantida);
  2. Baixa e mescla os canais **do iptv-org/iptv** (HTTPS, sem geo-block / fora do ar);
  3. Gera a `public/` (player + playlist + json);
- `.github/workflows/deploy.yml` — publica a `public/` no **GitHub Pages** a cada push;
- `.github/workflows/update.yml` — **cron toda segunda**, busca o iptv-org novo, regera e dispara o deploy.

## Rodar local

```bash
npm install -g serve   # opcional
npm run build          # regera public/
npm run start          # serve local (http://localhost:8080)
```

## Notas / limites

- Canais **HTTP** (não HTTPS) não tocam na página segura (mixed-content); aparecem com aviso e ficam disponíveis na `playlist.m3u` pra players externos.
- Canais comerciais (Globo etc.) não têm stream HTTPS livre estável; a base curada prioriza fontes públicas/oficiais e satélite (`cdntvms`, EBC, jmvstream).
