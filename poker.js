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

export function cardKey(card) {
  return card ? `${card.rank}_${card.suit}` : ""; }  export function secureRandomInt(max) { const buf = new Uint32Array(1); const limit = Math.floor(0x100000000 / max) * max; let rand; do { window.crypto.getRandomValues(buf); rand = buf[0]; } while (rand >= limit); return rand \% max; }  export function generateRoomCode() { const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; let code = ""; for (let i = 0; i < 5; i++) code += chars[secureRandomInt(chars.length)]; return code; }  function createDeck() { const deck = []; for (const s of SUITS) { for (const r of RANKS) deck.push({ rank: r.v, label: r.l, suit: s }); } return deck; }  function shuffleDeck(deck) { const arr = [...deck]; for (let i = arr.length - 1; i > 0; i--) { const j = secureRandomInt(i + 1); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; }  export function setSoundEvent(state, type) { state.lastEvent = { type, ts: Date.now() + Math.random() }; }  function scoreFiveCards(cards) { const values = cards.map(c => c.rank).sort((a, b) => b - a); const isFlush = cards.every(c => c.suit === cards[0].suit);  const unique = [...new Set(values)]; let straightHigh = 0; if (unique.length === 5) { if (unique[0] - unique[4] === 4) straightHigh = unique[0]; else if (unique[0] === 14 && unique[1] === 5 && unique[4] === 2) straightHigh = 5; }  const counts = {}; for (const v of values) counts[v] = (counts[v] \vert{}\vert{} 0) + 1; const groups = Object.entries(counts) .map(([v, c]) => ({ v: Number(v), c })) .sort((a, b) => b.c - a.c \vert{}\vert{} b.v - a.v);  let cat = 0; let tiebreakers = values;  if (isFlush && straightHigh) { cat = straightHigh === 14 ? 9 : 8; tiebreakers = [straightHigh]; } else if (groups[0].c === 4) { cat = 7; tiebreakers = [groups[0].v, groups[1].v]; } else if (groups[0].c === 3 && groups[1].c === 2) { cat = 6; tiebreakers = [groups[0].v, groups[1].v]; } else if (isFlush) { cat = 5; } else if (straightHigh) { cat = 4; tiebreakers = [straightHigh]; } else if (groups[0].c === 3) { cat = 3; tiebreakers = [groups[0].v, groups[1].v, groups[2].v]; } else if (groups[0].c === 2 && groups[1].c === 2) { cat = 2; tiebreakers = [groups[0].v, groups[1].v, groups[2].v]; } else if (groups[0].c === 2) { cat = 1; tiebreakers = [groups[0].v, groups[1].v, groups[2].v, groups[3].v]; }  let score = cat * Math.pow(15, 5); for (let i = 0; i < tiebreakers.length; i++) { score += tiebreakers[i] * Math.pow(15, 4 - i); } return { score, name: HAND_NAMES[cat], cards }; }  export function evaluateBestHand(cards) { if (!cards \vert{}\vert{} cards.length < 5) return { score: 0, name: "—", bestCards: [] }; let best = { score: -1, name: "Carta Alta", bestCards: [] }; const n = cards.length; for (let a = 0; a < n - 4; a++) for (let b = a + 1; b < n - 3; b++) for (let c = b + 1; c < n - 2; c++) for (let d = c + 1; d < n - 1; d++) for (let e = d + 1; e < n; e++) { const combo = [cards[a], cards[b], cards[c], cards[d], cards[e]]; const res = scoreFiveCards(combo); if (res.score > best.score) best = { score: res.score, name: res.name, bestCards: combo }; } return best; }  export function buildSidePots(players) { const contributors = (players \vert{}\vert{} []).filter(p => p.totalBet > 0); if (contributors.length === 0) return [];  const levels = [...new Set(contributors.map(p => p.totalBet))].sort((a, b) => a - b); const pots = []; let prevLevel = 0;  for (const level of levels) { const slice = level - prevLevel; if (slice <= 0) continue;  let amount = 0; const eligibleIds = []; for (const p of contributors) { if (p.totalBet >= level) { amount += slice; if (!p.folded) eligibleIds.push(p.id); } }  if (amount > 0) { const lastPot = pots[pots.length - 1]; const sameEligible = lastPot && lastPot.eligibleIds.length === eligibleIds.length && lastPot.eligibleIds.every((id, idx) => id === eligibleIds[idx]);  if (sameEligible) lastPot.amount += amount; else pots.push({ amount, eligibleIds }); } prevLevel = level; }  return pots; }  export function normalizeRoomState(raw) { if (!raw) return null; const playersArr = Array.isArray(raw.players) ? raw.players : Object.values(raw.players \vert{}\vert{} {});  return { hostId: raw.hostId \vert{}\vert{} "", tableLedIndex: raw.tableLedIndex !== undefined ? Number(raw.tableLedIndex) : 0, handId: Number(raw.handId) \vert{}\vert{} 0, phase: raw.phase \vert{}\vert{} "WAITING", pot: Number(raw.pot) \vert{}\vert{} 0, currentBet: Number(raw.currentBet) \vert{}\vert{} 0, minRaise: Number(raw.minRaise) \vert{}\vert{} BIG_BLIND, dealerIndex: Number(raw.dealerIndex) \vert{}\vert{} 0, turnIndex: raw.turnIndex !== undefined ? Number(raw.turnIndex) : -1, turnDeadline: Number(raw.turnDeadline) \vert{}\vert{} 0, nextHandDeadline: Number(raw.nextHandDeadline) \vert{}\vert{} 0, isRunout: Boolean(raw.isRunout), runoutDeadline: Number(raw.runoutDeadline) \vert{}\vert{} 0, lastEvent: raw.lastEvent \vert{}\vert{} null, winnerIds: Array.isArray(raw.winnerIds) ? raw.winnerIds : Object.values(raw.winnerIds \vert{}\vert{} {}), winningHandName: raw.winningHandName \vert{}\vert{} "", winningCards: Array.isArray(raw.winningCards) ? raw.winningCards : Object.values(raw.winningCards \vert{}\vert{} {}), deck: Array.isArray(raw.deck) ? raw.deck : Object.values(raw.deck \vert{}\vert{} {}), community: Array.isArray(raw.community) ? raw.community : Object.values(raw.community \vert{}\vert{} {}), message: raw.message \vert{}\vert{} "", players: playersArr.filter(Boolean).map(p => ({ id: p.id, name: p.name \vert{}\vert{} "Jogador", chips: Number(p.chips) \vert{}\vert{} 0, handStartChips: p.handStartChips !== undefined ? Number(p.handStartChips) : (Number(p.chips) \vert{}\vert{} 0), bet: Number(p.bet) \vert{}\vert{} 0, totalBet: Number(p.totalBet) \vert{}\vert{} 0, hand: Array.isArray(p.hand) ? p.hand : Object.values(p.hand \vert{}\vert{} {}), folded: Boolean(p.folded), allIn: Boolean(p.allIn), acted: Boolean(p.acted), participated: Boolean(p.participated), isBot: Boolean(p.isBot), status: p.status \vert{}\vert{} "" })) }; }  export function createInitialRoom(hostId, hostName, initialChips = STARTING_CHIPS, ledIndex = 0) { return { hostId, tableLedIndex: ledIndex, handId: 0, phase: "WAITING", pot: 0, currentBet: 0, minRaise: BIG_BLIND, dealerIndex: 0, turnIndex: -1, turnDeadline: 0, nextHandDeadline: 0, isRunout: false, runoutDeadline: 0, lastEvent: null, winnerIds: [], winningHandName: "", winningCards: [], deck: [], community: [], message: "A aguardar jogadores... Partilha o código da sala!", players: [ { id: hostId, name: hostName, chips: initialChips, handStartChips: initialChips, bet: 0, totalBet: 0, hand: [], folded: false, allIn: false, acted: false, participated: false, isBot: false, status: "PRONTO" } ] }; }  function postBlind(s, idx, amount, label) { const p = s.players[idx]; const paid = Math.min(p.chips, amount); p.chips -= paid; p.bet += paid; p.totalBet += paid; s.pot += paid; p.status = paid < amount ? `${label} ALL-IN` : label;
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

export function buildNewHandState(roomState) {
  const s = normalizeRoomState(structuredClone(roomState));
  const eligible = s.players.filter(p => p.chips > 0);
  if (eligible.length < 2) {
    s.message = "Fim do torneio! Faz Rebuy ou inicia Nova Partida.";
    s.nextHandDeadline = 0;
    s.turnDeadline = 0;
    s.isRunout = false;
    s.runoutDeadline = 0;
    return s;
  }

  s.deck = shuffleDeck(createDeck());
  s.community = [];
  s.pot = 0;
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
      potSummaries.push(`${names} +${pot.amount}€
