# CHECKPOINT — TV 3.0

> Checkpoint automático para o assistente retomar o trabalho quando o usuário disser **"pronto! podemos voltar!"**.
> Não edite este arquivo manualmente entre uma sessão e outra. Leia-o **do início** antes de continuar.

---

## 1. Ideia central do app

- **TV 3.0** é uma web TV pessoal **de uso privado** (só o usuário e o pai dele — **não será divulgado**).
- App rodando em `https://wagnecorreia.github.io/TV-3.0/`.
- Objetivo das próximas mudanças: **fica bonito, limpo, rápido, eficiente**, canal **sem travar/engasgar** (bom buffer/cache), e com o **melhor media player possível**.

---

## 2. Estado ATUAL do código (o que JÁ está implementado/pendente — leia com atenção)

### 2.1. Lógica / biblioteca
- Player usa **hls.js v1** via CDN: `<script src="https://cdn.jsdelivr.net/npm/hls.js@1"></script>`.
- Todo o HTML/CSS/JS do player fica **embutido** no `generator/build.mjs` (não é arquivo separado).
  - `echo` do HTML: começa em ~linha 200 (CSS) e ~linha 280 (HTML `<body>`).
  - JS do player: ~linha 326 até ~linha 606.
- Estrutura dos canais gerada a partir de `sources/channels.json` (curada) + complemento do iptv-org (que passa por verificação de HLS).

### 2.2. Arquivos principais
- `generator/build.mjs` — TODO o player (HTML/CSS/JS) + geração da `public/`.
- `sources/channels.json` — lista curada de canais (já teve a Globo editada).
- `worker/proxy-worker.js` + `wrangler.toml` — worker Cloudflare em `https://tv30-proxy.som-wagner.workers.dev`.
- `public/` — gerada via `npm run build` (commitar após mudanças).
- `.github/workflows/` — `deploy.yml` (Pages), `deploy-worker.yml`, `update.yml` (cron).

### 2.3. JÁ FEITO e publicado
- **Fallback da Globo** no Globoplay via nova aba foi implementado e publicado (commit `c30d774`, deploy OK).
- **Canais Globo via FrostView** (proxy `https://frostview.cloutteam.com/proxy/hls/{base64}.m3u8`) já foram adicionados ao `sources/channels.json`:
  - `globo` = **Globo RJ** (padrão nacional)
  - `globo-sp`, `globo-minas`, `globo-rede-bahia`, `globo-rpc-curitiba`, `globo-rbs-porto-alegre`, `globo-nordeste`
  - Validação de CORS: **liberado** (`Access-Control-Allow-Origin: *`), fonte funciona de datacenter.
- Estados bloqueados por IP (45.190.28.50 / 45.162.64.114) continuam HTTP e **não tocam** sem proxy.

> ⚠️ IMPORTANTE: essas edições no `channels.json` **ainda não foram commitadas nem buildadas/deployadas**. Estado real de commits/`git status` precisa ser conferido ao retomar.

---

## 3. O QUE O USUÁRIO PEDIU NESTA ÚLTIMA MENSAGEM (próximos passos)

O usuário quer uma **limpeza + melhorias de performance + visual** no app. Lista de pedidos:

1. **Pegar os ícones (logos) da própria FrostView para os canais abertos** e usar no app.
2. **Limpar as gambiarras que foram feitas para colocar a Globoplay numa aba** (remover botão/fallback de Globoplay).
3. **Remover o botão "Play"** da interface.
4. **Trocar os ícones `<<` e `>>` por algo que diga "avançar/voltar canal"** (texto/legenda).
5. **Melhorar o media player** (hls.js) para rodar **sem travar/engasgar**, com **bom buffer/cache**.
6. **Fazer todos os canais, ao trocar, carregarem ~15s de buffer** para não travar; **pode reduzir a resolução durante esse período** só para dar tempo de encher o buffer (depois sobe a qualidade).
7. Resultado final: **ficar limpo, eficiente, rápido e "bem bonito"**.
8. Meta: canal **sem travar nem engasgar** — escolher a **melhor configuração/player** para vivacidade de transmissão ao vivo.

---

## 4. PLANO TÉCNICO detalhado (como implementar cada pedido)

### 4.1. Remover gambiarras da Globoplay (limpeza)
Em `generator/build.mjs`, remover:
- **HTML**: `<button class="globo-fallback" id="globoFallback" hidden>Assistir Globo oficial ▶</button>` (~linha 297).
- **CSS**: bloco `#poster .globo-fallback ...` (~linhas 246–249) e suas variantes hover/active/hidden.
- **JS**:
  - ref `const globoFallback = document.getElementById('globoFallback');` (~344)
  - constantes `GLOBO_LIVE` / `GLOBO_EXCLUDE` (~347–348)
  - funções `isGloboLive` (~374), `openGloboOficial` (~381), `updateGloboFallback` (~387), `globoFail` (~394)
  - chamadas: em `renderNow` (`updateGloboFallback()` ~483), em `armLoadTimer` (~493 `if (isGloboLive...)`), em `playChannel` (~515 `isHttp && !PROXY_BASE` + `isGloboLive` ~537), e `globoFallback.onclick` (~583).
- ⚠️ Ao remover `globoFail`, o comportamento nas falhas da Globo passa a ser **pular para o próximo canal** (igual aos demais). Como a Globo agora é HTTPS via FrostView, ela nunca entra no ramo `isHttp && !PROXY_BASE`.

### 4.2. Remover botão "Play"
- **HTML**: remover `<button class="ctrl" id="play" ...>⏯</button>` (~307).
- **CSS**: o `.ctrl` continua (usado por prev/next).
- **JS**:
  - ref `const playBtn = document.getElementById('play');` (~337)
  - função `toggle()` (~577)
  - `playBtn.onclick = toggle;` (~581)
  - handler de tecla de espaço (`e.key === ' ' ... toggle()` ~593) — avaliar remover; se remover, a tecla "espaço" não deve pausar.

### 4.3. Trocar `<<` / `>>` por texto
- **HTML** (~306–308): trocar conteúdo dos botões prev/next, ex.:
  - `id="prev"` → `<span class="nav-txt">‹&nbsp;Voltar</span>`
  - `id="next"` → `<span class="nav-txt">Avançar&nbsp;›</span>`
  - (remover o do meio `play`)
- **CSS**: ajustar `.ctrl` para caber texto (largura em vez de círculo perfeito, ou manter círculo com texto pequeno). Adicionar `.ctrl .nav-txt` com font-weight e tamanho adequados.

### 4.4. Ícones da FrostView para canais abertos
- Consultar o catálogo/`manifest` do FrostView e extrair o campo **`logo`** dos canais abertos (Globo, SBT, Record, Band, RedeTV!, TV Cultura, TV Brasil, TV Gazeta, TV Câmara, TV Senado, etc.).
- Substituir os `logo` atuais desses canais em `sources/channels.json` pelos logos da FrostView.
- Dica de onde buscar: `https://frostview.cloutteam.com/manifest.json` e os catálogos `catalog/channel/...json` (ex.: `.../genre=Canais%20Globo.json`, e outros gêneros abertos).

### 4.5. Media player + buffer (~15s) + reduzir resolução no início
- Configuração do `Hls(...)` em `playChannel` (~534) e `preloadNext` (~567). Sugestão de config:
  ```js
  const HBUF = {
    autoStartLoad: true,
    lowLatencyMode: false,
    capLevelToPlayerSize: true,
    maxBufferLength: 45,       // segundos de buffer à frente
    maxMaxBufferLength: 90,
    backBufferLength: 20,      // buffer atrás (para não dar problema de seek)
    maxBufferSize: 150 * 1000 * 1000,
    maxBufferHole: 0.8,
    manifestLoadingMaxRetry: 4,
    levelLoadingMaxRetry: 4,
    fragLoadingMaxRetry: 4,
    fragLoadingTimeOut: 30000,
  };
  ```
- **Reduzir resolução no início / encher 15s de buffer**:
  - No `MANIFEST_PARSED`, forçar `h.startLevel = 0` (menor qualidade) para carregar rápido e encher o buffer.
  - Depois de ~15s (ou quando a qualidade estabilizar), subir: `h.currentLevel = -1` (auto).
  - Alternativa já testada em live: `liveSyncDurationCount: 6` (garante alguns segundos de atraso para não travar).
  - Manter `preloadNext` para pré-carregar o próximo canal (já existe).

---

## 5. COMO VERIFICAR / RODAR

- Build: `npm run build` → roda `node generator/build.mjs` → gera `public/`.
- Commitar e publicar: `git add`, `git commit`, `git push` (dispara o workflow de deploy Pages).
- Testar local: `npm run start` (serve `public/`).
- Conferir deploy: aba Actions no GitHub (`deploy.yml`).

> Lembrete: em máquina Windows, usar `gh` em `C:\Program Files\GitHub CLI\gh.exe` e `git` em `C:\Program Files\Git\cmd\git.exe`, adicionando-os ao `$env:PATH` antes de usar.

---

## 6. PENDÊNCIAS / DECISÕES A CONFIRMAR AO RETOMAR

1. **Git status real** do repo (o que já foi commitado? a edição da Globo/FrostView está só em working dir?).
2. Se o usuário quer **manter** a barra de espaço para play/pause (já que o botão Play será removido).
3. Quais logos exatos da FrostView usar e para **quais** canais (só os abertos principais ou todos).
4. Confirmar o ajuste fino de buffer (15s) e a redução de resolução inicial — quanto tempo e se o usuário quer que **suba sozinha** depois.
5. Testar no **navegador/WebView Android** (comportamento de live: sem freeze, resolução sobe após buffer).

---

_Fim do checkpoint. Para retomar: ler este arquivo do início e executar o plano da seção 4._
