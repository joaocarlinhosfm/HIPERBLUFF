import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getDatabase, ref, set, get, onValue, update } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import {
  initUserSystem,
  restoreSession,
  registerUser,
  loginUser,
  logoutUser,
  getCurrentUser,
  applyBalanceDelta,
  formatEuro
} from "./user.js";

/* ============================================================================
   1. CONFIGURAÇÃO FIREBASE
   ============================================================================ */
const firebaseConfig = {
  apiKey: "AIzaSyADFQ4N7oNo2QDJXeos685Oi5O4tCyyVCk",
  authDomain: "hiperbluff.firebaseapp.com",
  databaseURL: "https://hiperbluff-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "hiperbluff"
};

let db = null;
const isFirebaseConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.databaseURL);

if (isFirebaseConfigured) {
  try {
    const app = initializeApp(firebaseConfig);
    db = getDatabase(app);
  } catch (err) {
    console.error("Erro ao inicializar Firebase:", err);
  }
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
      this.ctx.resume().catch(() => {});
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
   3. CONSTANTES, LED 3D, HELPERS SEGUROS E SHUFFLE CSPRNG + FISHER-YATES
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
const RUNOUT_STEP_MS = 1300;

const LED_THEMES = [
  { name: "Gelo",       core: "#38bdf8", bright: "#bae6fd", soft: "rgba(56, 189, 248, 0.45)" },
  { name: "Ouro Vegas", core: "#f59e0b", bright: "#fef08a", soft: "rgba(245, 158, 11, 0.46)" },
  { name: "Roxo Neon",  core: "#a855f7", bright: "#e9d5ff", soft: "rgba(168, 85, 247, 0.48)" },
  { name: "Rubi",       core: "#f43f5e", bright: "#fecdd3", soft: "rgba(244, 63, 94, 0.46)" },
  { name: "Esmeralda",  core: "#10b981", bright: "#a7f3d0", soft: "rgba(16, 185, 129, 0.46)" },
  { name: "Magenta",    core: "#ec4899", bright: "#fbcfe8", soft: "rgba(236, 72, 153, 0.46)" },
  { name: "Âmbar",      core: "#f97316", bright: "#fed7aa", soft: "rgba(249, 115, 22, 0.46)" }
];

let lastLedIndex = Number(sessionStorage.getItem("hiperbluff_led") ?? -1);

const $ = (id) => document.getElementById(id);
const on = (id, event, handler) => {
  const el = $(id);
  if (el) el.addEventListener(event, handler);
};

function withTimeout(promise, ms = 10000) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Sem resposta do Firebase (timeout). Verifica a internet ou a Realtime Database.")), ms)
    )
  ]);
}

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

function pickNextLedIndex() {
  let idx;
  do {
    idx = secureRandomInt(LED_THEMES.length);
  } while (idx === lastLedIndex && LED_THEMES.length > 1);
  lastLedIndex = idx;
  try { sessionStorage.setItem("hiperbluff_led", String(idx)); } catch (_) {}
  return idx;
}

function applyTableLedTheme(index) {
  const safeIdx = ((Number(index) || 0) % LED_THEMES.length + LED_THEMES.length) % LED_THEMES.length;
  const theme = LED_THEMES[safeIdx];
  const root = document.documentElement;
  root.style.setProperty("--led-core", theme.core);
  root.style.setProperty("--led-bright", theme.bright);
  root.style.setProperty("--led-glow-soft", theme.soft);
  lastLedIndex = safeIdx;
  try { sessionStorage.setItem("hiperbluff_led", String(safeIdx)); } catch (_) {}
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
   4. AVALIADOR OFICIAL DE MÃOS (5 DE 7 CARTAS + KICKERS) E SIDE POTS
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

function buildSidePots(players) {
  const contributors = (players || []).filter(p => p.totalBet > 0);
  if (contributors.length === 0) return [];

  const levels = [...new Set(contributors.map(p => p.totalBet))].sort((a, b) => a - b);
  const pots = [];
  let prevLevel = 0;

  for (const level of levels) {
    const slice = level - prevLevel;
    if (slice <= 0) continue;

    let amount = 0;
    const eligibleIds = [];
    for (const p of contributors) {
      if (p.totalBet >= level) {
        amount += slice;
        if (!p.folded) eligibleIds.push(p.id);
      }
    }

    if (amount > 0) {
      const lastPot = pots[pots.length - 1];
      const sameEligible =
        lastPot &&
        lastPot.eligibleIds.length === eligibleIds.length &&
        lastPot.eligibleIds.every((id, idx) => id === eligibleIds[idx]);

      if (sameEligible) {
        lastPot.amount += amount;
      } else {
        pots.push({ amount, eligibleIds });
      }
    }
    prevLevel = level;
  }

  return pots;
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
    tableLedIndex: raw.tableLedIndex !== undefined ? Number(raw.tableLedIndex) : 0,
    handId: Number(raw.handId) || 0,
    phase: raw.phase || "WAITING",
    pot: Number(raw.pot) || 0,
    currentBet: Number(raw.currentBet) || 0,
    minRaise: Number(raw.minRaise) || BIG_BLIND,
    dealerIndex: Number(raw.dealerIndex) || 0,
    turnIndex: raw.turnIndex !== undefined ? Number(raw.turnIndex) : -1,
    turnDeadline: Number(raw.turnDeadline) || 0,
    nextHandDeadline: Number(raw.nextHandDeadline) || 0,
    isRunout: Boolean(raw.isRunout),
    runoutDeadline: Number(raw.runoutDeadline) || 0,
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
      handStartChips: p.handStartChips !== undefined ? Number(p.handStartChips) : (Number(p.chips) || 0),
      bet: Number(p.bet) || 0,
      totalBet: Number(p.totalBet) || 0,
      hand: Array.isArray(p.hand) ? p.hand : Object.values(p.hand || {}),
      folded: Boolean(p.folded),
      allIn: Boolean(p.allIn),
      acted: Boolean(p.acted),
      participated: Boolean(p.participated),
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
let lastHandledRunoutDeadline = 0;
let lastPlayedEventTs = 0;
let lastTickKey = "";
let wasMyTurn = false;
let lastSliderTurnKey = "";
let trackedHandId = 0;
let handSettled = false;

function generateRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 5; i++) code += chars[secureRandomInt(chars.length)];
  return code;
}

function createInitialRoom(hostId, hostName, initialChips = STARTING_CHIPS) {
  return {
    hostId,
    tableLedIndex: pickNextLedIndex(),
    handId: 0,
    phase: "WAITING",
    pot: 0,
    currentBet: 0,
    minRaise: BIG_BLIND,
    dealerIndex: 0,
    turnIndex: -1,
    turnDeadline: 0,
    nextHandDeadline: 0,
    isRunout: false,
    runoutDeadline: 0,
    lastEvent: null,
    winnerIds: [],
    winningHandName: "",
    winningCards: [],
    deck: [],
    community: [],
    message: "A aguardar jogadores... Partilha o código da sala!",
    players: [
      {
        id: hostId, name: hostName, chips: initialChips, handStartChips: initialChips,
        bet: 0, totalBet: 0, hand: [], folded: false, allIn: false, acted: false,
        participated: false, isBot: false, status: "PRONTO"
      }
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

  // 1. Run-out progressivo de All-In
  if (roomState.isRunout && roomState.runoutDeadline > 0) {
    if (now >= roomState.runoutDeadline && isHost && lastHandledRunoutDeadline !== roomState.runoutDeadline) {
      lastHandledRunoutDeadline = roomState.runoutDeadline;
      const nextState = normalizeRoomState(structuredClone(roomState));
      advancePhase(nextState);
    }
    return;
  }

  // 2. Temporizador de Jogada Ativa (Anel Circular)
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

  // 3. Temporizador Automático (Início da Sala após 2.º jogador OU Próxima Mão)
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
      if (secs >= 1 &
