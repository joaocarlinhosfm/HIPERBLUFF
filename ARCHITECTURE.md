# 🏛️ Arquitetura Técnica — HIPERBLUFF

Este documento serve de referência técnica para manter, depurar e expandir o **HIPERBLUFF** sem quebrar invariantes de jogo, sincronização online ou layout mobile horizontal.

---

## 1. Visão Geral da Arquitetura

O projeto segue uma arquitetura **modular em Vanilla JS (ES Modules)** sem *bundler*, separada em quatro camadas claras:

```text
┌────────────────────────────────────────────────────────────────────┐
│  CAMADA DE APRESENTAÇÃO (index.html + style.css + menus.css)       │
│  4 ecrãs exclusivos (.screen.active) + 3 modais + bloqueio vertical│
└───────────────────────────────┬────────────────────────────────────┘
                                │ DOM Events & Render
┌───────────────────────────────▼────────────────────────────────────┐
│  CAMADA DE ORQUESTRAÇÃO (game.js)                                  │
│  • Listeners Firebase RTDB (salas + presença)                      │
│  • Loop de timers (100 ms), bots offline, PWA & Fullscreen         │
│  • Renderização imperativa da mesa, HUD, Hub, Perfil e Avatares    │
└──────────┬────────────────────┬────────────────────┬───────────────┘
           │                    │                    │
┌──────────▼─────────┐ ┌────────▼─────────┐ ┌────────▼──────────────┐
│ MOTOR DE REGRAS    │ │ UTILIZADOR       │ │ ÁUDIO SINTÉTICO       │
│ (poker.js)         │ │ (user.js)        │ │ (audio.js)            │
│ • Funções puras    │ │ • Auth SHA-256   │ │ • Web Audio API       │
│ • CSPRNG shuffle   │ │ • Carteira RTDB  │ │ • Zero assets áudio   │
│ • Side Pots / Hand │ │ • 29 Avatares    │ │                       │
└────────────────────┘ └──────────────────┘ └───────────────────────┘
                                │
┌───────────────────────────────▼────────────────────────────────────┐
│  FIREBASE REALTIME DATABASE (SDK v10.12.2 • europe-west1)          │
│  • /users/{usernameKey}                                            │
│  • /rooms/{MESA_1 | MESA_2 | MESA_3} (+ /presence/{playerId})      │
└────────────────────────────────────────────────────────────────────┘
```

### Princípios de Design
* **`poker.js` não toca no DOM nem no Firebase:** recebe um `roomState`, clona-o com `structuredClone`, normaliza-o e devolve o próximo estado imutável. Isto permite partilhar exatamente a mesma lógica entre o modo Online e o modo Offline vs Bots.
* **Estado único por sala:** a fonte de verdade de cada mesa é o objeto JSON em `rooms/{roomId}` (online) ou a variável `roomState` em memória (offline).
* **Zero dependências externas além do SDK CDN do Firebase.**

---

## 2. Responsabilidades por Módulo

| Ficheiro | Responsabilidade | O que NÃO deve conter |
| :--- | :--- | :--- |
| `poker.js` | Constantes de jogo, `PERMANENT_ROOMS`, baralho CSPRNG, `evaluateBestHand`, `buildSidePots`, `normalizeRoomState`, `buildNewHandState`, `advancePhaseOnState`, `applyActionToState`, `removePlayerFromState`. | Acesso ao DOM, chamadas Firebase, `localStorage`/`sessionStorage`. |
| `user.js` | Autenticação (`registerUser`, `loginUser`, `restoreSession`, `logoutUser`), gestão atómica da carteira (`applyBalanceDelta`, `recordActionStats`), atualização de avatar (`updateUserAvatar`) e catálogo `AVATAR_CATALOG` (29 SVGs). | Lógica de mesas de poker ou manipulação direta do DOM. |
| `game.js` | Inicialização do Firebase, gestão de ecrãs, subscrições RTDB (`subscribePermanentRoomsLobby`, `subscribeToRoom`), presença (`attachPresence`, `onDisconnect`), migração de `hostId`, loop de timers (`tickTimers`), liquidação de saldo, renderização da mesa, bots e PWA/Fullscreen. | Cálculo manual de regras de poker ou avaliação de mãos (delegar sempre a `poker.js`). |
| `audio.js` | Síntese de efeitos sonoros (`SoundEngine.playEvent`, `tick`, `myTurn`, `chip`, etc.). | Estado de jogo ou persistência. |
| `style.css` | Layout da mesa 3D, fundos HD por mesa, cartas HD, posicionamento dos 5/6 lugares, HUD flutuante, estilos de avatar na mesa e as 29 animações de vitória. | Estilos específicos do Hub, Perfil ou Modais de menu. |
| `menus.css` | Estilos independentes de `#auth-screen`, `#hub-screen`, `#profile-screen`, `#online-modal` (3 mesas) e `#avatar-modal`. | Regras da mesa 3D ou HUD de jogo. |

---

## 3. Modelo de Dados (Firebase Realtime Database)

Região: `europe-west1` (`https://hiperbluff-default-rtdb.europe-west1.firebasedatabase.app`).

### 3.1 Nó `/users/{usernameKey}`
Chave normalizada por `normalizeUsernameKey()` (minúsculas, sem acentos, apenas `[a-z0-9_-]`).

```json
{
  "username": "João",
  "avatar": "kp",
  "pinHash": "<sha256_hex>",
  "balance": 100000,
  "handsPlayed": 12,
  "handsWon": 5,
  "foldsCount": 4,
  "allInsCount": 2,
  "raisesCount": 9,
  "callsCount": 14,
  "checksCount": 11,
  "biggestWin": 12400,
  "currentStreak": 2,
  "bestStreak": 3,
  "createdAt": 1730000000000
}
```

### 3.2 Nó `/rooms/{roomId}` (Mesas Vitalícias)
Os três nós permanentes são **`MESA_1`**, **`MESA_2`** e **`MESA_3`**.

```json
{
  "roomId": "MESA_1",
  "roomName": "Mesa Gelo",
  "permanent": true,
  "buyIn": 5000,
  "smallBlind": 50,
  "bigBlind": 100,
  "hostId": "p_ab12cd34",
  "tableLedIndex": 0,
  "handId": 4,
  "phase": "FLOP",
  "pot": 1200,
  "deadPot": 0,
  "currentBet": 200,
  "minRaise": 200,
  "dealerIndex": 0,
  "turnIndex": 1,
  "turnDeadline": 1730000020000,
  "nextHandDeadline": 0,
  "isRunout": false,
  "runoutDeadline": 0,
  "lastEvent": { "type": "chip", "ts": 1730000001234.5 },
  "winnerIds": [],
  "winningHandName": "",
  "winningCards": [],
  "deck": [ { "rank": 14, "label": "A", "suit": "♠" } ],
  "community": [ { "rank": 13, "label": "K", "suit": "♥" } ],
  "message": "FLOP na mesa — Vez de Marta.",
  "players": [
    {
      "id": "p_ab12cd34",
      "name": "João",
      "avatar": "kp",
      "chips": 4600,
      "handStartChips": 5000,
      "bet": 200,
      "totalBet": 400,
      "hand": [ { "rank": 14, "label": "A", "suit": "♠" }, { "rank": 14, "label": "A", "suit": "♦" } ],
      "folded": false,
      "allIn": false,
      "acted": true,
      "participated": true,
      "isBot": false,
      "status": "RAISE 200€"
    }
  ],
  "presence": {
    "p_ab12cd34": { "online": true, "at": 1730000000000 }
  }
}
```

> **Invariante crítica — `update()` vs `set()`:** `syncState()` em `game.js` utiliza **`update()`** (e não `set()`) sobre `rooms/{code}` para nunca apagar o sub-nó `presence/` durante as jogadas. Todas as `runTransaction()` sobre a sala preservam explicitamente `raw.presence`.

---

## 4. Fluxos Críticos e Máquina de Estados

### 4.1 Ciclo de Vida de uma Mão
```text
WAITING ──(≥2 jogadores + 10s ou "Começar Já")──▶ PREFLOP
PREFLOP ──(ronda fechada)──▶ FLOP ──▶ TURN ──▶ RIVER ──▶ SHOWDOWN
                                                            │
      ◀──────(≥2 com fichas + 6s auto / "Saltar Espera")────┘
```
* **Atalho por Fold:** se todos menos 1 jogador fizerem Fold (ou saírem da mesa), o estado salta diretamente para `SHOWDOWN` atribuindo `s.pot` ao sobrevivente.
* **Modo Run-out (`isRunout = true`):** quando `< 2` jogadores ativos podem apostar antes do River, `turnIndex` passa a `-1` e o anfitrião avança automaticamente uma rua a cada `RUNOUT_STEP_MS` (`1300 ms`). As cartas dos contendores ficam visíveis durante o run-out.
* **Liquidação de saldo:** `settleHandBalanceIfNeeded()` calcula `delta = me.chips - me.handStartChips` uma única vez por `(roomCode, handId)`, guardado em `sessionStorage` (`SETTLED_HAND_KEY`) para impedir dupla contabilização após F5 no Showdown.

### 4.2 Modelo de Anfitrião, Presença e Mesas Vitalícias
Como não há servidor dedicado, o jogador indicado em `roomState.hostId` atua como **coordenador de temporizadores**:
* Dispara `AUTO-CHECK` / `AUTO-FOLD` quando `turnDeadline` expira (`20 s`).
* Arranca novas mãos quando `nextHandDeadline` expira (`10 s` em `WAITING`, `6 s` em `SHOWDOWN`).
* Avança as ruas no modo `isRunout` (`1,3 s`).
* Remove jogadores cuja presença esteja `online: false` há mais de **`15 s`** (`DISCONNECT_REMOVE_GRACE_MS`).

**Failover de Anfitrião:**
* Ao sair clicando em **Sair**, `removePlayerFromRoomTx()` remove o jogador e escolhe imediatamente o próximo jogador online para `hostId`.
* Se o anfitrião cair sem aviso (`onDisconnect()` escreve `{ online: false, at: serverTimestamp() }`), após **`6 s`** (`HOST_MIGRATE_GRACE_MS`), o próximo jogador online reivindica `hostId` atomicamente via `claimHostViaTransaction()`.

**Garantia Vitalícia:**
* `ensurePermanentRooms()` garante a existência e os metadados (`permanent: true`, `buyIn`, `smallBlind`, `bigBlind`, `tableLedIndex`) de `MESA_1`, `MESA_2` e `MESA_3`.
* Quando `next.players.length === 0` numa sala permanente, `removePlayerFromRoomTx()` **nunca devolve `null`**: repõe a sala limpa em `WAITING` com `players: []` e `hostId: ""`.
* Ao tentar entrar numa sala onde todos os ocupantes estão offline há mais de `15 s` (`isRoomAbandoned`), a transação de entrada limpa os lugares fantasma antes de sentar o novo jogador.

---

## 5. Regras Visuais, 3D, Avatares e Mobile

### 5.1 Hierarquia de Camadas (Stacking Context) na Mesa 3D
A mesa usa `perspective` + `transform: rotateX(28deg)` em `.table-3d-body`. Para evitar que a borda inclinada ou sombras sobreponham os jogadores e cartas (especialmente em Safari/iOS):
* `.poker-table` e `.table-3d-stage` mantêm **`isolation: isolate`** (`z-index: 1` na mesa).
* `.table-center` (`z-index: 5`), `.dealer-seat` (`z-index: 8`), `.seats-container` (`z-index: 10`) e `.seat.is-winner` (`z-index: 15 !important`).
* Cartas (`.card`, `.card.back`, `.card.card-dim`) devem manter sempre **`opacity: 1`** e fundo sólido `#ffffff`; o escurecimento de cartas fora da mão vencedora usa apenas `filter: brightness(...) saturate(...)`.

### 5.2 Regra da Dealer
* A Dealer no topo da mesa (`index.html` → `.dealer-svg`) é uma **ilustração SVG vetorial HD inline**. Não substituir por imagens externas nem remover os `<defs>` internos.

### 5.3 Sistema de Avatares e Animações de Vitória
* Todos os 29 avatares vivem em `AVATAR_CATALOG` (`user.js`) como SVG inline sem IDs duplicados de `<defs>` (para evitar conflitos entre Hub, Perfil, Modal e Mesa).
* `getAvatarMarkup(avatarId, fallbackName)` envolve o SVG em `<div class="avatar-svg-wrap" data-avatar="{id}">`.
* As animações em `style.css` usam **exclusivamente** o seletor `.seat.is-winner [data-avatar="..."]` com `transform-box: view-box` — garantindo **0% de consumo gráfico** fora do Showdown.
* Em `.seat.is-winner .seat-ring`, o avatar amplia com mola (`scale(1.24)`), usando `transform-origin: 50% 72%` no lugar do herói com cartas para não tapar as cartas vencedoras.

### 5.4 Breakpoints e PWA Landscape
* `@media (orientation: portrait) and (max-width: 900px)` ativa `#portrait-lock`.
* `@media (max-height: 540px)` e `@media (max-height: 365px)` ajustam a escala para telemóveis horizontais.
* Em modo Fullscreen (`body.is-fullscreen`), a `.top-bar` colapsa deixando apenas o botão `#btn-leave` no canto superior direito.

---

## 6. Dívida Técnica Conhecida e Guia de Evolução

Pontos identificados em auditoria de código para futuras iterações (por ordem de prioridade):

1. **Segurança & Dados**
   * **Escape de XSS:** escapar `p.name` antes de interpolar em `innerHTML` em `game.js` (e restringir caracteres no `validateCredentials` de `user.js`).
   * **Separação de `pinHash` antes do Leaderboard:** criar um nó público `/leaderboard/{usernameKey}` (apenas `username`, `avatar`, `balance`, `handsWon`) para que a leitura do Top 10 nunca transfira os hashes SHA-256 dos PINs de 4 dígitos.
   * **Visibilidade do baralho:** atualmente `deck` e `players[].hand` residem em `/rooms/{id}` (modelo *peer/host* sem backend). Para ambiente competitivo aberto ao público, o baralho terá de migrar para Cloud Functions / servidor autoritativo.

2. **Economia & Integridade Multiplayer**
   * **Prevenir fuga de perdas ao fechar a app:** debitar o *buy-in* da carteira ao sentar (ou reservar o valor em jogo) e devolver a *stack* restante ao sair/desligar, em vez de liquidar apenas o `delta` no cliente.
   * **Impedir conta duplicada:** validar `userKey` dentro de `players` na transação de entrada para impedir a mesma conta em dois lugares simultâneos.
   * **Sincronização de relógio:** ler `.info/serverTimeOffset` do Firebase RTDB e aplicar o *offset* nos cálculos de `turnDeadline` / `nextHandDeadline`.
   * **Ações transacionais:** mover `handleAction()` online de `update()` para `runTransaction()` validando `handId` e `turnIndex`, evitando colisão entre jogada no último segundo e `AUTO-FOLD`.
   * **Rebuy coerente:** respeitar `minEntry` / `buyIn` da mesa no `performRebuy()`.

3. **Regras de Poker & Bots**
   * **`refundUncalledBet()` com 1 apostador:** quando todos os adversários estão All-In de ruas anteriores e só 1 jogador aposta na rua atual, devolver imediatamente o excesso não igualado.
   * **All-In curto:** só repor `acted = false` nos restantes jogadores se o aumento de um All-In for `>= s.minRaise`.
   * **Timeout dos bots:** guardar e limpar o `setTimeout` de `maybeTriggerBotTurn()` ao sair da mesa.
   * **IA dos bots e separação de economia:** avaliar força pré-flop/pós-flop + *pot odds* e decidir se partidas offline vs Bots continuam a afetar o saldo real do ranking.

4. **PWA & UX**
   * **Estratégia `sw.js`:** usar *Network-First* para `.html`, `.css` e `.js` (evitando dessincronização entre CSS e ES Modules) e *Cache-First* apenas para `.png` e ícones.
   * **Fichas para High Stakes:** adicionar denominações visuais de `1 000 €`, `5 000 €`, `10 000 €` e `25 000 €` em `renderPotChipsHTML()`.
   * **Proteção contra falência + Controlo de Som:** Bónus Diário aleatório / resgate de saldo no Hub e botão de Som On/Off persistido em `localStorage`.
