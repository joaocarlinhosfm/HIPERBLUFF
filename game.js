import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getDatabase, ref, set, get, onValue, update } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

/* ============================================================================
   1. CONFIGURAÇÃO FIREBASE (Preenche para ativar o Multiplayer Online)
   ============================================================================ */
const firebaseConfig = {
  apiKey: "SUA_API_KEY",
  authDomain: "SEU_PROJETO.firebaseapp.com",
  databaseURL: "https://SEU_PROJETO-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "SEU_PROJETO"
};

let db = null;
const isFirebaseConfigured = firebaseConfig.apiKey !== "SUA_API_KEY";
if (isFirebaseConfigured) {
  const app = initializeApp(firebaseConfig);
  db = getDatabase(app);
}

/* ============================================================================
   2. CONSTANTES E SHUFFLE CRIPTOGRAFICAMENTE SEGURO (CSPRNG + FISHER-YATES)
   ============================================================================ */
const SUITS = ["♠", "♥", "♦", "♣"];
const RANKS = [
  { v: 2, l: "2" }, { v: 3, l: "3" }, { v: 4, l: "4" }, { v: 5, l: "5" },
  { v: 6, l: "6" }, { v: 7, l: "7" }, { v: 8, l: "8" }, { v: 9, l: "9" },
  { v: 10, l: "10" }, { v: 11, l: "J" }, { v: 12, l: "Q" }, { v: 13, l: "K" }, { v: 14, l: "A" }
];
const HAND_NAMES = [
  "Carta Alta", "Um Par", "Dois Pares", "Trio", "Sequência",
  "Flush", "Full House", "Poker", "Straight Flush", "Royal Flush"
];
const MAX_PLAYERS = 6;
const STARTING_CHIPS = 1000;
const SMALL_BLIND = 10;
const BIG_BLIND = 20;

function createDeck() {
  const deck = [];
  for (const s of SUITS) {
    for (const r of RANKS) {
      deck.push({ rank: r.v, label: r.l, suit: s });
    }
  }
  return deck;
}

// Rejection sampling sobre Uint32 para eliminar modulo bias
function secureRandomInt(max) {
  const buf = new Uint32Array(1);
  const limit = Math.floor(0x100000000 / max) * max;
  let rand;
  do {
    window.crypto.getRandomValues(buf);
    rand = buf[0];
  } while (rand >= limit);
  return rand % max;
}

function shuffleDeck(deck) {
  const arr = [...deck];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = secureRandomInt(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/* ============================================================================
   3. AVALIADOR OFICIAL DE MÃOS (MELHORES 5 DE 7 CARTAS + KICKERS)
   ============================================================================ */
function scoreFiveCards(cards) {
  const values = cards.map(c => c.rank).sort((a, b) => b - a);
  const isFlush = cards.every(c => c.suit === cards[0].suit);

  // Verificar sequência (inclui A-2-3-4-5)
  const unique = [...new Set(values)];
  let straightHigh = 0;
  if (unique.length === 5) {
    if (unique[0] - unique[4] === 4) {
      straightHigh = unique[0];
    } else if (unique[0] === 14 && unique[1] === 5 && unique[4] === 2) {
      straightHigh = 5;
    }
  }

  // Contar frequências
  const counts = {};
  for (const v of values) counts[v] = (counts[v] || 0) + 1;
  const groups = Object.entries(counts)
    .map(([v, c]) => ({ v: Number(v), c }))
    .sort((a, b) => b.c - a.c || b.v - a.v);

  let cat = 0;
  let tiebreakers = values;

  if (isFlush && straightHigh) {
    cat = straightHigh === 14 ? 9 : 8;
    tiebreakers = [straightHigh];
  } else if (groups[0].c === 4) {
    cat = 7;
    tiebreakers = [groups[0].v, groups[1].v];
  } else if (groups[0].c === 3 && groups[1].c === 2) {
    cat = 6;
    tiebreakers = [groups[0].v, groups[1].v];
  } else if (isFlush) {
    cat = 5;
    tiebreakers = values;
  } else if (straightHigh) {
    cat = 4;
    tiebreakers = [straightHigh];
  } else if (groups[0].c === 3) {
    cat = 3;
    tiebreakers = [groups[0].v, groups[1].v, groups[2].v];
  } else if (groups[0].c === 2 && groups[1].c === 2) {
    cat = 2;
    tiebreakers = [groups[0].v, groups[1].v, groups[2].v];
  } else if (groups[0].c === 2) {
    cat = 1;
    tiebreakers = [groups[0].v, groups[1].v, groups[2].v, groups[3].v];
  }

  // Score numérico único em base 15 para comparação exata
  let score = cat * Math.pow(15, 5);
  for (let i = 0; i < tiebreakers.length; i++) {
    score += tiebreakers[i] * Math.pow(15, 4 - i);
  }
  return { score, name: HAND_NAMES[cat] };
}

function evaluateBestHand(cards) {
  if (cards.length < 5) return { score: 0, name: "—" };
  let best = { score: -1, name: "Carta Alta" };
  const n = cards.length;
  for (let a = 0; a < n - 4; a++)
    for (let b = a + 1; b < n - 3; b++)
      for (let c = b + 1; c < n - 2; c++)
        for (let d = c + 1; d < n - 1; d++)
          for (let e = d + 1; e < n; e++) {
            const res = scoreFiveCards([cards[a], cards[b], cards[c], cards[d], cards[e]]);
            if (res.score > best.score) best = res;
          }
  return best;
}

/* ============================================================================
   4. ESTADO LOCAL E CONTROLADOR DE MESA
   ============================================================================ */
let localMode = true;
let myId = "p_" + Math.random().toString(36).slice(2, 8);
let myName = "Jogador";
let currentRoomCode = null;
let roomState = null;
let unsubscribeRoom = null;

const $ = (id) => document.getElementById(id);

function generateRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 5; i++) code += chars[secureRandomInt(chars.length)];
  return code;
}

function createInitialRoom(hostId, hostName) {
  return {
    hostId,
    phase: "WAITING", // WAITING, PREFLOP, FLOP, TURN, RIVER, SHOWDOWN
    pot: 0,
    currentBet: 0,
    minRaise: BIG_BLIND,
    dealerIndex: 0,
    turnIndex: -1,
    deck: [],
    community: [],
    message: "À espera de jogadores (mín. 2, máx. 6)...",
    players: [
      { id: hostId, name: hostName, chips: STARTING_CHIPS, bet: 0, hand: [], folded: false, allIn: false, acted: false, isBot: false }
    ]
  };
}

async function syncState(newState) {
  roomState = newState;
  if (localMode) {
    renderGame();
    maybeTriggerBotTurn();
  } else if (db && currentRoomCode) {
    await set(ref(db, `rooms/${currentRoomCode}`), newState);
  }
}

/* ============================================================================
   5. LÓGICA DO TEXAS HOLD'EM (BLINDS, RONDAS, AÇÕES, SHOWDOWN)
   ============================================================================ */
function startNewHand() {
  const s = structuredClone(roomState);
  const eligible = s.players.filter(p => p.chips > 0);
  if (eligible.length < 2) {
    s.message = "São precisos pelo menos 2 jogadores com fichas.";
    syncState(s);
    return;
  }

  s.deck = shuffleDeck(createDeck());
  s.community = [];
  s.pot = 0;
  s.phase = "PREFLOP";
  s.dealerIndex = (s.dealerIndex + 1) % s.players.length;

  s.players.forEach(p => {
    p.bet = 0;
    p.folded = p.chips <= 0;
    p.allIn = false;
    p.acted = false;
    p.status = "";
    p.hand = p.folded ? [] : [s.deck.pop(), s.deck.pop()];
  });

  const activeIndices = s.players.map((p, i) => (!p.folded ? i : -1)).filter(i => i !== -1);
  const sbPos = activeIndices.length === 2
    ? activeIndices[s.dealerIndex % activeIndices.length]
    : nextActiveIndex(s, s.dealerIndex);
  const bbPos = nextActiveIndex(s, sbPos);

  postBlind(s, sbPos, SMALL_BLIND, "SB");
  postBlind(s, bbPos, BIG_BLIND, "BB");

  s.currentBet = BIG_BLIND;
  s.minRaise = BIG_BLIND;
  s.turnIndex = nextActiveIndex(s, bbPos);
  s.message = `Nova mão! Vez de ${s.players[s.turnIndex].name}.`;
  syncState(s);
}

function postBlind(s, idx, amount, label) {
  const p = s.players[idx];
  const paid = Math.min(p.chips, amount);
  p.chips -= paid;
  p.bet += paid;
  s.pot += paid;
  p.status = label;
  if (p.chips === 0) p.allIn = true;
}

function nextActiveIndex(s, fromIdx) {
  const total = s.players.length;
  for (let step = 1; step <= total; step++) {
    const idx = (fromIdx + step) % total;
    const p = s.players[idx];
    if (!p.folded && !p.allIn) return idx;
  }
  return -1;
}

function handleAction(playerId, action, raiseTo = 0) {
  const s = structuredClone(roomState);
  const idx = s.turnIndex;
  if (idx < 0 || s.players[idx].id !== playerId) return;

  const p = s.players[idx];

  if (action === "fold") {
    p.folded = true;
    p.status = "FOLD";
  } else if (action === "check-call") {
    const toCall = Math.min(p.chips, s.currentBet - p.bet);
    p.chips -= toCall;
    p.bet += toCall;
    s.pot += toCall;
    p.status = toCall === 0 ? "CHECK" : `CALL ${toCall}€`;
    if (p.chips === 0) p.allIn = true;
  } else if (action === "raise") {
    const target = Math.max(raiseTo, s.currentBet + s.minRaise);
    const needed = Math.min(p.chips, target - p.bet);
    const newBet = p.bet + needed;
    if (newBet > s.currentBet) {
      s.minRaise = Math.max(BIG_BLIND, newBet - s.currentBet);
      s.currentBet = newBet;
      s.players.forEach(other => { if (other.id !== p.id) other.acted = false; });
    }
    p.chips -= needed;
    p.bet = newBet;
    s.pot += needed;
    p.status = p.chips === 0 ? "ALL-IN" : `RAISE ${newBet}€`;
    if (p.chips === 0) p.allIn = true;
  } else if (action === "allin") {
    const push = p.chips;
    p.bet += push;
    s.pot += push;
    p.chips = 0;
    p.allIn = true;
    p.status = "ALL-IN";
    if (p.bet > s.currentBet) {
      s.minRaise = Math.max(BIG_BLIND, p.bet - s.currentBet);
      s.currentBet = p.bet;
      s.players.forEach(other => { if (other.id !== p.id) other.acted = false; });
    }
  }

  p.acted = true;

  // Verificar se só sobra 1 jogador na mão
  const remaining = s.players.filter(pl => !pl.folded);
  if (remaining.length === 1) {
    remaining[0].chips += s.pot;
    s.message = `${remaining[0].name} venceu ${s.pot}€ (todos desistiram)!`;
    s.phase = "SHOWDOWN";
    s.turnIndex = -1;
    syncState(s);
    return;
  }

  // Verificar se a ronda de apostas terminou
  const canStillAct = s.players.filter(pl => !pl.folded && !pl.allIn);
  const roundDone = canStillAct.every(pl => pl.acted && pl.bet === s.currentBet);

  if (roundDone || canStillAct.length <= 1) {
    advancePhase(s);
  } else {
    s.turnIndex = nextActiveIndex(s, idx);
    s.message = `Vez de ${s.players[s.turnIndex].name}.`;
    syncState(s);
  }
}

function advancePhase(s) {
  s.players.forEach(p => { p.bet = 0; p.acted = false; if (!p.folded && !p.allIn) p.status = ""; });
  s.currentBet = 0;
  s.minRaise = BIG_BLIND;

  if (s.phase === "PREFLOP") {
    s.deck.pop(); // Burn card
    s.community.push(s.deck.pop(), s.deck.pop(), s.deck.pop());
    s.phase = "FLOP";
  } else if (s.phase === "FLOP") {
    s.deck.pop();
    s.community.push(s.deck.pop());
    s.phase = "TURN";
  } else if (s.phase === "TURN") {
    s.deck.pop();
    s.community.push(s.deck.pop());
    s.phase = "RIVER";
  } else {
    resolveShowdown(s);
    return;
  }

  const canAct = s.players.filter(p => !p.folded && !p.allIn);
  if (canAct.length < 2) {
    // Run-out automático até ao Showdown quando há All-In
    advancePhase(s);
    return;
  }

  s.turnIndex = nextActiveIndex(s, s.dealerIndex);
  s.message = `${s.phase} — Vez de ${s.players[s.turnIndex].name}.`;
  syncState(s);
}

function resolveShowdown(s) {
  s.phase = "SHOWDOWN";
  s.turnIndex = -1;

  const contenders = s.players.filter(p => !p.folded);
  let bestScore = -1;
  let winners = [];

  for (const p of contenders) {
    const evalRes = evaluateBestHand([...p.hand, ...s.community]);
    p.status = evalRes.name;
    if (evalRes.score > bestScore) {
      bestScore = evalRes.score;
      winners = [p];
    } else if (evalRes.score === bestScore) {
      winners.push(p);
    }
  }

  const share = Math.floor(s.pot / winners.length);
  winners.forEach(w => { w.chips += share; });
  const names = winners.map(w => w.name).join(" & ");
  s.message = `🏆 ${names} venceu ${s.pot}€ com ${winners[0].status}!`;
  syncState(s);
}

/* ============================================================================
   6. BOTS SIMPLES PARA MODO TESTE OFFLINE
   ============================================================================ */
function maybeTriggerBotTurn() {
  if (!localMode || !roomState || roomState.turnIndex < 0) return;
  const current = roomState.players[roomState.turnIndex];
  if (!current || !current.isBot) return;

  setTimeout(() => {
    if (!roomState || roomState.turnIndex < 0) return;
    const p = roomState.players[roomState.turnIndex];
    if (!p || !p.isBot) return;

    const toCall = roomState.currentBet - p.bet;
    const roll = secureRandomInt(100);
    if (toCall === 0) {
      if (roll < 75) handleAction(p.id, "check-call");
      else handleAction(p.id, "raise", roomState.currentBet + BIG_BLIND * 2);
    } else {
      if (roll < 25 && toCall > BIG_BLIND * 2) handleAction(p.id, "fold");
      else if (roll < 85) handleAction(p.id, "check-call");
      else handleAction(p.id, "raise", roomState.currentBet + BIG_BLIND * 2);
    }
  }, 850);
}

/* ============================================================================
   7. RENDERIZAÇÃO DA INTERFACE
   ============================================================================ */
function renderCardHTML(card, hidden = false, small = false) {
  const sizeClass = small ? "small" : "";
  if (hidden || !card) return `<div class="card back ${sizeClass}"></div>`;
  const isRed = card.suit === "♥" || card.suit === "♦" ? "red" : "";
  return `
    <div class="card ${isRed} ${sizeClass}">
      <div class="card-top">${card.label}${card.suit}</div>
      <div class="card-center">${card.suit}</div>
      <div class="card-bottom">${card.label}${card.suit}</div>
    </div>
  `;
}

function renderGame() {
  if (!roomState) return;

  $("display-room-code").textContent = currentRoomCode || "DEMO";
  $("display-phase").textContent = roomState.phase;
  $("pot-amount").textContent = roomState.pot;
  $("table-message").textContent = roomState.message;

  // Botão Iniciar Mão (visível apenas para o Host quando está em WAITING ou SHOWDOWN)
  const isHost = roomState.hostId === myId;
  const canStart = isHost && (roomState.phase === "WAITING" || roomState.phase === "SHOWDOWN");
  $("btn-start-game").classList.toggle("hidden", !canStart);

  // Cartas comunitárias
  $("community-cards").innerHTML = roomState.community.map(c => renderCardHTML(c)).join("");

  // Rodar perspetiva da mesa para o jogador ficar sempre no lugar 0 (baixo)
  const myIndex = roomState.players.findIndex(p => p.id === myId);
  const offset = myIndex >= 0 ? myIndex : 0;

  for (let seatVisual = 0; seatVisual < MAX_PLAYERS; seatVisual++) {
    const el = document.querySelector(`.seat-${seatVisual}`);
    const pIdx = (seatVisual + offset) % MAX_PLAYERS;
    const p = roomState.players[pIdx];

    if (!p) {
      el.className = `seat seat-${seatVisual} empty`;
      el.innerHTML = `<div class="seat-box">Lugar Livre</div>`;
      continue;
    }

    const isMe = p.id === myId;
    const isTurn = roomState.turnIndex === pIdx;
    const showCards = isMe || (roomState.phase === "SHOWDOWN" && !p.folded);

    el.className = `seat seat-${seatVisual} ${isTurn ? "active-turn" : ""} ${p.folded ? "folded" : ""}`;
    const cardsHTML = p.hand && p.hand.length
      ? p.hand.map(c => renderCardHTML(c, !showCards, true)).join("")
      : "";

    el.innerHTML = `
      <div class="seat-cards">${cardsHTML}</div>
      <div class="seat-box">
        ${roomState.dealerIndex === pIdx ? `<div class="dealer-chip">D</div>` : ""}
        <div class="seat-name">${p.name}${isMe ? " (Tu)" : ""}</div>
        <div class="seat-chips">${p.chips} €</div>
        <div class="seat-status">${p.status || ""}</div>
      </div>
      ${p.bet > 0 ? `<div class="bet-pill">${p.bet} €</div>` : ""}
    `;
  }

  // Atualizar força da minha mão e controlos
  const me = roomState.players[myIndex];
  if (me && me.hand && me.hand.length === 2) {
    const allCards = [...me.hand, ...roomState.community];
    const evalText = allCards.length >= 5 ? evaluateBestHand(allCards).name : "Pré-Flop";
    $("hand-strength-badge").textContent = `A tua mão: ${evalText}`;
  } else {
    $("hand-strength-badge").textContent = "A tua mão: —";
  }

  const isMyTurn = me && roomState.turnIndex === myIndex && !me.folded && !me.allIn;
  $("action-bar").classList.toggle("disabled", !isMyTurn);

  if (isMyTurn) {
    const toCall = Math.max(0, roomState.currentBet - me.bet);
    $("btn-check-call").textContent = toCall === 0 ? "Check" : `Call ${Math.min(toCall, me.chips)}€`;

    const minRaiseTo = Math.min(me.bet + me.chips, roomState.currentBet + roomState.minRaise);
    const maxRaiseTo = me.bet + me.chips;
    const slider = $("raise-slider");
    slider.min = minRaiseTo;
    slider.max = maxRaiseTo;
    slider.value = minRaiseTo;
    $("raise-value").textContent = minRaiseTo;
  }
}

/* ============================================================================
   8. EVENTOS DE LOBBY E CONTROLOS
   ============================================================================ */
function openGameScreen() {
  $("lobby-screen").classList.remove("active");
  $("game-screen").classList.add("active");
}

function showError(msg) {
  $("lobby-error").textContent = msg;
}

$("btn-create-room").addEventListener("click", async () => {
  if (!isFirebaseConfigured) {
    showError("Configura primeiro as tuas chaves do Firebase no topo de game.js (ou usa o modo teste).");
    return;
  }
  myName = $("player-name").value.trim() || "Jogador";
  localMode = false;
  currentRoomCode = generateRoomCode();
  const initial = createInitialRoom(myId, myName);

  await set(ref(db, `rooms/${currentRoomCode}`), initial);
  subscribeToRoom(currentRoomCode);
  openGameScreen();
});

$("btn-join-room").addEventListener("click", async () => {
  if (!isFirebaseConfigured) {
    showError("Configura primeiro o Firebase no topo de game.js.");
    return;
  }
  const code = $("room-code").value.trim().toUpperCase();
  myName = $("player-name").value.trim() || "Jogador";
  if (!code) return showError("Introduz o código da sala.");

  const snap = await get(ref(db, `rooms/${code}`));
  if (!snap.exists()) return showError("Sala não encontrada.");

  const data = snap.val();
  if (data.players.length >= MAX_PLAYERS) return showError("A mesa já está cheia (6/6).");

  localMode = false;
  currentRoomCode = code;
  data.players.push({
    id: myId, name: myName, chips: STARTING_CHIPS, bet: 0,
    hand: [], folded: data.phase !== "WAITING", allIn: false, acted: false, isBot: false
  });
  await update(ref(db, `rooms/${code}`), { players: data.players });
  subscribeToRoom(code);
  openGameScreen();
});

function subscribeToRoom(code) {
  if (unsubscribeRoom) unsubscribeRoom();
  unsubscribeRoom = onValue(ref(db, `rooms/${code}`), (snap) => {
    if (snap.exists()) {
      roomState = snap.val();
      renderGame();
    }
  });
}

$("btn-demo-mode").addEventListener("click", () => {
  myName = $("player-name").value.trim() || "Tu";
  localMode = true;
  currentRoomCode = "OFFLINE";
  const demo = createInitialRoom(myId, myName);
  const botNames = ["Tiago", "Marta", "Rui", "Inês", "Carlos"];
  botNames.forEach((name, i) => {
    demo.players.push({
      id: `bot_${i}`, name, chips: STARTING_CHIPS, bet: 0,
      hand: [], folded: false, allIn: false, acted: false, isBot: true
    });
  });
  roomState = demo;
  openGameScreen();
  startNewHand();
});

$("btn-start-game").addEventListener("click", startNewHand);
$("btn-fold").addEventListener("click", () => handleAction(myId, "fold"));
$("btn-check-call").addEventListener("click", () => handleAction(myId, "check-call"));
$("btn-raise").addEventListener("click", () => handleAction(myId, "raise", Number($("raise-slider").value)));
$("btn-allin").addEventListener("click", () => handleAction(myId, "allin"));
$("raise-slider").addEventListener("input", (e) => { $("raise-value").textContent = e.target.value; });

$("btn-copy-code").addEventListener("click", () => {
  navigator.clipboard.writeText(currentRoomCode || "");
});

$("btn-leave").addEventListener("click", () => {
  if (unsubscribeRoom) unsubscribeRoom();
  roomState = null;
  $("game-screen").classList.remove("active");
  $("lobby-screen").classList.add("active");
});
