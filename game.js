/* ============================================================================
   1. CONFIGURAÇÃO FIREBASE (CARREGADO DINAMICAMENTE — O JOGO ARRANCA MESMO OFFLINE)
   ============================================================================ */
const firebaseConfig = {
  apiKey: "AIzaSyADFQ4N7oNo2QDJXeos685Oi5O4tCyyVCk",
  authDomain: "hiperbluff.firebaseapp.com",
  databaseURL: "https://hiperbluff-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "hiperbluff"
};

const FIREBASE_VERSION = "10.12.2";
const FIREBASE_OFFLINE_MSG =
  "Sem ligação ao Firebase. Verifica a internet ou usa o modo teste (offline).";

let db = null;
let initializeApp, getDatabase, ref, set, get, onValue, update, runTransaction;

// Diferença entre o relógio local e o relógio do servidor Firebase (corrige telemóveis desfasados)
let serverOffset = 0;
const nowMs = () => Date.now() + serverOffset;

const isFirebaseConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.databaseURL);

async function loadFirebase() {
  if (!isFirebaseConfigured) return false;
  try {
    const base = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}`;
    const [appMod, dbMod] = await withTimeout(
      Promise.all([
        import(`${base}/firebase-app.js`),
        import(`${base}/firebase-database.js`)
      ]),
      8000
    );
    ({ initializeApp } = appMod);
    ({ getDatabase, ref, set, get, onValue, update, runTransaction } = dbMod);

    const app = initializeApp(firebaseConfig);
    db = getDatabase(app);
    onValue(ref(db, ".info/serverTimeOffset"), (snap) => {
      serverOffset = Number(snap.val()) || 0;
    });
    return true;
  } catch (err) {
    console.error("Firebase indisponível (offline?):", err);
    db = null;
    return false;
  }
}

// A interface fica logo ativa; as ações online esperam por esta promessa.
const firebaseReady = loadFirebase();

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
   3. CONSTANTES, HELPERS SEGUROS E SHUFFLE CSPRNG + FISHER-YATES
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
const MAX_NAME_LEN = 14;
const MAX_STATUS_LEN = 30;

const TURN_DURATION_MS = 20000;
const NEXT_HAND_DELAY_MS = 6000;
const AUTO_START_DELAY_MS = 10000;
const RUNOUT_STEP_MS = 1300;

const $ = (id) => document.getElementById(id);
const on = (id, event, handler) => {
  const el = $(id);
  if (el) el.addEventListener(event, handler);
};

/* Escapa HTML — OBRIGATÓRIO em tudo o que vem do Firebase e vai para innerHTML (anti-XSS) */
function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

function cleanText(value, max) {
  return String(value ?? "").replace(/[\u0000-\u001f]/g, "").trim().slice(0, max);
}

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
      name: cleanText(p.name, MAX_NAME_LEN) || "Jogador",
      chips: Number(p.chips) || 0,
      bet: Number(p.bet) || 0,
      totalBet: Number(p.totalBet) || 0,
      hand: Array.isArray(p.hand) ? p.hand : Object.values(p.hand || {}),
      folded: Boolean(p.folded),
      allIn: Boolean(p.allIn),
      acted: Boolean(p.acted),
      isBot: Boolean(p.isBot),
      status: cleanText(p.status, MAX_STATUS_LEN)
    }))
  };
}

/* ============================================================================
   6. ESTADO LOCAL, SINCRONIZAÇÃO E MOTOR DE TIMERS
   ============================================================================ */

/* ID do jogador PERSISTENTE: se a app for fechada/recarregada, voltas ao mesmo lugar.
   Para testar 2 jogadores no mesmo browser, abre o 2.º separador com  ?p=2  no URL. */
const PLAYER_SLOT = (() => {
  try { return (new URLSearchParams(location.search).get("p") || "").replace(/[^a-z0-9]/gi, ""); }
  catch (_) { return ""; }
})();

function randomPlayerId() {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  let id = "p_";
  for (let i = 0; i < 8; i++) id += alphabet[secureRandomInt(alphabet.length)];
  return id;
}

function loadOrCreatePlayerId() {
  const key = "hb_id" + PLAYER_SLOT;
  try {
    const saved = localStorage.getItem(key);
    if (saved && /^p_[a-z0-9]{4,}$/.test(saved)) return saved;
    const fresh = randomPlayerId();
    localStorage.setItem(key, fresh);
    return fresh;
  } catch (_) {
    return randomPlayerId();
  }
}

function saveLastRoom(code) {
  try { localStorage.setItem("hb_last_room", code); } catch (_) {}
}
function loadLastRoom() {
  try { return localStorage.getItem("hb_last_room") || ""; } catch (_) { return ""; }
}

let localMode = true;
let myId = loadOrCreatePlayerId();
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
      { id: hostId, name: hostName, chips: STARTING_CHIPS, bet: 0, totalBet: 0, hand: [], folded: false, allIn: false, acted: false, isBot: false, status: "PRONTO" }
    ]
  };
}

function setSoundEvent(state, type) {
  state.lastEvent = { type, ts: nowMs() + Math.random() };
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
  const now = nowMs();
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
   7. LÓGICA DO TEXAS HOLD'EM (BLINDS, RONDAS, AÇÕES, SIDE POTS, RUN-OUT)
   ============================================================================ */
function startNewHand() {
  const s = normalizeRoomState(structuredClone(roomState));
  const eligible = s.players.filter(p => p.chips > 0);
  if (eligible.length < 2) {
    s.message = "Fim do torneio! Faz Rebuy ou inicia Nova Partida.";
    s.nextHandDeadline = 0;
    s.turnDeadline = 0;
    s.isRunout = false;
    s.runoutDeadline = 0;
    syncState(s);
    return;
  }

  s.deck = shuffleDeck(createDeck());
  s.community = [];
  s.pot = 0;
  s.phase = "PREFLOP";
  s.nextHandDeadline = 0;
  s.isRunout = false;
  s.runoutDeadline = 0;
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
    p.totalBet = 0;
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
    refundUncalledBet(s);
    s.isRunout = true;
    s.turnIndex = -1;
    s.turnDeadline = 0;
    s.runoutDeadline = nowMs() + RUNOUT_STEP_MS;
    s.message = "ALL-IN nas Blinds! A revelar cartas...";
    setSoundEvent(s, "shuffle");
    syncState(s);
    return;
  }

  s.turnIndex = firstToAct;
  s.turnDeadline = nowMs() + TURN_DURATION_MS;
  s.message = `Cartas dadas! Vez de ${s.players[s.turnIndex].name}.`;
  setSoundEvent(s, "shuffle");
  syncState(s);
}

function startNewMatchReset() {
  if (!roomState || roomState.hostId !== myId) return;
  const s = normalizeRoomState(structuredClone(roomState));
  s.players.forEach(p => {
    p.chips = STARTING_CHIPS;
    p.bet = 0;
    p.totalBet = 0;
    p.folded = false;
    p.allIn = false;
    p.acted = false;
    p.status = "PRONTO";
  });
  roomState = s;
  startNewHand();
}

async function performRebuy() {
  if (!roomState) return;
  const myIdx = roomState.players.findIndex(p => p.id === myId);
  if (myIdx < 0) return;
  const me = roomState.players[myIdx];
  if (me.chips > 0) return;

  const inActiveHand = roomState.phase !== "WAITING" && roomState.phase !== "SHOWDOWN";
  const newStatus = inActiveHand ? "REBUY (PRÓX. MÃO)" : "REBUY";

  if (localMode) {
    const s = normalizeRoomState(structuredClone(roomState));
    s.players[myIdx].chips = STARTING_CHIPS;
    s.players[myIdx].status = newStatus;
    if (!inActiveHand) {
      s.players[myIdx].folded = false;
      const alive = s.players.filter(pl => pl.chips > 0).length;
      if (s.phase === "SHOWDOWN" && alive >= 2 && s.nextHandDeadline === 0) {
        s.nextHandDeadline = nowMs() + 3000;
        s.message = `${me.name} fez Rebuy (+${STARTING_CHIPS}€)! Nova mão a começar...`;
      }
    }
    setSoundEvent(s, "chip");
    syncState(s);
  } else if (db && currentRoomCode) {
    const updates = {};
    updates[`players/${myIdx}/chips`] = STARTING_CHIPS;
    updates[`players/${myIdx}/status`] = newStatus;
    if (!inActiveHand) {
      updates[`players/${myIdx}/folded`] = false;
      const aliveAfter = roomState.players.filter((pl, idx) => (idx === myIdx ? true : pl.chips > 0)).length;
      if (roomState.phase === "SHOWDOWN" && aliveAfter >= 2 && roomState.nextHandDeadline === 0) {
        updates["nextHandDeadline"] = nowMs() + 3000;
        updates["message"] = `${me.name} fez Rebuy (+${STARTING_CHIPS}€)! Nova mão a começar...`;
      }
    }
    SoundEngine.chip();
    try {
      await withTimeout(update(ref(db, `rooms/${currentRoomCode}`), updates));
    } catch (err) {
      console.error("Erro ao fazer Rebuy:", err);
    }
  }
}

function postBlind(s, idx, amount, label) {
  const p = s.players[idx];
  const paid = Math.min(p.chips, amount);
  p.chips -= paid;
  p.bet += paid;
  p.totalBet += paid;
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
  const bettors = s.players.filter(p => p.bet > 0);
  if (bettors.length < 2) return;
  const sorted = [...bettors].sort((a, b) => b.bet - a.bet);
  if (sorted[0].folded) return;

  const excess = sorted[0].bet - sorted[1].bet;
  if (excess > 0) {
    sorted[0].bet -= excess;
    sorted[0].totalBet = Math.max(0, sorted[0].totalBet - excess);
    sorted[0].chips += excess;
    s.pot = Math.max(0, s.pot - excess);
    if (sorted[0].chips > 0) sorted[0].allIn = false;
  }
}

function handleAction(playerId, action, raiseTo = 0, isTimeout = false) {
  if (isSyncingAction && !isTimeout) return;
  if (!roomState || roomState.isRunout) return;

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
    p.totalBet += toCall;
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
    const prevCurrentBet = s.currentBet;
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
    p.totalBet += needed;
    s.pot += needed;
    if (p.chips === 0) {
      p.allIn = true;
      p.status = "ALL-IN";
      soundType = "allin";
    } else {
      // Se não ultrapassou a aposta atual, na prática foi um Call (evita mostrar "RAISE" falso)
      p.status = newBet > prevCurrentBet ? `RAISE ${newBet}€` : `CALL ${needed}€`;
      soundType = "chip";
    }
  } else if (action === "allin") {
    const push = p.chips;
    p.bet += push;
    p.totalBet += push;
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
    // Limpa as apostas à mesa (já estão contabilizadas no pote entregue ao vencedor)
    s.players.forEach(pl => { pl.bet = 0; });
    s.winnerIds = [remaining[0].id];
    s.winningHandName = `${remaining[0].name} VENCEU`;
    s.winningCards = [];
    s.message = `${remaining[0].name} recolhe ${s.pot}€!`;
    s.phase = "SHOWDOWN";
    s.turnIndex = -1;
    s.turnDeadline = 0;
    s.isRunout = false;
    s.runoutDeadline = 0;
    const stillAlive = s.players.filter(pl => pl.chips > 0).length >= 2;
    s.nextHandDeadline = stillAlive ? nowMs() + NEXT_HAND_DELAY_MS : 0;
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
    const canActNext = s.players.filter(pl => !pl.folded && !pl.allIn);

    if (canActNext.length < 2 && s.phase !== "RIVER") {
      s.players.forEach(pl => {
        pl.bet = 0;
        pl.acted = false;
      });
      s.currentBet = 0;
      s.minRaise = BIG_BLIND;
      s.turnIndex = -1;
      s.turnDeadline = 0;
      s.isRunout = true;
      s.runoutDeadline = nowMs() + RUNOUT_STEP_MS;
      s.message = "ALL-IN! A revelar cartas...";
      setSoundEvent(s, soundType);
      syncState(s);
      return;
    }

    advancePhase(s);
  } else {
    const nextIdx = nextActiveIndex(s, idx);
    if (nextIdx === -1) {
      refundUncalledBet(s);
      advancePhase(s);
      return;
    }
    s.turnIndex = nextIdx;
    s.turnDeadline = nowMs() + TURN_DURATION_MS;
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
    s.isRunout = true;
    s.turnIndex = -1;
    s.turnDeadline = 0;
    s.runoutDeadline = nowMs() + RUNOUT_STEP_MS;
    s.message = `ALL-IN! ${s.phase} na mesa...`;
    setSoundEvent(s, "card");
    syncState(s);
    return;
  }

  const nextIdx = nextActiveIndex(s, s.dealerIndex);
  if (nextIdx === -1) {
    s.isRunout = true;
    s.turnIndex = -1;
    s.turnDeadline = 0;
    s.runoutDeadline = nowMs() + RUNOUT_STEP_MS;
    setSoundEvent(s, "card");
    syncState(s);
    return;
  }

  s.isRunout = false;
  s.runoutDeadline = 0;
  s.turnIndex = nextIdx;
  s.turnDeadline = nowMs() + TURN_DURATION_MS;
  s.message = `${s.phase} na mesa — Vez de ${s.players[s.turnIndex].name}.`;
  setSoundEvent(s, "card");
  syncState(s);
}

function resolveShowdown(s) {
  s.phase = "SHOWDOWN";
  s.turnIndex = -1;
  s.turnDeadline = 0;
  s.isRunout = false;
  s.runoutDeadline = 0;

  const contenders = s.players.filter(p => !p.folded);
  const evalMap = new Map();
  for (const p of contenders) {
    const evalRes = evaluateBestHand([...(p.hand || []), ...(s.community || [])]);
    p.status = evalRes.name;
    evalMap.set(p.id, evalRes);
  }

  let pots = buildSidePots(s.players);
  if (pots.length === 0 && s.pot > 0) {
    pots = [{ amount: s.pot, eligibleIds: contenders.map(p => p.id) }];
  }

  const allWinnerIds = new Set();
  const potSummaries = [];
  let mainWinningHandName = "";
  let mainWinningCardSet = new Set();

  pots.forEach((pot, potIndex) => {
    const eligible = contenders.filter(p => pot.eligibleIds.includes(p.id));
    const pool = eligible.length > 0 ? eligible : contenders;

    let bestScore = -1;
    let potWinners = [];
    let cardSet = new Set();

    for (const p of pool) {
      const res = evalMap.get(p.id);
      if (res.score > bestScore) {
        bestScore = res.score;
        potWinners = [p];
        cardSet = new Set(res.bestCards.map(cardKey));
      } else if (res.score === bestScore) {
        potWinners.push(p);
        res.bestCards.forEach(c => cardSet.add(cardKey(c)));
      }
    }

    const share = Math.floor(pot.amount / potWinners.length);
    const remainder = pot.amount - share * potWinners.length;
    potWinners.forEach((w, i) => {
      w.chips += share + (i === 0 ? remainder : 0);
      allWinnerIds.add(w.id);
    });

    const names = potWinners.map(w => w.name).join(" & ");
    if (potIndex === 0) {
      mainWinningHandName = potWinners[0].status;
      mainWinningCardSet = cardSet;
      potSummaries.push(`${names} +${pot.amount}€ (${potWinners[0].status})`);
    } else {
      potSummaries.push(`Side Pot: ${names} +${pot.amount}€`);
    }
  });

  s.winnerIds = [...allWinnerIds];
  s.winningHandName = mainWinningHandName;
  s.winningCards = [...mainWinningCardSet];
  s.message = `🏆 ${potSummaries.join(" • ")}`;

  const stillAlive = s.players.filter(pl => pl.chips > 0).length >= 2;
  s.nextHandDeadline = stillAlive ? nowMs() + NEXT_HAND_DELAY_MS : 0;
  setSoundEvent(s, "win");
  syncState(s);
}

/* ============================================================================
   8. BOTS PARA MODO TESTE OFFLINE
   ============================================================================ */
function maybeTriggerBotTurn() {
  if (!localMode || !roomState || roomState.isRunout || roomState.turnIndex < 0) return;
  const current = roomState.players[roomState.turnIndex];
  if (!current || !current.isBot) return;

  const delay = 900 + secureRandomInt(900);
  setTimeout(() => {
    if (!roomState || roomState.isRunout || roomState.turnIndex < 0) return;
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
   9. RENDERIZAÇÃO DA INTERFACE (ESQUEMA ZYNGA + SHOWDOWN HIGHLIGHT)
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
  const label = esc(card.label);
  const suit = esc(card.suit);
  return `
    <div class="card ${isRed} ${sizeClass} ${highlightClass}">
      <div class="card-corner top">
        <span class="card-rank">${label}</span>
        <span class="card-suit-mini">${suit}</span>
      </div>
      <div class="card-center">${suit}</div>
      <div class="card-corner bottom">
        <span class="card-rank">${label}</span>
        <span class="card-suit-mini">${suit}</span>
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
  const isWaiting = roomState.phase === "WAITING";
  const winCardsSet = new Set(roomState.winningCards || []);
  const winnerIdsSet = new Set(roomState.winnerIds || []);
  const hasCardHighlights = isShowdown && winCardsSet.size > 0;

  // Alterna entre esquema Zynga de 5 lugares (Tu no centro) e 6 lugares quando entra o 6.º jogador
  const tableEl = document.querySelector(".poker-table");
  const visibleSeatsCount = players.length > 5 ? 6 : 5;
  if (tableEl) {
    tableEl.classList.toggle("six-players", visibleSeatsCount === 6);
  }

  if ($("display-room-code")) $("display-room-code").textContent = currentRoomCode || "DEMO";
  if ($("display-phase")) $("display-phase").textContent = isWaiting ? "A AGUARDAR" : roomState.phase;
  if ($("pot-amount")) $("pot-amount").textContent = roomState.pot;
  if ($("pot-chips")) $("pot-chips").innerHTML = renderPotChipsHTML(roomState.pot);
  if ($("table-message")) $("table-message").textContent = roomState.message;

  const waitingPill = $("waiting-room-pill");
  if (waitingPill) {
    const showWaitingCode = isWaiting && !localMode && Boolean(currentRoomCode);
    waitingPill.classList.toggle("hidden", !showWaitingCode);
    if (showWaitingCode && $("waiting-room-code")) {
      $("waiting-room-code").textContent = currentRoomCode;
    }
  }

  // Só mostra Side Pots quando há pelo menos um jogador ativo em All-In
  const sidePotsEl = $("side-pots-display");
  if (sidePotsEl) {
    const hasActiveAllIn = players.some(p => !p.folded && p.allIn);
    const sidePots = hasActiveAllIn ? buildSidePots(players) : [];
    if (hasActiveAllIn && sidePots.length > 1 && !isWaiting) {
      sidePotsEl.innerHTML = sidePots
        .map((sp, i) => `<span class="side-pot-tag">${i === 0 ? "Principal" : `Side ${i}`}: ${Number(sp.amount) || 0}€</span>`)
        .join("");
      sidePotsEl.classList.remove("hidden");
    } else {
      sidePotsEl.classList.add("hidden");
    }
  }

  const isHost = roomState.hostId === myId;
  const fundedPlayers = players.filter(p => p.chips > 0).length;
  const canStart = isHost && fundedPlayers >= 2 && (isWaiting || isShowdown);
  if ($("btn-start-game")) {
    $("btn-start-game").classList.toggle("hidden", !canStart);
    $("btn-start-game").textContent = isShowdown ? "Saltar Espera" : "Começar Já";
  }

  const tournamentOver = isShowdown && fundedPlayers < 2;
  if ($("btn-new-match")) {
    $("btn-new-match").classList.toggle("hidden", !(isHost && tournamentOver));
  }

  if ($("community-cards")) {
    $("community-cards").innerHTML = community.map(c => {
      let hl = "";
      if (hasCardHighlights) {
        hl = winCardsSet.has(cardKey(c)) ? "card-win" : "card-dim";
      }
      return renderCardHTML(c, false, false, hl);
    }).join("");
  }

  const bannerEl = $("winning-hand-banner");
  if (bannerEl) {
    if (isShowdown && roomState.winningHandName) {
      bannerEl.textContent = roomState.winningHandName.toUpperCase();
      bannerEl.classList.remove("hidden");
    } else {
      bannerEl.classList.add("hidden");
    }
  }

  const myIndex = players.findIndex(p => p.id === myId);
  const offset = myIndex >= 0 ? myIndex : 0;

  for (let seatVisual = 0; seatVisual < MAX_PLAYERS; seatVisual++) {
    const el = document.querySelector(`.seat-${seatVisual}`);
    if (!el) continue;

    if (seatVisual >= visibleSeatsCount) {
      el.className = `seat seat-${seatVisual} empty`;
      el.innerHTML = "";
      continue;
    }

    const pIdx = seatVisual < players.length ? (seatVisual + offset) % players.length : -1;
    const p = pIdx >= 0 ? players[pIdx] : null;

    if (!p) {
      el.className = `seat seat-${seatVisual} empty`;
      el.innerHTML = `
        <div class="seat-ring">
          <div class="seat-circle">
            <span class="seat-empty-label">Livre</span>
          </div>
        </div>
      `;
      continue;
    }

    const isMe = p.id === myId;
    const isTurn = roomState.turnIndex === pIdx;
    const isWinner = isShowdown && winnerIdsSet.has(p.id);
    const inHand = !p.folded && p.hand && p.hand.length === 2;
    const revealOnRunout = roomState.isRunout && !p.folded;
    const showCards = isMe || revealOnRunout || (isShowdown && !p.folded && hasCardHighlights);

    // Valores vindos do Firebase: SEMPRE escapados antes de ir para innerHTML
    const safeName = esc(p.name);
    const safeStatus = esc(p.status);

    el.className = `seat seat-${seatVisual} ${isMe ? "is-me" : ""} ${inHand ? "has-cards" : ""} ${isTurn ? "active-turn" : ""} ${isWinner ? "is-winner" : ""} ${p.folded ? "folded" : ""}`;

    const betPillHTML = p.bet > 0
      ? `<div class="bet-pill"><span class="mini-chip"></span>${Number(p.bet) || 0} €</div>`
      : "";

    if (isMe) {
      // HERÓI (ESTILO ZYNGA): cartas à frente da base do círculo + aposta acima no feltro
      const heroCardsHTML = inHand
        ? `<div class="hero-cards">${p.hand.map(c => {
            let hl = "";
            if (hasCardHighlights) {
              hl = isWinner && winCardsSet.has(cardKey(c)) ? "card-win" : "card-dim";
            }
            return renderCardHTML(c, false, false, hl);
          }).join("")}</div>`
        : "";

      const heroBetHTML = betPillHTML
        ? `<div class="hero-bet-zone">${betPillHTML}</div>`
        : "";

      el.innerHTML = `
        <div class="seat-avatar-stack">
          ${heroBetHTML}
          <div class="seat-ring" ${isTurn ? 'id="active-timer-ring"' : ""}>
            ${roomState.dealerIndex === pIdx && !isWaiting ? `<div class="dealer-chip" title="Botão Dealer">D</div>` : ""}
            ${isTurn ? `<span class="turn-timer-text" id="active-timer-text">20s</span>` : ""}
            <div class="seat-circle">
              <div class="seat-name" title="${safeName}">${safeName}</div>
              <div class="seat-you-tag">TU</div>
            </div>
            ${isWinner ? `<div class="winner-badge">WINNER</div>` : ""}
          </div>
          ${heroCardsHTML}
        </div>
        <div class="seat-chips">${Number(p.chips) || 0} €</div>
        ${safeStatus ? `<div class="seat-status">${safeStatus}</div>` : ""}
      `;
    } else {
      // ADVERSÁRIOS (ESTILO ZYNGA): cartas + ficha de aposta lado a lado dentro do feltro
      const oppCardsHTML = inHand
        ? `<div class="opp-cards ${showCards ? "revealed" : ""}">${p.hand.map(c => {
            let hl = "";
            if (hasCardHighlights && showCards) {
              hl = isWinner && winCardsSet.has(cardKey(c)) ? "card-win" : "card-dim";
            }
            return renderCardHTML(c, !showCards, !showCards, hl);
          }).join("")}</div>`
        : "";

      const feltZoneHTML = (oppCardsHTML || betPillHTML)
        ? `<div class="seat-felt-zone">${oppCardsHTML}${betPillHTML}</div>`
        : "";

      el.innerHTML = `
        ${feltZoneHTML}
        <div class="seat-avatar-stack">
          <div class="seat-ring" ${isTurn ? 'id="active-timer-ring"' : ""}>
            ${roomState.dealerIndex === pIdx && !isWaiting ? `<div class="dealer-chip" title="Botão Dealer">D</div>` : ""}
            ${isTurn ? `<span class="turn-timer-text" id="active-timer-text">20s</span>` : ""}
            <div class="seat-circle">
              <div class="seat-name" title="${safeName}">${safeName}</div>
            </div>
            ${isWinner ? `<div class="winner-badge">WINNER</div>` : ""}
          </div>
        </div>
        <div class="seat-chips">${Number(p.chips) || 0} €</div>
        ${safeStatus ? `<div class="seat-status">${safeStatus}</div>` : ""}
      `;
    }
  }

  const me = players[myIndex];

  const canRebuy = Boolean(me && me.chips === 0 && (me.folded || isShowdown || isWaiting));
  if ($("btn-rebuy")) {
    $("btn-rebuy").classList.toggle("hidden", !canRebuy);
  }

  if ($("hand-strength-badge")) {
    if (me && !me.folded && me.hand && me.hand.length === 2) {
      const allCards = [...me.hand, ...community];
      const evalText = allCards.length >= 5 ? evaluateBestHand(allCards).name : "Pré-Flop";
      $("hand-strength-badge").textContent = `A tua mão: ${evalText}`;
    } else {
      $("hand-strength-badge").textContent = "A tua mão: —";
    }
  }

  const isMyTurn = Boolean(me && !roomState.isRunout && roomState.turnIndex === myIndex && !me.folded && !me.allIn);
  if (isMyTurn && !wasMyTurn) {
    setTimeout(() => SoundEngine.myTurn(), 180);
  }
  wasMyTurn = isMyTurn;

  if ($("action-bar")) {
    $("action-bar").classList.toggle("disabled", !isMyTurn);
  }

  if (isMyTurn) {
    const toCall = Math.max(0, roomState.currentBet - me.bet);
    const callAmount = Math.min(toCall, me.chips);
    if ($("btn-check-call")) {
      $("btn-check-call").textContent = toCall === 0
        ? "Check"
        : (callAmount >= me.chips ? `Call All-In (${callAmount}€)` : `Call ${callAmount}€`);
    }

    const maxRaiseTo = me.bet + me.chips;
    const canRaise = me.chips > toCall;
    const minRaiseTo = Math.min(maxRaiseTo, roomState.currentBet + roomState.minRaise);

    const slider = $("raise-slider");
    const raiseBtn = $("btn-raise");
    const raiseRow = $("raise-row");
    if (slider) slider.disabled = !canRaise;
    if (raiseBtn) raiseBtn.disabled = !canRaise;
    if (raiseRow) raiseRow.classList.toggle("disabled-raise", !canRaise);

    const turnKey = `${roomState.phase}_${roomState.turnDeadline}_${roomState.currentBet}`;
    if (slider && lastSliderTurnKey !== turnKey) {
      lastSliderTurnKey = turnKey;
      slider.step = (maxRaiseTo - minRaiseTo) % 10 === 0 ? 10 : 1;
      slider.min = minRaiseTo;
      slider.max = maxRaiseTo;
      slider.value = minRaiseTo;
      if ($("raise-value")) $("raise-value").textContent = minRaiseTo;
    }
  }

  tickTimers();
}

/* ============================================================================
   10. EVENTOS DE LOBBY, APOSTAS RÁPIDAS E CONTROLOS
   ============================================================================ */
function openGameScreen() {
  if ($("lobby-screen")) $("lobby-screen").classList.remove("active");
  if ($("game-screen")) $("game-screen").classList.add("active");
  startTimerLoop();
}

function showError(msg) {
  if ($("lobby-error")) $("lobby-error").textContent = msg;
}

function copyRoomCodeWithFeedback(btn) {
  if (!currentRoomCode) return;
  if (navigator.clipboard) navigator.clipboard.writeText(currentRoomCode).catch(() => {});
  const original = btn.textContent;
  btn.textContent = "Copiado ✓";
  setTimeout(() => { btn.textContent = original; }, 1400);
}

function setQuickRaise(mode) {
  if (!roomState) return;
  const me = roomState.players.find(p => p.id === myId);
  const slider = $("raise-slider");
  if (!me || !slider || slider.disabled) return;

  const minRaiseTo = Number(slider.min);
  const maxRaiseTo = Number(slider.max);
  const toCall = Math.max(0, roomState.currentBet - me.bet);
  const potAfterCall = roomState.pot + toCall;

  let target = minRaiseTo;
  if (mode === "half") {
    target = Math.round((roomState.currentBet + potAfterCall * 0.5) / 10) * 10;
  } else if (mode === "pot") {
    target = Math.round((roomState.currentBet + potAfterCall) / 10) * 10;
  }

  target = Math.max(minRaiseTo, Math.min(maxRaiseTo, target));
  slider.value = target;
  if ($("raise-value")) $("raise-value").textContent = target;
}

// Repõe o último código de sala usado (útil se a app foi fechada pelo Android)
(function prefillLastRoom() {
  const input = $("room-code");
  const last = loadLastRoom();
  if (input && last && !input.value) input.value = last;
})();

on("btn-mute", "click", () => {
  const muted = SoundEngine.toggleMute();
  const btn = $("btn-mute");
  if (btn) {
    btn.textContent = muted ? "🔇" : "🔊";
    btn.classList.toggle("muted", muted);
  }
});

on("btn-create-room", "click", async () => {
  SoundEngine.init();
  showError("");

  const btn = $("btn-create-room");
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = "A criar sala...";

  try {
    await firebaseReady;
    if (!isFirebaseConfigured || !db) {
      showError(FIREBASE_OFFLINE_MSG);
      return;
    }

    myName = cleanText($("player-name")?.value, MAX_NAME_LEN) || "Jogador";
    localMode = false;
    currentRoomCode = generateRoomCode();
    const initial = createInitialRoom(myId, myName);

    await withTimeout(set(ref(db, `rooms/${currentRoomCode}`), initial));
    saveLastRoom(currentRoomCode);
    roomState = initial;
    openGameScreen();
    renderGame();
    subscribeToRoom(currentRoomCode);
  } catch (err) {
    console.error("Erro ao criar sala:", err);
    const msg = String(err?.message || err);
    if (msg.toLowerCase().includes("permission")) {
      showError("Firebase bloqueado (PERMISSION_DENIED). Verifica as regras da Realtime Database.");
    } else {
      showError(`Erro ao criar sala: ${msg}`);
    }
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
  }
});

on("btn-join-room", "click", async () => {
  SoundEngine.init();
  showError("");

  const code = ($("room-code")?.value || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  myName = cleanText($("player-name")?.value, MAX_NAME_LEN) || "Jogador";

  const btn = $("btn-join-room");
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = "A entrar...";

  try {
    await firebaseReady;
    if (!isFirebaseConfigured || !db) {
      showError(FIREBASE_OFFLINE_MSG);
      return;
    }
    if (!code) {
      showError("Introduz o código da sala.");
      return;
    }

    const snap = await withTimeout(get(ref(db, `rooms/${code}`)));
    if (!snap.exists()) {
      showError(`Sala "${code}" não encontrada.`);
      return;
    }

    const data = normalizeRoomState(snap.val());
    const isWaitingPhase = data.phase === "WAITING";
    const newPlayer = {
      id: myId, name: myName, chips: STARTING_CHIPS, bet: 0, totalBet: 0,
      hand: [], folded: !isWaitingPhase, allIn: false, acted: false, isBot: false,
      status: isWaitingPhase ? "PRONTO" : "A AGUARDAR MÃO"
    };

    // TRANSAÇÃO ATÓMICA: dois jogadores a entrar em simultâneo já não se sobrepõem.
    // Se o teu id já estiver na sala (reconexão), reutiliza o teu lugar.
    let outcome = "";
    const tx = await withTimeout(
      runTransaction(ref(db, `rooms/${code}/players`), (current) => {
        const list = Array.isArray(current)
          ? current.filter(Boolean)
          : Object.values(current || {});
        if (list.some(pl => pl && pl.id === myId)) {
          outcome = "rejoin";
          return list;
        }
        if (list.length >= MAX_PLAYERS) {
          outcome = "full";
          return; // aborta a transação
        }
        outcome = "joined";
        return [...list, newPlayer];
      })
    );

    if (!tx.committed || outcome === "full") {
      showError("A mesa já está cheia (6/6).");
      return;
    }

    localMode = false;
    currentRoomCode = code;
    saveLastRoom(code);
    roomState = normalizeRoomState({ ...snap.val(), players: tx.snapshot.val() });
    subscribeToRoom(code);
    openGameScreen();
    renderGame();
  } catch (err) {
    console.error("Erro ao entrar na sala:", err);
    const msg = String(err?.message || err);
    if (msg.toLowerCase().includes("permission")) {
      showError("Firebase bloqueado (PERMISSION_DENIED). Verifica as regras da Realtime Database.");
    } else {
      showError(`Erro ao entrar na sala: ${msg}`);
    }
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
  }
});

on("room-code", "keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    if ($("btn-join-room")) $("btn-join-room").click();
  }
});

function subscribeToRoom(code) {
  if (unsubscribeRoom) unsubscribeRoom();
  unsubscribeRoom = onValue(ref(db, `rooms/${code}`), (snap) => {
    if (snap.exists()) {
      roomState = normalizeRoomState(snap.val());

      const players = roomState.players;
      if (
        roomState.hostId === myId &&
        roomState.phase === "WAITING" &&
        players.length >= 2 &&
        (!roomState.nextHandDeadline || roomState.nextHandDeadline === 0)
      ) {
        const deadline = nowMs() + AUTO_START_DELAY_MS;
        update(ref(db, `rooms/${code}`), {
          nextHandDeadline: deadline,
          message: `Jogadores na mesa (${players.length}/${MAX_PLAYERS}) — O jogo começa em 10s!`
        });
      }

      renderGame();
    }
  });
}

on("btn-demo-mode", "click", () => {
  SoundEngine.init();
  showError("");
  myName = cleanText($("player-name")?.value, MAX_NAME_LEN) || "Tu";
  localMode = true;
  currentRoomCode = "OFFLINE";
  const demo = createInitialRoom(myId, myName);
  const botNames = ["Tiago", "Marta", "Rui", "Inês"];
  botNames.forEach((name, i) => {
    demo.players.push({
      id: `bot_${i}`, name, chips: STARTING_CHIPS, bet: 0, totalBet: 0,
      hand: [], folded: false, allIn: false, acted: false, isBot: true, status: ""
    });
  });
  roomState = demo;
  openGameScreen();
  startNewHand();
});

on("btn-start-game", "click", startNewHand);
on("btn-new-match", "click", startNewMatchReset);
on("btn-rebuy", "click", performRebuy);

on("btn-fold", "click", () => handleAction(myId, "fold"));
on("btn-check-call", "click", () => handleAction(myId, "check-call"));
on("btn-raise", "click", () => handleAction(myId, "raise", Number($("raise-slider")?.value || 0)));
on("btn-allin", "click", () => handleAction(myId, "allin"));
on("raise-slider", "input", (e) => {
  if ($("raise-value")) $("raise-value").textContent = e.target.value;
});

on("btn-bet-min", "click", () => setQuickRaise("min"));
on("btn-bet-half", "click", () => setQuickRaise("half"));
on("btn-bet-pot", "click", () => setQuickRaise("pot"));

on("btn-copy-code", "click", (e) => copyRoomCodeWithFeedback(e.currentTarget));
on("btn-waiting-copy", "click", (e) => copyRoomCodeWithFeedback(e.currentTarget));

on("btn-leave", "click", async () => {
  if (!localMode && roomState && roomState.turnIndex >= 0) {
    const active = roomState.players[roomState.turnIndex];
    if (active && active.id === myId) {
      handleAction(myId, "fold");
    }
  }
  stopTimerLoop();
  if (unsubscribeRoom) {
    unsubscribeRoom();
    unsubscribeRoom = null;
  }
  roomState = null;
  wasMyTurn = false;
  if ($("game-screen")) $("game-screen").classList.remove("active");
  if ($("lobby-screen")) $("lobby-screen").classList.add("active");
  if (document.fullscreenElement || document.webkitFullscreenElement) {
    exitFullscreenMode();
  }
});

/* ============================================================================
   11. INSTALAÇÃO PWA (ANDROID + IPHONE)
   ============================================================================ */
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}

let deferredInstallPrompt = window.__deferredInstallPrompt || null;
const installBtn = $("btn-install-app");
const iosModal = $("ios-install-modal");

const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
const isStandalone =
  window.matchMedia("(display-mode: standalone)").matches ||
  window.matchMedia("(display-mode: fullscreen)").matches ||
  window.navigator.standalone === true;

function syncInstallButton() {
  if (!installBtn || isStandalone) return;
  if (deferredInstallPrompt || isIOS || isMobile) {
    installBtn.classList.remove("hidden");
  }
}

syncInstallButton();

window.addEventListener("hiperbluff:install-ready", () => {
  deferredInstallPrompt = window.__deferredInstallPrompt;
  syncInstallButton();
});

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  window.__deferredInstallPrompt = e;
  syncInstallButton();
});

window.addEventListener("appinstalled", () => {
  deferredInstallPrompt = null;
  window.__deferredInstallPrompt = null;
  if (installBtn) installBtn.classList.add("hidden");
});

on("btn-install-app", "click", async () => {
  const promptEvent = deferredInstallPrompt || window.__deferredInstallPrompt;
  if (promptEvent) {
    promptEvent.prompt();
    const { outcome } = await promptEvent.userChoice;
    if (outcome === "accepted" && installBtn) installBtn.classList.add("hidden");
    deferredInstallPrompt = null;
    window.__deferredInstallPrompt = null;
  } else if (isIOS && iosModal) {
    iosModal.classList.remove("hidden");
  } else {
    showError("No Chrome, toca no menu (⋮) no canto superior direito e escolhe \"Instalar aplicação\" ou \"Adicionar ao ecrã principal\".");
  }
});

on("btn-close-ios-modal", "click", () => {
  if (iosModal) iosModal.classList.add("hidden");
});
if (iosModal) {
  iosModal.addEventListener("click", (e) => {
    if (e.target === iosModal) iosModal.classList.add("hidden");
  });
}

/* ============================================================================
   12. FULLSCREEN NATIVO, ORIENTAÇÃO LANDSCAPE E BLOQUEIO DE ZOOM (MOBILE)
   ============================================================================ */
const fullscreenBtn = $("btn-fullscreen");
const rotateHint = $("rotate-hint");

const canUseFullscreen = Boolean(
  document.documentElement.requestFullscreen ||
  document.documentElement.webkitRequestFullscreen
);

function isInFullscreen() {
  return Boolean(
    document.fullscreenElement ||
    document.webkitFullscreenElement ||
    window.matchMedia("(display-mode: fullscreen)").matches
  );
}

async function enterFullscreenLandscape() {
  const el = document.documentElement;
  try {
    if (el.requestFullscreen) {
      await el.requestFullscreen({ navigationUI: "hide" });
    } else if (el.webkitRequestFullscreen) {
      el.webkitRequestFullscreen();
    }
  } catch (_) {}

  if (screen.orientation && typeof screen.orientation.lock === "function") {
    screen.orientation.lock("landscape").catch(() => {});
  }
  updateFullscreenState();
}

async function exitFullscreenMode() {
  try {
    if (document.exitFullscreen) {
      await document.exitFullscreen();
    } else if (document.webkitExitFullscreen) {
      document.webkitExitFullscreen();
    }
  } catch (_) {}

  if (screen.orientation && typeof screen.orientation.unlock === "function") {
    try {
      screen.orientation.unlock();
    } catch (_) {}
  }
  updateFullscreenState();
}

function updateFullscreenState() {
  const active = isInFullscreen();
  document.body.classList.toggle("is-fullscreen", active);
}

if (fullscreenBtn) {
  if (!canUseFullscreen) {
    fullscreenBtn.classList.add("hidden");
  } else {
    fullscreenBtn.addEventListener("click", () => {
      if (isInFullscreen()) exitFullscreenMode();
      else enterFullscreenLandscape();
    });
  }
}

document.addEventListener("fullscreenchange", updateFullscreenState);
document.addEventListener("webkitfullscreenchange", updateFullscreenState);
window.addEventListener("resize", updateFullscreenState);
updateFullscreenState();

on("btn-rotate-landscape", "click", () => enterFullscreenLandscape());
on("btn-dismiss-rotate", "click", () => {
  if (rotateHint) rotateHint.classList.add("dismissed");
});

document.addEventListener("gesturestart", (e) => e.preventDefault(), { passive: false });
let lastTouchEnd = 0;
document.addEventListener("touchend", (e) => {
  const now = Date.now();
  if (now - lastTouchEnd <= 300 && !e.target.closest("button, input, a, label")) {
    e.preventDefault();
  }
  lastTouchEnd = now;
}, { passive: false });

/* === FIM DO FICHEIRO game.js === */
