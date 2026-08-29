# Proxy HLS da TV 3.0 (Cloudflare Worker)

Este Worker relé o stream **HTTP** da Globo (e outros canais HTTP) em **HTTPS**,
permitindo tocar na página da TV 3.0 (que é HTTPS e bloqueia conteúdo misto).

## Como pegar a URL do worker e ativar

Você tem **2 opções**:

### Opção A — GitHub Actions (recomendado, sem sair daqui)
1. Crie uma conta grátis em https://dash.cloudflare.com
2. Anote o **Account ID** (painel do Cloudflare, no rodapé da página inicial) e
   o **API Token** (My Profile → API Tokens → Create Token → "Edit Cloudflare Workers").
3. No repositório **wagnecorreia/TV-3.0**, vá em:
   **Settings → Secrets and variables → Actions → New repository secret** e adicione:
   - `CF_API_TOKEN` = seu token
   - `CF_ACCOUNT_ID` = seu Account ID
4. Rode o workflow **`deploy-worker`** (Actions → deploy-worker → Run workflow).
5. Pronto: o worker fica em `https://tv30-proxy.<SEU_SUBDOMINIO>.workers.dev`

### Opção B — Dashboard (sem código)
1. Crie a conta grátis em https://dash.cloudflare.com
2. **Workers & Pages → Create → Worker**
3. Copie o conteúdo de `worker/proxy-worker.js` para o editor e clique em **Deploy**.
4. Copie a URL gerada (ex.: `https://tv30-proxy.meu-raiz.workers.dev`).

## Ativar na página
Depois de ter a URL do worker, ative o proxy na TV 3.0:

- **Rápido (teste):** abra a página com `?proxy=SUA_URL`:
  `https://wagnecorreia.github.io/TV-3.0/?proxy=https://tv30-proxy.meu-raiz.workers.dev`

- **Permanente:** edite a constante `PROXY_BASE` lá no começo do script em
  `generator/build.mjs`, coloque a URL do worker, e rode um novo build/push.

> A Globo (e qualquer canal HTTP) passa a tocar direto na página quando o proxy
> está ativo.

## Testar o worker sozinho
Abra no navegador:
`https://SEU-WORKER/?url=https%3A%2F%2F45.190.28.50%2FGLOBO_HD%2Findex.m3u8`
Deve aparecer a lista de playlists (`#EXT-X-STREAM-INF`).
