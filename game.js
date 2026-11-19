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
const isFirebaseConfigured = firebaseConfig.apiKey !== "SUA_API_KEY";
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

// Desbloquear áudio na primeira interação do utilizador
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
const AUTO_START_DELAY_MS = 10000; // 10 segundos após entrar o 2.º jogador

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
   4. AVALIADOR OFICIAL DE MÃOS (MELHORES 5 DE 7 CARTAS + KICKERS)
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
   5. ESTADO LOCAL, SINCRONIZAÇÃO E MOTOR DE TIMERS
   ============================================================================ */
let localMode = true;
let myId = "p_" + Math.random().toString(36).slice(2, 8);
let myName = "Jogador";
let currentRoomCode = null;
let roomState = null;
let unsubscribeRoom = null;

let timerInterval = null;
let lastHandledTurnDeadline = 0;
let lastHandledNextHandDeadline = 0;
let lastPlayedEventTs = 0;
let lastTickKey = "";
let wasMyTurn = false;

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
  roomState = newState;
  if (localMode) {
    renderGame();
    maybeTriggerBotTurn();
  } else if (db && currentRoomCode) {
    await set(ref(db, `rooms/${currentRoomCode}`), newState);
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

  // 1. Temporizador de Jogada Ativa
  if (roomState.turnIndex >= 0 && roomState.turnDeadline > 0) {
    const remainingMs = Math.max(0, roomState.turnDeadline - now);
    const pct = Math.min(100, (remainingMs / TURN_DURATION_MS) * 100);
    const secs = Math.ceil(remainingMs / 1000);

    const fillEl = $("active-timer-fill");
    const textEl = $("active-timer-text");
    if (fillEl) {
      fillEl.style.width = `${pct}%`;
      if (secs <= 5) fillEl.style.backgroundColor = "#e11d48";
      else if (secs <= 10) fillEl.style.backgroundColor = "#f5b942";
      else fillEl.style.backgroundColor = "#22c55e";
    }
    if (textEl) {
      textEl.textContent = `${secs}s`;
      textEl.classList.toggle("urgent", secs <= 5);
    }

    // Alerta sonoro nos últimos 5 segundos (1 vez por segundo)
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
   6. LÓGICA DO TEXAS HOLD'EM (BLINDS, RONDAS, AÇÕES, SHOWDOWN)
   ============================================================================ */
function startNewHand() {
  const s = structuredClone(roomState);
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

  let nextDealer = s.dealerIndex;
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

  s.currentBet = BIG_BLIND;
  s.minRaise = BIG_BLIND;
  s.turnIndex = nextActiveIndex(s, bbPos);
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

function handleAction(playerId, action, raiseTo = 0, isTimeout = false) {
  const s = structuredClone(roomState);
  const idx = s.turnIndex;
  if (idx < 0 || s.players[idx].id !== playerId) return;

  const p = s.players[idx];
  let soundType = "chip";

  if (action === "fold") {
    p.folded = true;
    p.status = isTimeout ? "AUTO-FOLD" : "FOLD";
    soundType = "fold";
  } else if (action === "check-call") {
    const toCall = Math.min(p.chips, s.currentBet - p.bet);
    p.chips -= toCall;
    p.bet += toCall;
    s.pot += toCall;
    p.status = toCall === 0 ? (isTimeout ? "AUTO-CHECK" : "CHECK") : `CALL ${toCall}€`;
    soundType = toCall === 0 ? "check" : "chip";
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
  const roundDone = canStillAct.every(pl => pl.acted && pl.bet === s.currentBet);

  if (roundDone || canStillAct.length <= 1) {
    advancePhase(s);
  } else {
    s.turnIndex = nextActiveIndex(s, idx);
    s.turnDeadline = Date.now() + TURN_DURATION_MS;
    s.message = `Vez de ${s.players[s.turnIndex].name}.`;
    setSoundEvent(s, soundType);
    syncState(s);
  }
}

function advancePhase(s) {
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

  s.turnIndex = nextActiveIndex(s, s.dealerIndex);
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
  s.message = `🏆 ${names} venceu ${s.pot}€ (${winners[0].status})!`;

  const stillAlive = s.players.filter(pl => pl.chips > 0).length >= 2;
  s.nextHandDeadline = stillAlive ? Date.now() + NEXT_HAND_DELAY_MS : 0;
  setSoundEvent(s, "win");
  syncState(s);
}

/* ============================================================================
   7. BOTS PARA MODO TESTE OFFLINE
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
   8. RENDERIZAÇÃO DA INTERFACE E DISPARO DE SONS
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

  // Tocar som sincronizado da última ação
  if (roomState.lastEvent && roomState.lastEvent.ts !== lastPlayedEventTs) {
    lastPlayedEventTs = roomState.lastEvent.ts;
    SoundEngine.playEvent(roomState.lastEvent.type);
  }

  const players = roomState.players || [];
  const community = roomState.community || [];

  $("display-room-code").textContent = currentRoomCode || "DEMO";
  $("display-phase").textContent = roomState.phase === "WAITING" ? "A AGUARDAR" : roomState.phase;
  $("pot-amount").textContent = roomState.pot;
  $("pot-chips").innerHTML = renderPotChipsHTML(roomState.pot);
  $("table-message").textContent = roomState.message;

  const isHost = roomState.hostId === myId;
  const hasEnoughPlayers = players.length >= 2;
  const canStart = isHost && hasEnoughPlayers && (roomState.phase === "WAITING" || roomState.phase === "SHOWDOWN");
  $("btn-start-game").classList.toggle("hidden", !canStart);
  $("btn-start-game").textContent = roomState.phase === "SHOWDOWN" ? "Saltar Espera" : "Começar Já";

  $("community-cards").innerHTML = community.map(c => renderCardHTML(c)).join("");

  const myIndex = players.findIndex(p => p.id === myId);
  const offset = myIndex >= 0 ? myIndex : 0;

  for (let seatVisual = 0; seatVisual < MAX_PLAYERS; seatVisual++) {
    const el = document.querySelector(`.seat-${seatVisual}`);
    const pIdx = (seatVisual + offset) % MAX_PLAYERS;
    const p = players[pIdx];

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
      ${roomState.dealerIndex === pIdx && roomState.phase !== "WAITING" ? `<div class="dealer-chip" title="Botão Dealer">D</div>` : ""}
      <div class="seat-box">
        <div class="seat-header">
          <div class="seat-name">${p.name}${isMe ? " (Tu)" : ""}</div>
          ${isTurn ? `<span class="turn-timer-text" id="active-timer-text">20s</span>` : ""}
        </div>
        <div class="seat-chips">${p.chips} €</div>
        <div class="seat-status">${p.status || ""}</div>
        ${isTurn ? `<div class="turn-timer-track"><div class="turn-timer-fill" id="active-timer-fill"></div></div>` : ""}
      </div>
      ${p.bet > 0 ? `<div class="bet-pill">${p.bet} €</div>` : ""}
    `;
  }

  const me = players[myIndex];
  if (me && me.hand && me.hand.length === 2) {
    const allCards = [...me.hand, ...community];
    const evalText = allCards.length >= 5 ? evaluateBestHand(allCards).name : "Pré-Flop";
    $("hand-strength-badge").textContent = `A tua mão: ${evalText}`;
  } else {
    $("hand-strength-badge").textContent = "A tua mão: —";
  }

  const isMyTurn = Boolean(me && roomState.turnIndex === myIndex && !me.folded && !me.allIn);
  if (isMyTurn && !wasMyTurn) {
    setTimeout(() => SoundEngine.myTurn(), 180);
  }
  wasMyTurn = isMyTurn;

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

  tickTimers();
}

/* ============================================================================
   9. EVENTOS DE LOBBY E CONTROLOS
   ============================================================================ */
function openGameScreen() {
  $("lobby-screen").classList.remove("active");
  $("game-screen").classList.add("active");
  startTimerLoop();
}

function showError(msg) {
  $("lobby-error").textContent = msg;
}

$("btn-mute").addEventListener("click", () => {
  const muted = SoundEngine.toggleMute();
  const btn = $("btn-mute");
  btn.textContent = muted ? "🔇" : "🔊";
  btn.classList.toggle("muted", muted);
});

$("btn-create-room").addEventListener("click", async () => {
  SoundEngine.init();
  if (!isFirebaseConfigured) {
    showError("Configura primeiro as tuas chaves do Firebase no topo de game.js (ou usa o modo teste).");
    return;
  }
  myName = $("player-name").value.trim() || "Jogador";
  localMode = false;
  currentRoomCode = generateRoomCode();
  const initial = createInitialRoom(myId, myName);

  // Senta imediatamente o criador na mesa enquanto grava no Firebase
  roomState = initial;
  openGameScreen();
  renderGame();

  await set(ref(db, `rooms/${currentRoomCode}`), initial);
  subscribeToRoom(currentRoomCode);
});

$("btn-join-room").addEventListener("click", async () => {
  SoundEngine.init();
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
  const players = data.players || [];
  if (players.length >= MAX_PLAYERS) return showError("A mesa já está cheia (6/6).");

  localMode = false;
  currentRoomCode = code;
  players.push({
    id: myId, name: myName, chips: STARTING_CHIPS, bet: 0,
    hand: [], folded: data.phase !== "WAITING", allIn: false, acted: false, isBot: false,
    status: data.phase === "WAITING" ? "PRONTO" : "A AGUARDAR MÃO"
  });

  await update(ref(db, `rooms/${code}`), { players });
  subscribeToRoom(code);
  openGameScreen();
});

function subscribeToRoom(code) {
  if (unsubscribeRoom) unsubscribeRoom();
  unsubscribeRoom = onValue(ref(db, `rooms/${code}`), (snap) => {
    if (snap.exists()) {
      roomState = snap.val();

      // Se o Host detetar o 2.º jogador na fase WAITING, arranca contagem de 10 segundos
      const players = roomState.players || [];
      if (
        roomState.hostId === myId &&
        roomState.phase === "WAITING" &&
        players.length >= 2 &&
        (!roomState.nextHandDeadline || roomState.nextHandDeadline === 0)
      ) {
        const deadline = Date.now() + AUTO_START_DELAY_MS;
        update(ref(db, `rooms/${code}`), {
          nextHandDeadline: deadline,
          message: `Jogadores na mesa (${players.length}/${MAX_PLAYERS}) — O jogo começa em 10s!`
        });
      }

      renderGame();
    }
  });
}

$("btn-demo-mode").addEventListener("click", () => {
  SoundEngine.init();
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
  stopTimerLoop();
  if (unsubscribeRoom) unsubscribeRoom();
  roomState = null;
  wasMyTurn = false;
  $("game-screen").classList.remove("active");
  $("lobby-screen").classList.add("active");
});

/* ============================================================================
   10. INSTALAÇÃO PWA (ANDROID + IPHONE)
   ============================================================================ */
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}

let deferredInstallPrompt = null;
const installBtn = $("btn-install-app");
const iosModal = $("ios-install-modal");

const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
const isStandalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;

if (isIOS && !isStandalone && installBtn) {
  installBtn.classList.remove("hidden");
}

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  if (installBtn && !isStandalone) {
    installBtn.classList.remove("hidden");
  }
});

window.addEventListener("appinstalled", () => {
  deferredInstallPrompt = null;
  if (installBtn) installBtn.classList.add("hidden");
});

if (installBtn) {
  installBtn.addEventListener("click", async () => {
    if (deferredInstallPrompt) {
      deferredInstallPrompt.prompt();
      const { outcome } = await deferredInstallPrompt.userChoice;
      if (outcome === "accepted") installBtn.classList.add("hidden");
      deferredInstallPrompt = null;
    } else if (isIOS && iosModal) {
      iosModal.classList.remove("hidden");
    }
  });
}

const closeIosBtn = $("btn-close-ios-modal");
if (closeIosBtn && iosModal) {
  closeIosBtn.addEventListener("click", () => iosModal.classList.add("hidden"));
  iosModal.addEventListener("click", (e) => {
    if (e.target === iosModal) iosModal.classList.add("hidden");
  });
}
