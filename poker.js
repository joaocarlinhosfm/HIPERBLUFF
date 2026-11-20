/* ============================================================================
   MOTOR DE REGRAS TEXAS HOLD'EM (BARALHO CSPRNG, AVALIADOR, SIDE POTS, RONDAS)
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

export const MAX_PLAYERS = 6;
export const STARTING_CHIPS = 1000;
export const SMALL_BLIND = 10;
export const BIG_BLIND = 20;

export const TURN_DURATION_MS = 20000;
export const NEXT_HAND_DELAY_MS = 6000;
export const AUTO_START_DELAY_MS = 10000;
export const RUNOUT_STEP_MS = 1300;

export const LED_THEMES = [
  { name: "Gelo",       core: "#38bdf8", bright: "#bae6fd", soft: "rgba(56, 189, 248, 0.45)" },
  { name: "Ouro Vegas", core: "#f59e0b", bright: "#fef08a", soft: "rgba(245, 158, 11, 0.46)" },
  { name: "Roxo Neon",  core: "#a855f7", bright: "#e9d5ff", soft: "rgba(168, 85, 247, 0.48)" },
  { name: "Rubi",       core: "#f43f5e", bright: "#fecdd3", soft: "rgba(244, 63, 94, 0.46)" },
  { name: "Esmeralda",  core: "#10b981", bright: "#a7f3d0", soft: "rgba(16, 185, 129, 0.46)" },
  { name: "Magenta",    core: "#ec4899", bright: "#fbcfe8", soft: "rgba(236, 72, 153, 0.46)" },
  { name: "Âmbar",      core: "#f97316", bright: "#fed7aa", soft: "rgba(249, 115, 22, 0.46)" }
];

export const PERMANENT_ROOMS = [
  {
    id: "MESA_1",
    name: "Mesa Gelo",
    tier: "MESA 1 • INICIANTE",
    buyIn: 5000,
    minEntry: 100,
    smallBlind: 50,
    bigBlind: 100,
    ledIndex: 0
  },
  {
    id: "MESA_2",
    name: "Mesa Ouro",
    tier: "MESA 2 • INTERMÉDIO",
    buyIn: 10000,
    minEntry: 10000,
    smallBlind: 100,
    bigBlind: 200,
    ledIndex: 1
  },
  {
    id: "MESA_3",
    name: "Mesa VIP",
    tier: "MESA 3 • HIGH ROLLER",
    buyIn: 50000,
    minEntry: 50000,
    smallBlind: 500,
    bigBlind: 1000,
    ledIndex: 2
  }
];

export function getPermanentRoomConfig(roomId) {
  return PERMANENT_ROOMS.find(r => r.id === roomId) || null;
}

export function createPermanentRoomState(config) {
  return {
    roomId: config.id,
    roomName: config.name,
    permanent: true,
    buyIn: config.buyIn,
    smallBlind: config.smallBlind,
    bigBlind: config.bigBlind,
    hostId: "",
    tableLedIndex: config.ledIndex,
    handId: 0,
    phase: "WAITING",
    pot: 0,
    deadPot: 0,
    currentBet: 0,
    minRaise: config.bigBlind,
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
    message: "Mesa livre — A aguardar jogadores...",
    players: []
  };
}

export function cardKey(card) {
  return card ? `${card.rank}_${card.suit}` : "";
}

export function secureRandomInt(max) {
  const buf = new Uint32Array(1);
  const limit = Math.floor(0x100000000 / max) * max;
  let rand;
  do {
    window.crypto.getRandomValues(buf);
    rand = buf[0];
  } while (rand >= limit);
  return rand % max;
}

function createDeck() {
  const deck = [];
  for (const s of SUITS) {
    for (const r of RANKS) deck.push({ rank: r.v, label: r.l, suit: s });
  }
  return deck;
}

function shuffleDeck(deck) {
  const arr = [...deck];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = secureRandomInt(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function setSoundEvent(state, type) {
  state.lastEvent = { type, ts: Date.now() + Math.random() };
}

function scoreFiveCards(cards) {
  const values = cards.map(c => c.rank).sort((a, b) => b - a);
  const isFlush = cards.every(c => c.suit === cards[0].suit);

  const unique = [...new Set(values)];
  let straightHigh = 0;
  if (unique.length === 5) {
    if (unique[0] - unique[4] === 4) straightHigh = unique[0];
    else if (unique[0] === 14 && unique[1] === 5 && unique[4] === 2) straightHigh = 5;
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

export function evaluateBestHand(cards) {
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
            if (res.score > best.score) best = { score: res.score, name: res.name, bestCards: combo };
          }
  return best;
}

export function buildSidePots(players, deadPot = 0) {
  const contributors = (players || []).filter(p => p.totalBet > 0);
  const pots = [];

  if (contributors.length > 0) {
    const levels = [...new Set(contributors.map(p => p.totalBet))].sort((a, b) => a - b);
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

        if (sameEligible) lastPot.amount += amount;
        else pots.push({ amount, eligibleIds });
      }
      prevLevel = level;
    }
  }

  const safeDead = Math.max(0, Number(deadPot) || 0);
  if (safeDead > 0) {
    if (pots.length > 0) {
      pots[0].amount += safeDead;
    } else {
      const activeIds = (players || []).filter(p => !p.folded).map(p => p.id);
      if (activeIds.length > 0) pots.push({ amount: safeDead, eligibleIds: activeIds });
    }
  }

  return pots;
}

export function normalizeRoomState(raw) {
  if (!raw) return null;
  const playersArr = Array.isArray(raw.players)
    ? raw.players
    : Object.values(raw.players || {});

  const permCfg = getPermanentRoomConfig(raw.roomId);
  const buyIn = Number(raw.buyIn) || permCfg?.buyIn || STARTING_CHIPS;
  const smallBlind = Number(raw.smallBlind) || permCfg?.smallBlind || SMALL_BLIND;
  const bigBlind = Number(raw.bigBlind) || permCfg?.bigBlind || BIG_BLIND;

  return {
    roomId: raw.roomId || permCfg?.id || "",
    roomName: raw.roomName || permCfg?.name || "",
    permanent: Boolean(raw.permanent || permCfg),
    buyIn,
    smallBlind,
    bigBlind,
    hostId: raw.hostId || "",
    tableLedIndex: raw.tableLedIndex !== undefined ? Number(raw.tableLedIndex) : (permCfg?.ledIndex ?? 0),
    handId: Number(raw.handId) || 0,
    phase: raw.phase || "WAITING",
    pot: Number(raw.pot) || 0,
    deadPot: Number(raw.deadPot) || 0,
    currentBet: Number(raw.currentBet) || 0,
    minRaise: Number(raw.minRaise) || bigBlind,
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

export function createInitialRoom(hostId, hostName, initialChips = STARTING_CHIPS, ledIndex = 0, stakes = {}) {
  const buyIn = Number(stakes.buyIn) || STARTING_CHIPS;
  const smallBlind = Number(stakes.smallBlind) || SMALL_BLIND;
  const bigBlind = Number(stakes.bigBlind) || BIG_BLIND;
  return {
    roomId: stakes.roomId || "OFFLINE",
    roomName: stakes.roomName || "Mesa vs Bots",
    permanent: Boolean(stakes.permanent),
    buyIn,
    smallBlind,
    bigBlind,
    hostId,
    tableLedIndex: ledIndex,
    handId: 0,
    phase: "WAITING",
    pot: 0,
    deadPot: 0,
    currentBet: 0,
    minRaise: bigBlind,
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
    message: "A preparar mesa...",
    players: [
      {
        id: hostId, name: hostName, chips: initialChips, handStartChips: initialChips,
        bet: 0, totalBet: 0, hand: [], folded: false, allIn: false, acted: false,
        participated: false, isBot: false, status: "PRONTO"
      }
    ]
  };
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
  if (total === 0) return -1;
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

export function buildNewHandState(roomState) {
  const s = normalizeRoomState(structuredClone(roomState));
  const sb = Number(s.smallBlind) || SMALL_BLIND;
  const bb = Number(s.bigBlind) || BIG_BLIND;

  const eligible = s.players.filter(p => p.chips > 0);
  if (eligible.length < 2) {
    s.message = "Fim do torneio! Faz Rebuy ou aguarda outro jogador.";
    s.nextHandDeadline = 0;
    s.turnDeadline = 0;
    s.isRunout = false;
    s.runoutDeadline = 0;
    return s;
  }

  s.deck = shuffleDeck(createDeck());
  s.community = [];
  s.pot = 0;
  s.deadPot = 0;
  s.phase = "PREFLOP";
  s.handId = (Number(s.handId) || 0) + 1;
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
    p.handStartChips = p.chips;
    p.participated = p.chips > 0;
    p.bet = 0;
    p.totalBet = 0;
    p.folded = p.chips <= 0;
    p.allIn = false;
    p.acted = false;
    p.status = p.chips <= 0 ? "ELIMINADO" : "";
    p.hand = p.folded ? [] : [s.deck.pop(), s.deck.pop()];
  });

  const activeIndices = s.players.map((p, i) => (!p.folded ? i : -1)).filter(i => i !== -1);
  const sbPos = activeIndices.length === 2 ? s.dealerIndex : nextActiveIndex(s, s.dealerIndex);
  const bbPos = nextActiveIndex(s, sbPos);

  postBlind(s, sbPos, sb, "SB");
  postBlind(s, bbPos, bb, "BB");

  s.currentBet = Math.max(s.players[sbPos].bet, s.players[bbPos].bet);
  s.minRaise = bb;

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
    s.runoutDeadline = Date.now() + RUNOUT_STEP_MS;
    s.message = "ALL-IN nas Blinds! A revelar cartas...";
    setSoundEvent(s, "shuffle");
    return s;
  }

  s.turnIndex = firstToAct;
  s.turnDeadline = Date.now() + TURN_DURATION_MS;
  s.message = `Cartas dadas! Vez de ${s.players[s.turnIndex].name}.`;
  setSoundEvent(s, "shuffle");
  return s;
}

function resolveShowdownOnState(s) {
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

  let pots = buildSidePots(s.players, s.deadPot);
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
    const amtText = pot.amount.toLocaleString("pt-PT");
    if (potIndex === 0) {
      mainWinningHandName = potWinners[0].status;
      mainWinningCardSet = cardSet;
      potSummaries.push(`${names} +${amtText}€ (${potWinners[0].status})`);
    } else {
      potSummaries.push(`Side Pot: ${names} +${amtText}€`);
    }
  });

  s.winnerIds = [...allWinnerIds];
  s.winningHandName = mainWinningHandName;
  s.winningCards = [...mainWinningCardSet];
  s.message = `🏆 ${potSummaries.join(" • ")}`;

  const stillAlive = s.players.filter(pl => pl.chips > 0).length >= 2;
  s.nextHandDeadline = stillAlive ? Date.now() + NEXT_HAND_DELAY_MS : 0;
  setSoundEvent(s, "win");
  return s;
}

export function advancePhaseOnState(rawState) {
  const s = normalizeRoomState(structuredClone(rawState));
  const bb = Number(s.bigBlind) || BIG_BLIND;

  s.players.forEach(p => {
    p.bet = 0;
    p.acted = false;
    if (!p.folded && !p.allIn) p.status = "";
  });
  s.currentBet = 0;
  s.minRaise = bb;

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
    return resolveShowdownOnState(s);
  }

  const canAct = s.players.filter(p => !p.folded && !p.allIn);
  const nextIdx = canAct.length < 2 ? -1 : nextActiveIndex(s, s.dealerIndex);

  if (nextIdx === -1) {
    s.isRunout = true;
    s.turnIndex = -1;
    s.turnDeadline = 0;
    s.runoutDeadline = Date.now() + RUNOUT_STEP_MS;
    s.message = `ALL-IN! ${s.phase} na mesa...`;
    setSoundEvent(s, "card");
    return s;
  }

  s.isRunout = false;
  s.runoutDeadline = 0;
  s.turnIndex = nextIdx;
  s.turnDeadline = Date.now() + TURN_DURATION_MS;
  s.message = `${s.phase} na mesa — Vez de ${s.players[s.turnIndex].name}.`;
  setSoundEvent(s, "card");
  return s;
}

export function applyActionToState(roomState, playerId, action, raiseTo = 0, isTimeout = false) {
  if (!roomState || roomState.isRunout) return null;
  const s = normalizeRoomState(structuredClone(roomState));
  const bb = Number(s.bigBlind) || BIG_BLIND;
  const idx = s.turnIndex;
  if (idx < 0 || !s.players[idx] || s.players[idx].id !== playerId) return null;

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
      p.status = toCall === 0 ? (isTimeout ? "AUTO-CHECK" : "CHECK") : `CALL ${toCall.toLocaleString("pt-PT")}€`;
      soundType = toCall === 0 ? "check" : "chip";
    }
  } else if (action === "raise") {
    const target = Math.max(Number(raiseTo) || 0, s.currentBet + s.minRaise);
    const needed = Math.max(0, Math.min(p.chips, target - p.bet));
    const newBet = p.bet + needed;
    if (newBet > s.currentBet) {
      s.minRaise = Math.max(bb, newBet - s.currentBet);
      s.currentBet = newBet;
      s.players.forEach(other => { if (other.id !== p.id) other.acted = false; });
    }
    p.chips -= needed;
    p.bet = newBet;
    p.totalBet += needed;
    s.pot += needed;
    p.status = p.chips === 0 ? "ALL-IN" : `RAISE ${newBet.toLocaleString("pt-PT")}€`;
    soundType = p.chips === 0 ? "allin" : "chip";
    if (p.chips === 0) p.allIn = true;
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
      s.minRaise = Math.max(bb, p.bet - s.currentBet);
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
    s.message = `${remaining[0].name} recolhe ${s.pot.toLocaleString("pt-PT")}€!`;
    s.phase = "SHOWDOWN";
    s.turnIndex = -1;
    s.turnDeadline = 0;
    s.isRunout = false;
    s.runoutDeadline = 0;
    const stillAlive = s.players.filter(pl => pl.chips > 0).length >= 2;
    s.nextHandDeadline = stillAlive ? Date.now() + NEXT_HAND_DELAY_MS : 0;
    setSoundEvent(s, "win");
    return s;
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
      s.players.forEach(pl => { pl.bet = 0; pl.acted = false; });
      s.currentBet = 0;
      s.minRaise = bb;
      s.turnIndex = -1;
      s.turnDeadline = 0;
      s.isRunout = true;
      s.runoutDeadline = Date.now() + RUNOUT_STEP_MS;
      s.message = "ALL-IN! A revelar cartas...";
      setSoundEvent(s, soundType);
      return s;
    }

    return advancePhaseOnState(s);
  }

  const nextIdx = nextActiveIndex(s, idx);
  if (nextIdx === -1) {
    refundUncalledBet(s);
    return advancePhaseOnState(s);
  }

  s.turnIndex = nextIdx;
  s.turnDeadline = Date.now() + TURN_DURATION_MS;
  s.message = `Vez de ${s.players[s.turnIndex].name}.`;
  setSoundEvent(s, soundType);
  return s;
}

export function removePlayerFromState(roomState, playerId, reason = "saiu da mesa", preferredHostId = "") {
  if (!roomState) return null;
  const s = normalizeRoomState(structuredClone(roomState));
  const bb = Number(s.bigBlind) || BIG_BLIND;
  const idx = s.players.findIndex(p => p.id === playerId);
  if (idx === -1) return null;

  const leaving = s.players[idx];
  const isActiveHand = s.phase !== "WAITING" && s.phase !== "SHOWDOWN";
  const wasTheirTurn = isActiveHand && !s.isRunout && s.turnIndex === idx;

  if (isActiveHand && leaving.totalBet > 0) {
    s.deadPot = (Number(s.deadPot) || 0) + leaving.totalBet;
  }

  s.players.splice(idx, 1);

  if (s.players.length === 0) {
    s.hostId = "";
    s.phase = "WAITING";
    s.pot = 0;
    s.deadPot = 0;
    s.currentBet = 0;
    s.minRaise = bb;
    s.dealerIndex = 0;
    s.turnIndex = -1;
    s.turnDeadline = 0;
    s.nextHandDeadline = 0;
    s.isRunout = false;
    s.runoutDeadline = 0;
    s.winnerIds = [];
    s.winningHandName = "";
    s.winningCards = [];
    s.deck = [];
    s.community = [];
    s.message = "Mesa livre — A aguardar jogadores...";
    return s;
  }

  if (s.hostId === playerId || !s.players.some(p => p.id === s.hostId)) {
    const chosenHost = preferredHostId && s.players.some(p => p.id === preferredHostId)
      ? preferredHostId
      : s.players[0].id;
    s.hostId = chosenHost;
  }

  if (idx < s.dealerIndex) {
    s.dealerIndex -= 1;
  } else if (idx === s.dealerIndex) {
    s.dealerIndex = (idx - 1 + s.players.length) % s.players.length;
  } else if (s.dealerIndex >= s.players.length) {
    s.dealerIndex = s.players.length - 1;
  }

  if (s.turnIndex >= 0 && idx < s.turnIndex) {
    s.turnIndex -= 1;
  }

  if (s.phase === "WAITING") {
    if (s.players.length < 2) {
      s.pot = 0;
      s.deadPot = 0;
      s.nextHandDeadline = 0;
      s.message = `${leaving.name} ${reason}. A aguardar jogadores...`;
    } else {
      s.message = `${leaving.name} ${reason}.`;
    }
    return s;
  }

  if (s.phase === "SHOWDOWN") {
    const funded = s.players.filter(p => p.chips > 0).length;
    if (funded < 2) {
      s.nextHandDeadline = 0;
      s.message = `${leaving.name} ${reason}. A aguardar mais jogadores...`;
    } else {
      s.message = `${leaving.name} ${reason}.`;
    }
    return s;
  }

  const remaining = s.players.filter(pl => !pl.folded);
  if (remaining.length === 0) {
    s.phase = "WAITING";
    s.pot = 0;
    s.deadPot = 0;
    s.turnIndex = -1;
    s.turnDeadline = 0;
    s.nextHandDeadline = 0;
    s.isRunout = false;
    s.runoutDeadline = 0;
    s.message = `${leaving.name} ${reason}. A aguardar jogadores...`;
    return s;
  }

  if (remaining.length === 1) {
    remaining[0].chips += s.pot;
    s.winnerIds = [remaining[0].id];
    s.winningHandName = `${remaining[0].name} VENCEU`;
    s.winningCards = [];
    s.message = `${leaving.name} ${reason}. ${remaining[0].name} recolhe ${s.pot.toLocaleString("pt-PT")}€!`;
    s.phase = "SHOWDOWN";
    s.turnIndex = -1;
    s.turnDeadline = 0;
    s.isRunout = false;
    s.runoutDeadline = 0;
    const stillAlive = s.players.filter(pl => pl.chips > 0).length >= 2;
    s.nextHandDeadline = stillAlive ? Date.now() + NEXT_HAND_DELAY_MS : 0;
    setSoundEvent(s, "win");
    return s;
  }

  if (s.isRunout) {
    s.message = `${leaving.name} ${reason}. A revelar cartas...`;
    return s;
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
      s.players.forEach(pl => { pl.bet = 0; pl.acted = false; });
      s.currentBet = 0;
      s.minRaise = bb;
      s.turnIndex = -1;
      s.turnDeadline = 0;
      s.isRunout = true;
      s.runoutDeadline = Date.now() + RUNOUT_STEP_MS;
      s.message = `${leaving.name} ${reason}. ALL-IN! A revelar cartas...`;
      setSoundEvent(s, "fold");
      return s;
    }
    return advancePhaseOnState(s);
  }

  if (wasTheirTurn) {
    const prevPos = (idx - 1 + s.players.length) % s.players.length;
    const nextIdx = nextActiveIndex(s, prevPos);
    if (nextIdx === -1) {
      refundUncalledBet(s);
      return advancePhaseOnState(s);
    }
    s.turnIndex = nextIdx;
    s.turnDeadline = Date.now() + TURN_DURATION_MS;
    s.message = `${leaving.name} ${reason}. Vez de ${s.players[s.turnIndex].name}.`;
    setSoundEvent(s, "fold");
  } else {
    s.message = `${leaving.name} ${reason}.`;
    setSoundEvent(s, "fold");
  }

  return s;
}

/* === FIM DO FICHEIRO poker.js === */
