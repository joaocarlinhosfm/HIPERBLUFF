import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getDatabase, ref, set, get, onValue, update } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

/* ============================================================================
   1. CONFIGURAÇÃO FIREBASE (Preenche para ativar o Multiplayer Online)
   ============================================================================ */
const firebaseConfig = {
  apiKey: "AIzaSyADFQ4N7oNo2QDJXeos685Oi5O4tCyyVCk",
  authDomain: "hiperbluff.firebaseapp.com",
  databaseURL: "https://hiperbluff-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "hiperbluff"
};

let db = null;
const isFirebaseConfigured = firebaseConfig.apiKey !== "AIzaSyADFQ4N7oNo2QDJXeos685Oi5O4tCyyVCk";
if (isFirebaseConfigured) {
  const app = initializeApp(firebaseConfig);
  db = getDatabase(app);
}
/* ============================================================================
   2. MOTOR DE ÁUDIO SINTÉTICO (WEB AUDIO API — ZERO MP3 EXTERNOS)
   ============================================================================ */
const SoundEngine = {
  ctx: null,
  muted: false,

  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) this.ctx = new AudioCtx();
    }
    if (this.ctx && this.ctx.state === "suspended") {
      this.ctx.resume();
    }
  },

  toggleMute() {
    this.muted = !this.muted;
    return this.muted;
  },

  playNoise(duration, filterType, freqStart, freqEnd, gainPeak, delay = 0) {
    if (this.muted || !this.ctx) return;
    const now = this.ctx.currentTime + delay;
    const bufferSize = Math.floor(this.ctx.sampleRate * duration);
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

    const src = this.ctx.createBufferSource();
    src.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.setValueAtTime(freqStart, now);
    if (freqEnd !== freqStart) {
      filter.frequency.exponentialRampToValueAtTime(Math.max(40, freqEnd), now + duration);
    }

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(gainPeak, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);
    src.start(now);
    src.stop(now + duration);
  },

  playTone(freqStart, freqEnd, duration, type, gainPeak, delay = 0) {
    if (this.muted || !this.ctx) return;
    const now = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freqStart, now);
    if (freqEnd !== freqStart) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(30, freqEnd), now + duration);
    }

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(gainPeak, now + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + duration);
  },

  shuffle() {
    this.init();
    for (let i = 0; i < 7; i++) {
      this.playNoise(0.045, "bandpass", 1800 + i * 120, 900, 0.14, i * 0.038);
    }
  },

  card() {
    this.init();
    this.playNoise(0.055, "highpass", 1500, 700, 0.16, 0);
    this.playTone(220, 90, 0.04, "sine", 0.08, 0);
  },

  chip(delay = 0) {
    this.init();
    this.playTone(2550, 2400, 0.055, "sine", 0.11, delay);
    this.playTone(3900, 3600, 0.04, "triangle", 0.07, delay);
    this.playTone(2800, 2600, 0.05, "sine", 0.08, delay + 0.045);
  },

  allIn() {
    this.init();
    for (let i = 0; i < 5; i++) {
      this.chip(i * 0.065);
    }
  },

  check() {
    this.init();
    this.playTone(170, 65, 0.06, "sine", 0.22, 0);
    this.playTone(160, 60, 0.06, "sine", 0.18, 0.11);
  },

  fold() {
    this.init();
    this.playNoise(0.14, "lowpass", 950, 240, 0.15, 0);
  },

  tick(urgent = false) {
    this.init();
    this.playTone(urgent ? 1046 : 784, urgent ? 1046 : 784, 0.055, "sine", 0.09, 0);
  },

  myTurn() {
    this.init();
    this.playTone(587.33, 587.33, 0.09, "triangle", 0.08, 0);
    this.playTone(880, 880, 0.14, "triangle", 0.09, 0.09);
  },

  win() {
    this.init();
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((n, i) => {
      this.playTone(n, n, 0.24, "triangle", 0.11, i * 0.09);
    });
  },

  playEvent(type) {
    if (type === "shuffle") this.shuffle();
    else if (type === "card") this.card();
    else if (type === "chip") this.chip();
    else if (type === "allin") this.allIn();
    else if (type === "check") this.check();
    else if (type === "fold") this.fold();
    else if (type === "win") this.win();
  }
};

document.addEventListener("pointerdown", () => SoundEngine.init(), { once: true });

/* ============================================================================
   3. CONSTANTES, TIMERS E SHUFFLE CSPRNG + FISHER-YATES
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

const TURN_DURATION_MS = 20000;
const NEXT_HAND_DELAY_MS = 6000;
const AUTO_START_DELAY_MS = 10000;

function cardKey(card) {
  return card ? `${card.rank}_${card.suit}` : "";
}

function createDeck() {
  const deck = [];
  for (const s of SUITS) {
    for (const r of RANKS) {
      deck.push({ rank: r.v, label: r.l, suit: s });
    }
  }
  return deck;
}

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
   4. AVALIADOR OFICIAL DE MÃOS (DEVOLVE AS 5 CARTAS VENCEDORAS + KICKERS)
   ============================================================================ */
function scoreFiveCards(cards) {
  const values = cards.map(c => c.rank).sort((a, b) => b - a);
  const isFlush = cards.every(c => c.suit === cards[0].suit);

  const unique = [...new Set(values)];
  let straightHigh = 0;
  if (unique.length === 5) {
    if (unique[0] - unique[4] === 4) {
      straightHigh = unique[0];
    } else if (unique[0] === 14 && unique[1] === 5 && unique[4] === 2) {
      straightHigh = 5;
    }
  }

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

  let score = cat * Math.pow(15, 5);
  for (let i = 0; i < tiebreakers.length; i++) {
    score += tiebreakers[i] * Math.pow(15, 4 - i);
  }
  return { score, name: HAND_NAMES[cat], cards };
}

function evaluateBestHand(cards) {
  if (!cards || cards.length < 5) return { score: 0, name: "—", bestCards: [] };
  let best = { score: -1, name: "Carta Alta", bestCards: [] };
  const n = cards.length;
  for (let a = 0; a < n - 4; a++)
    for (let b = a + 1; b < n - 3; b++)
      for (let c = b + 1; c < n - 2; c++)
        for (let d = c + 1; d < n - 1; d++)
          for (let e = d + 1; e < n; e++) {
            const combo = [cards[a], cards[b], cards[c], cards[d], cards[e]];
            const res = scoreFiveCards(combo);
            if (res.score > best.score) {
              best = { score: res.score, name: res.name, bestCards: combo };
            }
          }
  return best;
}

/* ============================================================================
   5. NORMALIZAÇÃO DO ESTADO (CORRIGE ARRAYS VAZIOS APAGADOS PELO FIREBASE)
   ============================================================================ */
function normalizeRoomState(raw) {
  if (!raw) return null;
  const playersArr = Array.isArray(raw.players)
    ? raw.players
    : Object.values(raw.players || {});

  return {
    hostId: raw.hostId || "",
    phase: raw.phase || "WAITING",
    pot: Number(raw.pot) || 0,
    currentBet: Number(raw.currentBet) || 0,
    minRaise: Number(raw.minRaise) || BIG_BLIND,
    dealerIndex: Number(raw.dealerIndex) || 0,
    turnIndex: raw.turnIndex !== undefined ? Number(raw.turnIndex) : -1,
    turnDeadline: Number(raw.turnDeadline) || 0,
    nextHandDeadline: Number(raw.nextHandDeadline) || 0,
    lastEvent: raw.lastEvent || null,
    winnerIds: Array.isArray(raw.winnerIds) ? raw.winnerIds : Object.values(raw.winnerIds || {}),
    winningHandName: raw.winningHandName || "",
    winningCards: Array.isArray(raw.winningCards) ? raw.winningCards : Object.values(raw.winningCards || {}),
    deck: Array.isArray(raw.deck) ? raw.deck : Object.values(raw.deck || {}),
    community: Array.isArray(raw.community) ? raw.community : Object.values(raw.community || {}),
    message: raw.message || "",
    players: playersArr.filter(Boolean).map(p => ({
      id: p.id,
      name: p.name || "Jogador",
      chips: Number(p.chips) || 0,
      bet: Number(p.bet) || 0,
      hand: Array.isArray(p.hand) ? p.hand : Object.values(p.hand || {}),
      folded: Boolean(p.folded),
      allIn: Boolean(p.allIn),
      acted: Boolean(p.acted),
      isBot: Boolean(p.isBot),
      status: p.status || ""
    }))
  };
}

/* ============================================================================
   6. ESTADO LOCAL, SINCRONIZAÇÃO E MOTOR DE TIMERS
   ============================================================================ */
let localMode = true;
let myId = "p_" + Math.random().toString(36).slice(2, 8);
let myName = "Jogador";
let currentRoomCode = null;
let roomState = null;
let unsubscribeRoom = null;
let isSyncingAction = false;

let timerInterval = null;
let lastHandledTurnDeadline = 0;
let lastHandledNextHandDeadline = 0;
let lastPlayedEventTs = 0;
let lastTickKey = "";
let wasMyTurn = false;
let lastSliderTurnKey = "";

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
    phase: "WAITING",
    pot: 0,
    currentBet: 0,
    minRaise: BIG_BLIND,
    dealerIndex: 0,
    turnIndex: -1,
    turnDeadline: 0,
    nextHandDeadline: 0,
    lastEvent: null,
    winnerIds: [],
    winningHandName: "",
    winningCards: [],
    deck: [],
    community: [],
    message: "A aguardar jogadores... Partilha o código da sala!",
    players: [
      { id: hostId, name: hostName, chips: STARTING_CHIPS, bet: 0, hand: [], folded: false, allIn: false, acted: false, isBot: false, status: "PRONTO" }
    ]
  };
}

function setSoundEvent(state, type) {
  state.lastEvent = { type, ts: Date.now() + Math.random() };
}

async function syncState(newState) {
  const clean = normalizeRoomState(newState);
  roomState = clean;
  if (localMode) {
    renderGame();
    maybeTriggerBotTurn();
  } else if (db && currentRoomCode) {
    isSyncingAction = true;
    try {
      await set(ref(db, `rooms/${currentRoomCode}`), clean);
    } catch (err) {
      console.error("Erro ao sincronizar estado com Firebase:", err);
    } finally {
      isSyncingAction = false;
    }
  }
}

function startTimerLoop() {
  stopTimerLoop();
  timerInterval = setInterval(tickTimers, 100);
}

function stopTimerLoop() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

function tickTimers() {
  if (!roomState) return;
  const now = Date.now();
  const isHost = roomState.hostId === myId;

  // 1. Temporizador de Jogada Ativa (Anel Circular)
  if (roomState.turnIndex >= 0 && roomState.turnDeadline > 0) {
    const remainingMs = Math.max(0, roomState.turnDeadline - now);
    const pct = Math.min(100, (remainingMs / TURN_DURATION_MS) * 100);
    const secs = Math.ceil(remainingMs / 1000);

    const ringEl = $("active-timer-ring");
    const textEl = $("active-timer-text");
    if (ringEl) {
      const color = secs <= 5 ? "#e11d48" : secs <= 10 ? "#f5b942" : "#22c55e";
      ringEl.style.background = `conic-gradient(${color} ${pct}%, rgba(255, 255, 255, 0.12) ${pct}% 100%)`;
    }
    if (textEl) {
      textEl.textContent = `${secs}s`;
      textEl.classList.toggle("urgent", secs <= 5);
    }

    if (secs >= 1 && secs <= 5) {
      const tickKey = `${roomState.turnDeadline}_${secs}`;
      if (lastTickKey !== tickKey) {
        lastTickKey = tickKey;
        SoundEngine.tick(secs <= 2);
      }
    }

    if (remainingMs === 0 && isHost && lastHandledTurnDeadline !== roomState.turnDeadline) {
      lastHandledTurnDeadline = roomState.turnDeadline;
      const activePlayer = roomState.players[roomState.turnIndex];
      if (activePlayer) {
        const canCheck = roomState.currentBet - activePlayer.bet === 0;
        handleAction(activePlayer.id, canCheck ? "check-call" : "fold", 0, true);
      }
    }
  }

  // 2. Temporizador Automático (Início da Sala após 2.º jogador OU Próxima Mão)
  const nextPill = $("next-hand-countdown");
  const isWaitingCountdown =
    roomState.phase === "WAITING" &&
    roomState.nextHandDeadline > 0 &&
    roomState.players &&
    roomState.players.length >= 2;
  const isShowdownCountdown =
    roomState.phase === "SHOWDOWN" &&
    roomState.nextHandDeadline > 0;

  if ((isWaitingCountdown || isShowdownCountdown) && nextPill) {
    const remainingMs = Math.max(0, roomState.nextHandDeadline - now);
    const secs = Math.ceil(remainingMs / 1000);

    nextPill.textContent = isWaitingCountdown ? `Começa em ${secs}s` : `Nova mão em ${secs}s`;
    nextPill.classList.remove("hidden");

    if (isWaitingCountdown) {
      const msgEl = $("table-message");
      if (msgEl) {
        msgEl.textContent = `Jogadores na mesa (${roomState.players.length}/${MAX_PLAYERS}) — O jogo começa em ${secs}s!`;
      }
      if (secs >= 1 && secs <= 3) {
        const tickKey = `start_${roomState.nextHandDeadline}_${secs}`;
        if (lastTickKey !== tickKey) {
          lastTickKey = tickKey;
          SoundEngine.tick(secs === 1);
        }
      }
    }

    if (remainingMs === 0 && isHost && lastHandledNextHandDeadline !== roomState.nextHandDeadline) {
      lastHandledNextHandDeadline = roomState.nextHandDeadline;
      startNewHand();
    }
  } else if (nextPill) {
    nextPill.classList.add("hidden");
  }
}

/* ============================================================================
   7. LÓGICA DO TEXAS HOLD'EM (BLINDS, RONDAS, AÇÕES, SHOWDOWN)
   ============================================================================ */
function startNewHand() {
  const s = normalizeRoomState(structuredClone(roomState));
  const eligible = s.players.filter(p => p.chips > 0);
  if (eligible.length < 2) {
    s.message = "Fim do torneio! Menos de 2 jogadores com fichas.";
    s.nextHandDeadline = 0;
    s.turnDeadline = 0;
    syncState(s);
    return;
  }

  s.deck = shuffleDeck(createDeck());
  s.community = [];
  s.pot = 0;
  s.phase = "PREFLOP";
  s.nextHandDeadline = 0;
  s.winnerIds = [];
  s.winningHandName = "";
  s.winningCards = [];

  let nextDealer = s.dealerIndex % s.players.length;
  for (let i = 1; i <= s.players.length; i++) {
    const cand = (s.dealerIndex + i) % s.players.length;
    if (s.players[cand].chips > 0) {
      nextDealer = cand;
      break;
    }
  }
  s.dealerIndex = nextDealer;

  s.players.forEach(p => {
    p.bet = 0;
    p.folded = p.chips <= 0;
    p.allIn = false;
    p.acted = false;
    p.status = p.chips <= 0 ? "ELIMINADO" : "";
    p.hand = p.folded ? [] : [s.deck.pop(), s.deck.pop()];
  });

  const activeIndices = s.players.map((p, i) => (!p.folded ? i : -1)).filter(i => i !== -1);
  const sbPos = activeIndices.length === 2
    ? s.dealerIndex
    : nextActiveIndex(s, s.dealerIndex);
  const bbPos = nextActiveIndex(s, sbPos);

  postBlind(s, sbPos, SMALL_BLIND, "SB");
  postBlind(s, bbPos, BIG_BLIND, "BB");

  s.currentBet = Math.max(s.players[sbPos].bet, s.players[bbPos].bet);
  s.minRaise = BIG_BLIND;

  const canActAfterBlinds = s.players.filter(p => !p.folded && !p.allIn);
  const firstToAct = nextActiveIndex(s, bbPos);

  if (
    firstToAct === -1 ||
    (canActAfterBlinds.length <= 1 && canActAfterBlinds.every(p => p.bet >= s.currentBet))
  ) {
    advancePhase(s);
    return;
  }

  s.turnIndex = firstToAct;
  s.turnDeadline = Date.now() + TURN_DURATION_MS;
  s.message = `Cartas dadas! Vez de ${s.players[s.turnIndex].name}.`;
  setSoundEvent(s, "shuffle");
  syncState(s);
}

function postBlind(s, idx, amount, label) {
  const p = s.players[idx];
  const paid = Math.min(p.chips, amount);
  p.chips -= paid;
  p.bet += paid;
  s.pot += paid;
  p.status = paid < amount ? `${label} ALL-IN` : label;
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

function refundUncalledBet(s) {
  const active = s.players.filter(p => !p.folded);
  if (active.length < 2) return;
  const sorted = [...active].sort((a, b) => b.bet - a.bet);
  const excess = sorted[0].bet - sorted[1].bet;
  if (excess > 0) {
    sorted[0].bet -= excess;
    sorted[0].chips += excess;
    s.pot -= excess;
    if (sorted[0].chips > 0) sorted[0].allIn = false;
  }
}

function handleAction(playerId, action, raiseTo = 0, isTimeout = false) {
  if (isSyncingAction && !isTimeout) return;
  if (!roomState) return;

  const s = normalizeRoomState(structuredClone(roomState));
  const idx = s.turnIndex;
  if (idx < 0 || !s.players[idx] || s.players[idx].id !== playerId) return;

  const p = s.players[idx];
  let soundType = "chip";

  if (action === "fold") {
    p.folded = true;
    p.hand = [];
    p.status = isTimeout ? "AUTO-FOLD" : "FOLD";
    soundType = "fold";
  } else if (action === "check-call") {
    const toCall = Math.max(0, Math.min(p.chips, s.currentBet - p.bet));
    p.chips -= toCall;
    p.bet += toCall;
    s.pot += toCall;
    if (p.chips === 0 && toCall > 0) {
      p.allIn = true;
      p.status = "ALL-IN";
      soundType = "allin";
    } else {
      p.status = toCall === 0 ? (isTimeout ? "AUTO-CHECK" : "CHECK") : `CALL ${toCall}€`;
      soundType = toCall === 0 ? "check" : "chip";
    }
  } else if (action === "raise") {
    const target = Math.max(Number(raiseTo) || 0, s.currentBet + s.minRaise);
    const needed = Math.max(0, Math.min(p.chips, target - p.bet));
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
    soundType = p.chips === 0 ? "allin" : "chip";
    if (p.chips === 0) p.allIn = true;
  } else if (action === "allin") {
    const push = p.chips;
    p.bet += push;
    s.pot += push;
    p.chips = 0;
    p.allIn = true;
    p.status = "ALL-IN";
    soundType = "allin";
    if (p.bet > s.currentBet) {
      s.minRaise = Math.max(BIG_BLIND, p.bet - s.currentBet);
      s.currentBet = p.bet;
      s.players.forEach(other => { if (other.id !== p.id) other.acted = false; });
    }
  }

  p.acted = true;

  const remaining = s.players.filter(pl => !pl.folded);
  if (remaining.length === 1) {
    remaining[0].chips += s.pot;
    s.winnerIds = [remaining[0].id];
    s.winningHandName = `${remaining[0].name} VENCEU`;
    s.winningCards = [];
    s.message = `${remaining[0].name} recolhe ${s.pot}€!`;
    s.phase = "SHOWDOWN";
    s.turnIndex = -1;
    s.turnDeadline = 0;
    const stillAlive = s.players.filter(pl => pl.chips > 0).length >= 2;
    s.nextHandDeadline = stillAlive ? Date.now() + NEXT_HAND_DELAY_MS : 0;
    setSoundEvent(s, "win");
    syncState(s);
    return;
  }

  const canStillAct = s.players.filter(pl => !pl.folded && !pl.allIn);
  const allMatchedAndActed = canStillAct.every(pl => pl.acted && pl.bet === s.currentBet);

  const roundDone =
    canStillAct.length === 0 ||
    allMatchedAndActed ||
    (canStillAct.length === 1 && canStillAct[0].bet >= s.currentBet);

  if (roundDone) {
    refundUncalledBet(s);
    advancePhase(s);
  } else {
    const nextIdx = nextActiveIndex(s, idx);
    if (nextIdx === -1) {
      refundUncalledBet(s);
      advancePhase(s);
      return;
    }
    s.turnIndex = nextIdx;
    s.turnDeadline = Date.now() + TURN_DURATION_MS;
    s.message = `Vez de ${s.players[s.turnIndex].name}.`;
    setSoundEvent(s, soundType);
    syncState(s);
  }
}

function advancePhase(s) {
  if (!Array.isArray(s.community)) s.community = [];
  if (!Array.isArray(s.deck)) s.deck = [];

  s.players.forEach(p => {
    p.bet = 0;
    p.acted = false;
    if (!p.folded && !p.allIn) p.status = "";
  });
  s.currentBet = 0;
  s.minRaise = BIG_BLIND;

  if (s.phase === "PREFLOP") {
    s.deck.pop();
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
    advancePhase(s);
    return;
  }

  const nextIdx = nextActiveIndex(s, s.dealerIndex);
  if (nextIdx === -1) {
    advancePhase(s);
    return;
  }

  s.turnIndex = nextIdx;
  s.turnDeadline = Date.now() + TURN_DURATION_MS;
  s.message = `${s.phase} na mesa — Vez de ${s.players[s.turnIndex].name}.`;
  setSoundEvent(s, "card");
  syncState(s);
}

function resolveShowdown(s) {
  s.phase = "SHOWDOWN";
  s.turnIndex = -1;
  s.turnDeadline = 0;

  const contenders = s.players.filter(p => !p.folded);
  let bestScore = -1;
  let winners = [];
  let winningCardSet = new Set();

  for (const p of contenders) {
    const evalRes = evaluateBestHand([...(p.hand || []), ...(s.community || [])]);
    p.status = evalRes.name;
    if (evalRes.score > bestScore) {
      bestScore = evalRes.score;
      winners = [p];
      winningCardSet = new Set(evalRes.bestCards.map(cardKey));
    } else if (evalRes.score === bestScore) {
      winners.push(p);
      evalRes.bestCards.forEach(c => winningCardSet.add(cardKey(c)));
    }
  }

  const share = Math.floor(s.pot / winners.length);
  const remainder = s.pot - share * winners.length;
  winners.forEach((w, i) => { w.chips += share + (i === 0 ? remainder : 0); });
  const names = winners.map(w => w.name).join(" & ");

  s.winnerIds = winners.map(w => w.id);
  s.winningHandName = winners[0].status;
  s.winningCards = [...winningCardSet];
  s.message = `🏆 ${names} venceu ${s.pot}€ (${winners[0].status})!`;

  const stillAlive = s.players.filter(pl => pl.chips > 0).length >= 2;
  s.nextHandDeadline = stillAlive ? Date.now() + NEXT_HAND_DELAY_MS : 0;
  setSoundEvent(s, "win");
  syncState(s);
}

/* ============================================================================
   8. BOTS PARA MODO TESTE OFFLINE
   ============================================================================ */
function maybeTriggerBotTurn() {
  if (!localMode || !roomState || roomState.turnIndex < 0) return;
  const current = roomState.players[roomState.turnIndex];
  if (!current || !current.isBot) return;

  const delay = 900 + secureRandomInt(900);
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
  }, delay);
}

/* ============================================================================
   9. RENDERIZAÇÃO DA INTERFACE, ASSETS HD E HIGHLIGHT DE VITÓRIA
   ============================================================================ */
function renderPotChipsHTML(amount) {
  if (!amount || amount <= 0) return "";
  const denoms = [
    { value: 500, cls: "chip-500" },
    { value: 100, cls: "chip-100" },
    { value: 25,  cls: "chip-25" },
    { value: 10,  cls: "chip-10" },
    { value: 5,   cls: "chip-5" }
  ];

  let rem = amount;
  let html = "";
  for (const d of denoms) {
    const count = Math.min(6, Math.floor(rem / d.value));
    rem %= d.value;
    if (count > 0) {
      let stack = "";
      for (let i = 0; i < count; i++) stack += `<div class="poker-chip ${d.cls}"></div>`;
      html += `<div class="chip-stack">${stack}</div>`;
    }
  }
  return html;
}

function renderCardHTML(card, hidden = false, small = false, highlightClass = "") {
  const sizeClass = small ? "small" : "";
  if (hidden || !card) {
    return `
      <div class="card back ${sizeClass}">
        <div class="card-back-inner"><span class="card-back-emblem">❄</span></div>
      </div>
    `;
  }
  const isRed = card.suit === "♥" || card.suit === "♦" ? "red" : "";
  return `
    <div class="card ${isRed} ${sizeClass} ${highlightClass}">
      <div class="card-corner top">
        <span class="card-rank">${card.label}</span>
        <span class="card-suit-mini">${card.suit}</span>
      </div>
      <div class="card-center">${card.suit}</div>
      <div class="card-corner bottom">
        <span class="card-rank">${card.label}</span>
        <span class="card-suit-mini">${card.suit}</span>
      </div>
    </div>
  `;
}

function renderGame() {
  if (!roomState) return;

  if (roomState.lastEvent && roomState.lastEvent.ts !== lastPlayedEventTs) {
    lastPlayedEventTs = roomState.lastEvent.ts;
    SoundEngine.playEvent(roomState.lastEvent.type);
  }

  const players = roomState.players || [];
  const community = roomState.community || [];
  const isShowdown = roomState.phase === "SHOWDOWN";
  const winCardsSet = new Set(roomState.winningCards || []);
  const winnerIdsSet = new Set(roomState.winnerIds || []);
  const hasCardHighlights = isShowdown && winCardsSet.size > 0;

  $("display-room-code").textContent = currentRoomCode || "DEMO";
  $("display-phase").textContent = roomState.phase === "WAITING" ? "A AGUARDAR" : roomState.phase;
  $("pot-amount").textContent = roomState.pot;
  $("pot-chips").innerHTML = renderPotChipsHTML(roomState.pot);
  $("table-message").textContent = roomState.message;

  const isHost = roomState.hostId === myId;
  const hasEnoughPlayers = players.length >= 2;
  const canStart = isHost && hasEnoughPlayers && (roomState.phase === "WAITING" || isShowdown);
  $("btn-start-game").classList.toggle("hidden", !canStart);
  $("btn-start-game").textContent = isShowdown ? "Saltar Espera" : "Começar Já";

  $("community-cards").innerHTML = community.map(c => {
    let hl = "";
    if (hasCardHighlights) {
      hl = winCardsSet.has(cardKey(c)) ? "card-win" : "card-dim";
    }
    return renderCardHTML(c, false, false, hl);
  }).join("");

  const bannerEl = $("winning-hand-banner");
  if (bannerEl) {
    if (isShowdown && roomState.winningHandName) {
      bannerEl.textContent = roomState.winningHandName.toUpperCase();
      bannerEl.classList.remove("hidden");
    } else {
      bannerEl.classList.add("hidden");
    }
  }
