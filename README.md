# ❄ HIPERBLUFF — Texas Hold'em Multiplayer PWA

**HIPERBLUFF** é um jogo web de **Poker No-Limit Texas Hold'em** (até 6 jogadores por mesa), construído em **HTML5, CSS3 e Vanilla JavaScript (ES Modules)** sem frameworks nem passo de *build*. Está alojado no GitHub Pages e otimizado como **PWA mobile 100% horizontal (landscape)** com backend em **Firebase Realtime Database**.

🔗 **Demo / Produção:** `https://joaocarlinhosfm.github.io/HIPERBLUFF`

---

## ✨ Funcionalidades Principais

### 🃏 Motor de Poker (`poker.js`)
* **Regras oficiais de No-Limit Texas Hold'em:** rotação do botão Dealer (`D`) com regra Heads-Up, *burn cards* antes do Flop/Turn/River, *Split Pot*, devolução de apostas não igualadas e cálculo completo de **Side Pots** (incluindo proteção de `deadPot` caso um jogador saia a meio da mão).
* **Baralho criptograficamente seguro (CSPRNG):** `window.crypto.getRandomValues` + *Rejection Sampling* (elimina *modulo bias*) + algoritmo de Fisher-Yates.
* **Avaliador de mãos 5-de-7:** identifica todas as combinações de Carta Alta até Royal Flush e destaca em dourado as exatas 5 cartas vencedoras no Showdown.
* **Run-out automático em All-In:** quando já ninguém pode apostar, as cartas dos jogadores ativos viram para cima e cada rua cai com pausa de `1,3 s`.

### 🌐 Multiplayer Online & Mesas Vitalícias (`game.js`)
* **3 Mesas Online Permanentes** no Firebase (nunca são apagadas quando ficam vazias), com lotação em tempo real (`X/6`):
  | Mesa | ID RTDB | Buy-In | Entrada Mín. | Blinds (SB / BB) | Ambiente |
  | :--- | :--- | :---: | :---: | :---: | :--- |
  | **Mesa Gelo** | `MESA_1` | 5 000 € | 100 € | 50 € / 100 € | Lounge Glacial (`bg-gelo.png`) |
  | **Mesa Ouro** | `MESA_2` | 10 000 € | 10 000 € | 100 € / 200 € | Casino Clássico (`bg-ouro.png`) |
  | **Mesa VIP** | `MESA_3` | 50 000 € | 50 000 € | 500 € / 1 000 € | Penthouse VIP (`bg-vip.png`) |
* **Estabilidade e resiliência:** entrada e *Rebuy* atómicos via `runTransaction`, presença em tempo real com `onDisconnect()`, migração automática de anfitrião (`hostId`) após 6 s, remoção de jogadores desligados após 15 s e reconexão automática após F5 (`sessionStorage`).
* **Mesa Offline vs Bots:** partida instantânea contra 4 bots (Buy-in 1 000 €, Blinds 10 € / 20 €).

### 👤 Conta, Carteira e 29 Avatares Animados (`user.js`)
* **Autenticação simples:** username + PIN numérico de 4 dígitos com hash SHA-256 e sessão persistente em `localStorage`.
* **Carteira real:** novas contas arrancam com **100 000 €**; lucros, perdas e estatísticas de carreira (vitórias, taxa de vitória, Folds, All-Ins, Raises, Calls, Checks, maior ganho e melhor série) são atualizados no Firebase via transações atómicas.
* **29 Avatares vetoriais SVG com animações de vitória:** 12 clássicos de poker + 17 temáticos de **frio, climatização e Danfoss** (Pressostato KP, Filtro DML, Válvula T2, Visor DRY, Compressor Bitzer, Ventilador, Manómetro Digital 550s, Manifold, Bomba de Vácuo, Cobre & Corte, Maçarico, CO₂ R744, R32, Alarme HP, Termóstato `-25°C`, Técnico e Pinguim). Ao vencer uma mão, o avatar amplia e dispara a sua animação dedicada.

### 🎨 Interface 3D, Áudio e PWA (`style.css`, `menus.css`, `audio.js`, `sw.js`)
* **Mesa 3D inclinada com fita LED dinâmica** (7 temas de cor) e fundos personalizados HD por mesa.
* **Layout estilo Zynga Poker:** 5 lugares por defeito com alternância dinâmica para 6 lugares, Dealer fixa em SVG vetorial HD e HUD flutuante compacto no canto inferior direito.
* **Mobile-first horizontal:** ecrã de bloqueio vertical (`#portrait-lock`), Fullscreen nativo com `screen.orientation.lock("landscape")`, suporte a `safe-area-inset` e bloqueio de zoom acidental.
* **Áudio 100% sintético:** motor em Web Audio API (`audio.js`) com zero ficheiros MP3.

---

## 📁 Estrutura de Ficheiros

```text
HIPERBLUFF/
├── index.html        # 4 ecrãs independentes (Login, Hub, Perfil, Mesa) + Modais + Portrait Lock
├── style.css         # Mesa 3D, LED dinâmico, fundos HD, layout 5/6 lugares, HUD e 29 animações SVG
├── menus.css         # Estilos de Login, Hub (3 cards), Modal de Mesas Vitalícias, Perfil e Avatares
├── game.js           # Orquestração da UI, Firebase RTDB, presença, timers, bots, PWA e Fullscreen
├── poker.js          # Motor puro Texas Hold'em, CSPRNG, avaliador 5-de-7, Side Pots e salas permanentes
├── user.js           # Autenticação (SHA-256), carteira, estatísticas e catálogo dos 29 avatares SVG
├── audio.js          # Motor de efeitos sonoros sintéticos em Web Audio API
├── manifest.json     # Configuração PWA (fullscreen + landscape)
├── sw.js             # Service Worker para cache local (ignora pedidos ao Firebase)
├── bg-gelo.png       # Fundo HD da Mesa 1 (Lounge Glacial)
├── bg-ouro.png       # Fundo HD da Mesa 2 (Casino Clássico)
├── bg-vip.png        # Fundo HD da Mesa 3 (Penthouse VIP)
├── icon-192.png      # Ícone PWA 192x192
├── icon-512.png      # Ícone PWA 512x512
├── README.md         # Documentação geral do projeto
└── ARCHITECTURE.md   # Arquitetura técnica, modelo de dados e guia de desenvolvimento
```

---

## 🚀 Desenvolvimento Local e Deploy

Como não existem dependências de *build* nem `node_modules`, basta servir a pasta por HTTP local (necessário para **ES Modules** e **Service Worker**):

```bash
# Opção 1: Python 3
python3 -m http.server 8080

# Opção 2: Node.js (npx)
npx serve .
```

Abre `http://localhost:8080` no browser. Para testar multiplayer localmente, abre **dois separadores distintos** (cada separador gera o seu próprio `playerId` em `sessionStorage`).

### Checklist de Deploy (GitHub Pages)
1. Atualizar o *query param* de versão em `index.html` (`style.css?v=XX`, `menus.css?v=XX`).
2. Incrementar o nome da cache em `sw.js` (ex.: `hiperbluff-v25` → `hiperbluff-v26`) e garantir que todos os novos ficheiros locais constam na lista de *precache*.
3. Confirmar que nomes de imagens/assets respeitam rigorosamente **minúsculas** (o GitHub Pages é *case-sensitive*).
4. Fazer *commit* e *push* para a branch publicada no GitHub Pages.

---

## 🗺️ Próximos Passos (Roadmap)

* **Proteção contra falência / Bónus Diário aleatório** para contas com saldo baixo.
* **Ranking Global (Top 10)** num nó público dedicado (`leaderboard`) sem expor `pinHash`.
* **Bots mais inteligentes** (decisões pré-flop e pós-flop baseadas na força real das cartas e *pot odds*).
* **Blindagem multiplayer e de regras:** escape de XSS no `username`, sincronização com `.info/serverTimeOffset`, bloqueio da mesma conta sentada duas vezes, correção de `refundUncalledBet` com 1 apostador e regra de *All-In* curto sem reabrir apostas.
* **Melhorias de UX/PWA:** *Network-First* no `sw.js` para código, fichas visuais de 1 000 € a 25 000 € na Mesa VIP e controlo de som no Hub/Perfil.