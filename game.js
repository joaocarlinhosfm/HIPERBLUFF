import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getDatabase, ref, set, get, onValue, update, remove,
  runTransaction, onDisconnect, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { SoundEngine } from "./audio.js";
import {
  MAX_PLAYERS, STARTING_CHIPS, BIG_BLIND, TURN_DURATION_MS, AUTO_START_DELAY_MS, LED_THEMES,
  cardKey, secureRandomInt, generateRoomCode, evaluateBestHand, buildSidePots,
  normalizeRoomState, createInitialRoom, setSoundEvent,
  buildNewHandState, advancePhaseOnState, applyActionToState, removePlayerFromState
} from "./poker.js";
import {
  INITIAL_BALANCE, initUserSystem, restoreSession, registerUser, loginUser,
  logoutUser, getCurrentUser, applyBalanceDelta, recordActionStats, formatEuro
} from "./user.js";

/* ============================================================================
   1. CONFIGURAÇÃO FIREBASE E HELPERS
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
  try { db = getDatabase(initializeApp(firebaseConfig)); } catch (err) { console.error("Erro Firebase:", err); }
}

const $ = (id) => document.getElementById(id);
const on = (id, event, handler) => { const el = $(id); if (el) el.addEventListener(event, handler); };

const PLAYER_ID_KEY = "hiperbluff_player_id";
const ACTIVE_ROOM_KEY = "hiperbluff_active_room";
const SETTLED_HAND_KEY = "hiperbluff_settled_hand";
const HOST_MIGRATE_GRACE_MS = 6000;
const DISCONNECT_REMOVE_GRACE_MS = 15000;

function getOrCreatePlayerId() {
  try {
    let saved = sessionStorage.getItem(PLAYER_ID_KEY);
    if (saved && /^p_[a-z0-9]{6,}$/.test(saved)) return saved;
    saved = "p_" + Math.random().toString(36).slice(2, 10);
    sessionStorage.setItem(PLAYER_ID_KEY, saved);
    return saved;
  } catch (_) {
    return "p_" + Math.random().toString(36).slice(2, 10);
  }
}

function extractRoomCode(rawInput) {
  const text = String(rawInput || "").trim();
  if (!text) return "";
  const match = text.match(/[?&]room=([a-z0-9]+)/i);
  const candidate = match ? match[1] : text;
  return candidate.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5);
}

function getInviteCodeFromURL() {
  try {
    const params = new URLSearchParams(window.location.search);
    return extractRoomCode(params.get("room") || "");
  } catch (_) {
    return "";
  }
}

function clearInviteFromURL() {
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.has("room")) {
      url.searchParams.delete("room");
      window.history.replaceState({}, "", url.pathname + url.search + url.hash);
    }
  } catch (_) {}
}

function buildInviteLink(code) {
  try {
    const url = new URL(window.location.href);
    url.search = "";
    url.hash = "";
    url.searchParams.set("room", code);
    return url.toString();
  } catch (_) {
    return code;
  }
}

function saveActiveRoomSession(code) {
  const user = getCurrentUser();
  try {
    sessionStorage.setItem(ACTIVE_ROOM_KEY, JSON.stringify({
      code,
      playerId: myId,
      userKey: user?.key || ""
    }));
  } catch (_) {}
}

function clearActiveRoomSession() {
  try { sessionStorage.removeItem(ACTIVE_ROOM_KEY); } catch (_) {}
}

function getSavedActiveRoomSession() {
  try { return JSON.parse(sessionStorage.getItem(ACTIVE_ROOM_KEY) || "null"); }
  catch (_) { return null; }
}

function showScreen(screenId) {
  ["auth-screen", "hub-screen", "profile-screen", "game-screen"].forEach(id => {
    $(id)?.classList.toggle("active", id === screenId);
  });
}

function getActiveScreenId() {
  return ["auth-screen", "hub-screen", "profile-screen", "game-screen"].find(id => $(id)?.classList.contains("active")) || "auth-screen";
}

function withTimeout(promise, ms = 10000) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error("Sem resposta do Firebase (timeout).")), ms))
  ]);
}

let lastLedIndex = Number(sessionStorage.getItem("hiperbluff_led") ?? -1);
function pickNextLedIndex() {
  let idx;
  do { idx = secureRandomInt(LED_THEMES.length); } while (idx === lastLedIndex && LED_THEMES.length > 1);
  lastLedIndex = idx;
  try { sessionStorage.setItem("hiperbluff_led", String(idx)); } catch (_) {}
  return idx;
}

function applyTableLedTheme(index) {
  const safeIdx = ((Number(index) || 0) % LED_THEMES.length + LED_THEMES.length) % LED_THEMES.length;
  const t = LED_THEMES[safeIdx];
  const root = document.documentElement;
  root.style.setProperty("--led-core", t.core);
  root.style.setProperty("--led-bright", t.bright);
  root.style.setProperty("--led-glow-soft", t.soft);
  lastLedIndex = safeIdx;
  try { sessionStorage.setItem("hiperbluff_led", String(safeIdx)); } catch (_) {}
}

/* ============================================================================
   2. ESTADO LOCAL, PRESENÇA ONLINE, TIMERS E BOTS
   ============================================================================ */
let localMode = true;
const myId = getOrCreatePlayerId();
let myName = "Jogador";
let currentRoomCode = null;
let roomState = null;
let roomPresence = {};
let unsubscribeRoom = null;
let unsubscribeConnected = null;
let myPresenceRef = null;
let myOnDisconnectHandle = null;

let isSyncingAction = false;
let isLeavingRoom = false;
let wasSeatedInRoom = false;
let isMigratingHost = false;
let isCleaningDisconnected = false;
let pendingInviteCode = getInviteCodeFromURL();
let hasHandledInitialAutoEntry = false;

const offlineSinceMap = new Map();

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

function isPlayerOffline(playerId) {
  if (localMode || !playerId || playerId === myId) return false;
  const entry = roomPresence?.[playerId];
  return Boolean(entry && entry.online === false);
}

function updateOfflineTrackers() {
  if (localMode || !roomState) {
    offlineSinceMap.clear();
    return;
  }
  const now = Date.now();
  const activeIds = new Set(roomState.players.map(p => p.id));

  for (const id of offlineSinceMap.keys()) {
    if (!activeIds.has(id)) offlineSinceMap.delete(id);
  }

  for (const p of roomState.players) {
    if (p.id === myId || p.isBot) {
      offlineSinceMap.delete(p.id);
      continue;
    }
    if (isPlayerOffline(p.id)) {
      if (!offlineSinceMap.has(p.id)) offlineSinceMap.set(p.id, now);
    } else {
      offlineSinceMap.delete(p.id);
    }
  }
}

function pickPreferredOnlineHost(players, presence, excludeId = "") {
  const candidates = (players || []).filter(p => p.id !== excludeId);
  const online = candidates.find(p => presence?.[p.id]?.online === true);
  if (online) return online.id;
  const notOffline = candidates.find(p => presence?.[p.id]?.online !== false);
  return (notOffline || candidates[0])?.id || "";
}

function detachPresence(removeNode = false) {
  if (unsubscribeConnected) { unsubscribeConnected(); unsubscribeConnected = null; }
  if (myOnDisconnectHandle) {
    myOnDisconnectHandle.cancel().catch(() => {});
    myOnDisconnectHandle = null;
  }
  if (removeNode && myPresenceRef) {
    remove(myPresenceRef).catch(() => {});
  }
  myPresenceRef = null;
}

function attachPresence(code) {
  detachPresence(false);
  if (!db || !code) return;
  myPresenceRef = ref(db, `rooms/${code}/presence/${myId}`);
  const connectedRef = ref(db, ".info/connected");

  unsubscribeConnected = onValue(connectedRef, async (snap) => {
    if (snap.val() !== true || !myPresenceRef || currentRoomCode !== code || localMode || isLeavingRoom) return;
    try {
      const disc = onDisconnect(myPresenceRef);
      myOnDisconnectHandle = disc;
      await disc.set({ online: false, at: serverTimestamp() });
      await set(myPresenceRef, { online: true, at: serverTimestamp() });
    } catch (err) {
      console.error("Erro ao configurar presença:", err);
    }
  });
}

async function claimHostViaTransaction(code) {
  if (!db || !code || isMigratingHost || isLeavingRoom) return;
  isMigratingHost = true;
  try {
    await runTransaction(ref(db, `rooms/${code}`), (raw) => {
      if (!raw) return raw;
      const prevPresence = raw.presence || {};
      const state = normalizeRoomState(raw);
      if (!state.players.some(p => p.id === myId)) return undefined;

      const hostStillSeated = state.players.some(p => p.id === state.hostId);
      const hostOnline = hostStillSeated && prevPresence[state.hostId]?.online !== false;
      if (hostOnline) return undefined;

      const nextHost = pickPreferredOnlineHost(state.players, prevPresence, "");
      if (nextHost !== myId) return undefined;

      state.hostId = myId;
      state.presence = prevPresence;
      return state;
    });
  } catch (err) {
    console.error("Erro na migração de hostId:", err);
  } finally {
    isMigratingHost = false;
  }
}

async function removePlayerFromRoomTx(code, targetPlayerId, reason = "saiu da mesa", onlyIfOffline = false) {
  if (!db || !code || !targetPlayerId) return;
  try {
    await runTransaction(ref(db, `rooms/${code}`), (raw) => {
      if (!raw) return raw;
      const prevPresence = { ...(raw.presence || {}) };
      if (onlyIfOffline && prevPresence[targetPlayerId]?.online === true) return undefined;

      const state = normalizeRoomState(raw);
      if (!state.players.some(p => p.id === targetPlayerId)) {
        if (prevPresence[targetPlayerId]) {
          delete prevPresence[targetPlayerId];
          state.presence = Object.keys(prevPresence).length ? prevPresence : null;
          return state;
        }
        return undefined;
      }

      const preferredHost = pickPreferredOnlineHost(state.players, prevPresence, targetPlayerId);
      const next = removePlayerFromState(state, targetPlayerId, reason, preferredHost);
      if (!next) return undefined;

      if (next.players.length === 0) return null;

      delete prevPresence[targetPlayerId];
      next.presence = Object.keys(prevPresence).length ? prevPresence : null;
      return next;
    });
  } catch (err) {
    console.error("Erro ao remover jogador da sala:", err);
  }
}

function checkOnlineStability() {
  if (localMode || !roomState || !currentRoomCode || isLeavingRoom) return;
  const now = Date.now();
  const players = roomState.players || [];
  if (!players.some(p => p.id === myId)) return;

  // 1. Migração automática de hostId se o anfitrião sair ou cair
  if (roomState.hostId !== myId) {
    const hostSeated = players.some(p => p.id === roomState.hostId);
    const hostOfflineSince = offlineSinceMap.get(roomState.hostId);
    const hostTimedOut = !hostSeated || (hostOfflineSince && (now - hostOfflineSince) >= HOST_MIGRATE_GRACE_MS);

    if (hostTimedOut && !isMigratingHost) {
      const candidate = pickPreferredOnlineHost(players, roomPresence, hostSeated ? "" : roomState.hostId);
      if (candidate === myId) {
        claimHostViaTransaction(currentRoomCode);
      }
    }
    return;
  }

  // 2. Limpeza de jogadores desligados pelo anfitrião após período de tolerância
  if (isCleaningDisconnected) return;
  const expiredPlayer = players.find(p => {
    if (p.id === myId || p.isBot) return false;
    const since = offlineSinceMap.get(p.id);
    return since && (now - since) >= DISCONNECT_REMOVE_GRACE_MS;
  });

  if (expiredPlayer) {
    isCleaningDisconnected = true;
    removePlayerFromRoomTx(currentRoomCode, expiredPlayer.id, "desligou-se", true)
      .finally(() => { isCleaningDisconnected = false; });
  }
}

async function syncState(newState) {
  const clean = normalizeRoomState(newState);
  roomState = clean;
  if (localMode) {
    renderGame();
    maybeTriggerBotTurn();
  } else if (db && currentRoomCode) {
    isSyncingAction = true;
    try { await update(ref(db, `rooms/${currentRoomCode}`), clean); }
    catch (err) { console.error("Erro ao sincronizar:", err); }
    finally { isSyncingAction = false; }
  }
}

function startNewHand() {
  if (!roomState) return;
  syncState(buildNewHandState(roomState));
}

function trackMyActionStat(action, raiseTo) {
  if (!roomState || roomState.isRunout || roomState.turnIndex < 0) return;
  const p = roomState.players[roomState.turnIndex];
  if (!p || p.id !== myId) return;

  if (action === "fold") {
    recordActionStats({ fold: 1 });
  } else if (action === "allin") {
    recordActionStats({ allIn: 1 });
  } else if (action === "raise") {
    const target = Math.max(Number(raiseTo) || 0, roomState.currentBet + roomState.minRaise);
    const needed = Math.max(0, Math.min(p.chips, target - p.bet));
    recordActionStats({ raise: 1, allIn: needed >= p.chips ? 1 : 0 });
  } else if (action === "check-call") {
    const toCall = Math.max(0, Math.min(p.chips, roomState.currentBet - p.bet));
    if (toCall === 0) recordActionStats({ check: 1 });
    else recordActionStats({ call: 1, allIn: toCall >= p.chips ? 1 : 0 });
  }
}

function handleAction(playerId, action, raiseTo = 0, isTimeout = false) {
  if (isSyncingAction && !isTimeout) return;
  if (playerId === myId) trackMyActionStat(action, raiseTo);
  const next = applyActionToState(roomState, playerId, action, raiseTo, isTimeout);
  if (next) syncState(next);
}

function startNewMatchReset() {
  if (!roomState || roomState.hostId !== myId) return;
  const user = getCurrentUser();
  const myStack = user ? Math.min(STARTING_CHIPS, user.balance) : STARTING_CHIPS;
  const s = normalizeRoomState(structuredClone(roomState));
  s.players.forEach(p => {
    const stack = p.id === myId ? myStack : STARTING_CHIPS;
    p.chips = stack; p.handStartChips = stack; p.bet = 0; p.totalBet = 0;
    p.folded = false; p.allIn = false; p.acted = false; p.participated = false; p.status = "PRONTO";
  });
  roomState = s;
  startNewHand();
}

async function performRebuy() {
  if (!roomState) return;
  const myIdx = roomState.players.findIndex(p => p.id === myId);
  if (myIdx < 0 || roomState.players[myIdx].chips > 0) return;

  const user = getCurrentUser();
  const rebuyAmount = user ? Math.min(STARTING_CHIPS, user.balance) : STARTING_CHIPS;
  if (rebuyAmount < BIG_BLIND) return;

  if (localMode) {
    const inActiveHand = roomState.phase !== "WAITING" && roomState.phase !== "SHOWDOWN";
    const newStatus = inActiveHand ? "REBUY (PRÓX. MÃO)" : "REBUY";
    const meName = roomState.players[myIdx].name;
    const s = normalizeRoomState(structuredClone(roomState));
    s.players[myIdx].chips = rebuyAmount;
    s.players[myIdx].handStartChips = rebuyAmount;
    s.players[myIdx].status = newStatus;
    if (!inActiveHand) {
      s.players[myIdx].folded = false;
      const alive = s.players.filter(pl => pl.chips > 0).length;
      if (s.phase === "SHOWDOWN" && alive >= 2 && s.nextHandDeadline === 0) {
        s.nextHandDeadline = Date.now() + 3000;
        s.message = `${meName} fez Rebuy (+${rebuyAmount}€)! Nova mão a começar...`;
      }
    }
    setSoundEvent(s, "chip");
    syncState(s);
  } else if (db && currentRoomCode) {
    try {
      await runTransaction(ref(db, `rooms/${currentRoomCode}`), (raw) => {
        if (!raw) return raw;
        const prevPresence = raw.presence || null;
        const s = normalizeRoomState(raw);
        const idx = s.players.findIndex(p => p.id === myId);
        if (idx < 0 || s.players[idx].chips > 0) return undefined;

        const inActiveHand = s.phase !== "WAITING" && s.phase !== "SHOWDOWN";
        s.players[idx].chips = rebuyAmount;
        s.players[idx].handStartChips = rebuyAmount;
        s.players[idx].status = inActiveHand ? "REBUY (PRÓX. MÃO)" : "REBUY";
        if (!inActiveHand) {
          s.players[idx].folded = false;
          const alive = s.players.filter(pl => pl.chips > 0).length;
          if (s.phase === "SHOWDOWN" && alive >= 2 && s.nextHandDeadline === 0) {
            s.nextHandDeadline = Date.now() + 3000;
            s.message = `${s.players[idx].name} fez Rebuy (+${rebuyAmount}€)! Nova mão a começar...`;
          }
        }
        setSoundEvent(s, "chip");
        if (prevPresence) s.presence = prevPresence;
        return s;
      });
      SoundEngine.chip();
    } catch (err) {
      console.error("Erro no Rebuy:", err);
    }
  }
}

function maybeTriggerBotTurn() {
  if (!localMode || !roomState || roomState.isRunout || roomState.turnIndex < 0) return;
  const current = roomState.players[roomState.turnIndex];
  if (!current || !current.isBot) return;

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
  }, 900 + secureRandomInt(900));
}

function startTimerLoop() { stopTimerLoop(); timerInterval = setInterval(tickTimers, 100); }
function stopTimerLoop() { if (timerInterval) { clearInterval(timerInterval); timerInterval = null; } }

function tickTimers() {
  if (!roomState) return;
  checkOnlineStability();

  const now = Date.now();
  const isHost = roomState.hostId === myId;

  if (roomState.isRunout && roomState.runoutDeadline > 0) {
    if (now >= roomState.runoutDeadline && isHost && lastHandledRunoutDeadline !== roomState.runoutDeadline) {
      lastHandledRunoutDeadline = roomState.runoutDeadline;
      syncState(advancePhaseOnState(roomState));
    }
    return;
  }

  if (roomState.turnIndex >= 0 && roomState.turnDeadline > 0) {
    const remainingMs = Math.max(0, roomState.turnDeadline - now);
    const pct = Math.min(100, (remainingMs / TURN_DURATION_MS) * 100);
    const secs = Math.ceil(remainingMs / 1000);

    const ringEl = $("active-timer-ring"), textEl = $("active-timer-text");
    if (ringEl) {
      const color = secs <= 5 ? "#e11d48" : secs <= 10 ? "#f5b942" : "#22c55e";
      ringEl.style.background = `conic-gradient(${color} ${pct}%, rgba(255, 255, 255, 0.12) ${pct}% 100%)`;
    }
    if (textEl) { textEl.textContent = `${secs}s`; textEl.classList.toggle("urgent", secs <= 5); }
    if (secs >= 1 && secs <= 5) {
      const k = `${roomState.turnDeadline}_${secs}`;
      if (lastTickKey !== k) { lastTickKey = k; SoundEngine.tick(secs <= 2); }
    }
    if (remainingMs === 0 && isHost && lastHandledTurnDeadline !== roomState.turnDeadline) {
      lastHandledTurnDeadline = roomState.turnDeadline;
      const activePlayer = roomState.players[roomState.turnIndex];
      if (activePlayer) handleAction(activePlayer.id, roomState.currentBet - activePlayer.bet === 0 ? "check-call" : "fold", 0, true);
    }
  }

  const nextPill = $("next-hand-countdown");
  const isWait = roomState.phase === "WAITING" && roomState.nextHandDeadline > 0 && roomState.players.length >= 2;
  const isShow = roomState.phase === "SHOWDOWN" && roomState.nextHandDeadline > 0;

  if ((isWait || isShow) && nextPill) {
    const remainingMs = Math.max(0, roomState.nextHandDeadline - now);
    const secs = Math.ceil(remainingMs / 1000);
    nextPill.textContent = isWait ? `Começa em ${secs}s` : `Nova mão em ${secs}s`;
    nextPill.classList.remove("hidden");

    if (isWait) {
      if ($("table-message")) $("table-message").textContent = `Jogadores na mesa (${roomState.players.length}/${MAX_PLAYERS}) — O jogo começa em ${secs}s!`;
      if (secs >= 1 && secs <= 3) {
        const k = `start_${roomState.nextHandDeadline}_${secs}`;
        if (lastTickKey !== k) { lastTickKey = k; SoundEngine.tick(secs === 1); }
      }
    }
    if (remainingMs === 0 && isHost && lastHandledNextHandDeadline !== roomState.nextHandDeadline) {
      lastHandledNextHandDeadline = roomState.nextHandDeadline;
      startNewHand();
    }
  } else if (nextPill) nextPill.classList.add("hidden");
}

/* ============================================================================
   3. SALDO E RENDERIZAÇÃO DA MESA
   ============================================================================ */
function settleHandBalanceIfNeeded(forceLeave = false) {
  if (!roomState || !getCurrentUser()) return;
  const handId = Number(roomState.handId) || 0;
  if (handId <= 0) return;

  const handKey = `${currentRoomCode || "OFFLINE"}_${handId}`;
  if (handId !== trackedHandId) {
    trackedHandId = handId;
    let alreadySettled = false;
    try { alreadySettled = sessionStorage.getItem(SETTLED_HAND_KEY) === handKey; } catch (_) {}
    handSettled = alreadySettled;
  }
  if (handSettled) return;

  const me = (roomState.players || []).find(p => p.id === myId);
  if (!me || !me.participated) { if (me && !me.participated) handSettled = true; return; }

  const isShowdown = roomState.phase === "SHOWDOWN";
  if (!isShowdown && !me.folded && !forceLeave) return;

  handSettled = true;
  try { sessionStorage.setItem(SETTLED_HAND_KEY, handKey); } catch (_) {}

  const delta = me.chips - (Number(me.handStartChips) || 0);
  const won = isShowdown && (roomState.winnerIds || []).includes(myId);
  if (forceLeave && delta === 0) return;
  applyBalanceDelta(delta, { won, countHand: true });
}

function renderPotChipsHTML(amount) {
  if (!amount || amount <= 0) return "";
  const denoms = [{ v: 500, c: "chip-500" }, { v: 100, c: "chip-100" }, { v: 25, c: "chip-25" }, { v: 10, c: "chip-10" }, { v: 5, c: "chip-5" }];
  let rem = amount, html = "";
  for (const d of denoms) {
    const count = Math.min(6, Math.floor(rem / d.v));
    rem %= d.v;
    if (count > 0) html += `<div class="chip-stack">${`<div class="poker-chip ${d.c}"></div>`.repeat(count)}</div>`;
  }
  return html;
}

function renderCardHTML(card, hidden = false, small = false, hl = "") {
  const sc = small ? "small" : "";
  if (hidden || !card) return `<div class="card back ${sc}"><div class="card-back-inner"><span class="card-back-emblem">❄</span></div></div>`;
  const red = card.suit === "♥" || card.suit === "♦" ? "red" : "";
  return `
    <div class="card ${red} ${sc} ${hl}">
      <div class="card-corner top"><span class="card-rank">${card.label}</span><span class="card-suit-mini">${card.suit}</span></div>
      <div class="card-center">${card.suit}</div>
      <div class="card-corner bottom"><span class="card-rank">${card.label}</span><span class="card-suit-mini">${card.suit}</span></div>
    </div>`;
}

function renderGame() {
  if (!roomState) return;
  applyTableLedTheme(roomState.tableLedIndex);

  if (roomState.lastEvent && roomState.lastEvent.ts !== lastPlayedEventTs) {
    lastPlayedEventTs = roomState.lastEvent.ts;
    SoundEngine.playEvent(roomState.lastEvent.type);
  }

  const players = roomState.players || [], community = roomState.community || [];
  const isShowdown = roomState.phase === "SHOWDOWN", isWaiting = roomState.phase === "WAITING";
  const winCardsSet = new Set(roomState.winningCards || []), winnerIdsSet = new Set(roomState.winnerIds || []);
  const hasCardHighlights = isShowdown && winCardsSet.size > 0;

  const tableEl = document.querySelector(".poker-table");
  const visibleSeats = players.length > 5 ? 6 : 5;
  tableEl?.classList.toggle("six-players", visibleSeats === 6);

  if ($("display-room-code")) $("display-room-code").textContent = currentRoomCode || "DEMO";
  if ($("display-phase")) $("display-phase").textContent = isWaiting ? "A AGUARDAR" : roomState.phase;
  if ($("pot-amount")) $("pot-amount").textContent = roomState.pot;
  if ($("pot-chips")) $("pot-chips").innerHTML = renderPotChipsHTML(roomState.pot);
  if ($("table-message")) $("table-message").textContent = roomState.message;

  const waitingPill = $("waiting-room-pill");
  if (waitingPill) {
    const showCode = isWaiting && !localMode && Boolean(currentRoomCode);
    waitingPill.classList.toggle("hidden", !showCode);
    if (showCode && $("waiting-room-code")) $("waiting-room-code").textContent = currentRoomCode;
  }

  const sidePotsEl = $("side-pots-display");
  if (sidePotsEl) {
    const hasAllIn = players.some(p => !p.folded && p.allIn);
    const sp = hasAllIn ? buildSidePots(players, roomState.deadPot) : [];
    if (hasAllIn && sp.length > 1 && !isWaiting) {
      sidePotsEl.innerHTML = sp.map((x, i) => `<span class="side-pot-tag">${i === 0 ? "Principal" : `Side ${i}`}: ${x.amount}€</span>`).join("");
      sidePotsEl.classList.remove("hidden");
    } else sidePotsEl.classList.add("hidden");
  }

  const isHost = roomState.hostId === myId, funded = players.filter(p => p.chips > 0).length;
  if ($("btn-start-game")) {
    $("btn-start-game").classList.toggle("hidden", !(isHost && funded >= 2 && (isWaiting || isShowdown)));
    $("btn-start-game").textContent = isShowdown ? "Saltar Espera" : "Começar Já";
  }
  $("btn-new-match")?.classList.toggle("hidden", !(isHost && isShowdown && funded < 2));

  if ($("community-cards")) {
    $("community-cards").innerHTML = community.map(c =>
      renderCardHTML(c, false, false, hasCardHighlights ? (winCardsSet.has(cardKey(c)) ? "card-win" : "card-dim") : "")
    ).join("");
  }

  const bannerEl = $("winning-hand-banner");
  if (bannerEl) {
    if (isShowdown && roomState.winningHandName) { bannerEl.textContent = roomState.winningHandName.toUpperCase(); bannerEl.classList.remove("hidden"); }
    else bannerEl.classList.add("hidden");
  }

  const myIndex = players.findIndex(p => p.id === myId);
  const offset = myIndex >= 0 ? myIndex : 0;

  for (let seatVisual = 0; seatVisual < MAX_PLAYERS; seatVisual++) {
    const el = document.querySelector(`.seat-${seatVisual}`);
    if (!el) continue;
    if (seatVisual >= visibleSeats) { el.className = `seat seat-${seatVisual} empty`; el.innerHTML = ""; continue; }

    const pIdx = seatVisual < players.length ? (seatVisual + offset) % players.length : -1;
    const p = pIdx >= 0 ? players[pIdx] : null;
    if (!p) {
      el.className = `seat seat-${seatVisual} empty`;
      el.innerHTML = `<div class="seat-ring"><div class="seat-circle"><span class="seat-empty-label">Livre</span></div></div>`;
      continue;
    }

    const isMe = p.id === myId, isTurn = roomState.turnIndex === pIdx, isWinner = isShowdown && winnerIdsSet.has(p.id);
    const inHand = !p.folded && p.hand?.length === 2;
    const showCards = isMe || (roomState.isRunout && !p.folded) || (isShowdown && !p.folded && hasCardHighlights);
    const statusLabel = isPlayerOffline(p.id) ? "OFFLINE..." : p.status;

    el.className = `seat seat-${seatVisual} ${isMe ? "is-me" : ""} ${inHand ? "has-cards" : ""} ${isTurn ? "active-turn" : ""} ${isWinner ? "is-winner" : ""} ${p.folded ? "folded" : ""}`;
    const betPill = p.bet > 0 ? `<div class="bet-pill"><span class="mini-chip"></span>${p.bet} €</div>` : "";
    const ringInner = `
      ${roomState.dealerIndex === pIdx && !isWaiting ? `<div class="dealer-chip" title="Botão Dealer">D</div>` : ""}
      ${isTurn ? `<span class="turn-timer-text" id="active-timer-text">20s</span>` : ""}
      <div class="seat-circle"><div class="seat-name" title="${p.name}">${p.name}</div>${isMe ? `<div class="seat-you-tag">TU</div>` : ""}</div>
      ${isWinner ? `<div class="winner-badge">WINNER</div>` : ""}`;

    if (isMe) {
      const heroCards = inHand ? `<div class="hero-cards">${p.hand.map(c =>
        renderCardHTML(c, false, false, hasCardHighlights ? (isWinner && winCardsSet.has(cardKey(c)) ? "card-win" : "card-dim") : "")
      ).join("")}</div>` : "";
      el.innerHTML = `<div class="seat-avatar-stack">${betPill ? `<div class="hero-bet-zone">${betPill}</div>` : ""}<div class="seat-ring" ${isTurn ? 'id="active-timer-ring"' : ""}>${ringInner}</div>${heroCards}</div><div class="seat-chips">${p.chips} €</div>${statusLabel ? `<div class="seat-status">${statusLabel}</div>` : ""}`;
    } else {
      const oppCards = inHand ? `<div class="opp-cards ${showCards ? "revealed" : ""}">${p.hand.map(c =>
        renderCardHTML(c, !showCards, !showCards, (hasCardHighlights && showCards) ? (isWinner && winCardsSet.has(cardKey(c)) ? "card-win" : "card-dim") : "")
      ).join("")}</div>` : "";
      el.innerHTML = `${(oppCards || betPill) ? `<div class="seat-felt-zone">${oppCards}${betPill}</div>` : ""}<div class="seat-avatar-stack"><div class="seat-ring" ${isTurn ? 'id="active-timer-ring"' : ""}>${ringInner}</div></div><div class="seat-chips">${p.chips} €</div>${statusLabel ? `<div class="seat-status">${statusLabel}</div>` : ""}`;
    }
  }

  const me = players[myIndex], user = getCurrentUser();
  $("btn-rebuy")?.classList.toggle("hidden", !Boolean(me && me.chips === 0 && (!user || user.balance >= BIG_BLIND) && (me.folded || isShowdown || isWaiting)));

  if ($("hand-strength-badge")) {
    if (me && !me.folded && me.hand?.length === 2) {
      const all = [...me.hand, ...community];
      $("hand-strength-badge").textContent = `A tua mão: ${all.length >= 5 ? evaluateBestHand(all).name : "Pré-Flop"}`;
    } else $("hand-strength-badge").textContent = "A tua mão: —";
  }

  const isMyTurn = Boolean(me && !roomState.isRunout && roomState.turnIndex === myIndex && !me.folded && !me.allIn);
  if (isMyTurn && !wasMyTurn) setTimeout(() => SoundEngine.myTurn(), 180);
  wasMyTurn = isMyTurn;
  $("action-bar")?.classList.toggle("disabled", !isMyTurn);

  if (isMyTurn) {
    const toCall = Math.max(0, roomState.currentBet - me.bet), callAmt = Math.min(toCall, me.chips);
    if ($("btn-check-call")) $("btn-check-call").textContent = toCall === 0 ? "Check" : (callAmt >= me.chips ? `Call All-In (${callAmt}€)` : `Call ${callAmt}€`);
    const maxR = me.bet + me.chips, canR = me.chips > toCall, minR = Math.min(maxR, roomState.currentBet + roomState.minRaise);
    const slider = $("raise-slider");
    if (slider) slider.disabled = !canR;
    if ($("btn-raise")) $("btn-raise").disabled = !canR;
    $("raise-row")?.classList.toggle("disabled-raise", !canR);

    const turnKey = `${roomState.phase}_${roomState.turnDeadline}_${roomState.currentBet}`;
    if (slider && lastSliderTurnKey !== turnKey) {
      lastSliderTurnKey = turnKey;
      slider.step = (maxR - minR) % 10 === 0 ? 10 : 1;
      slider.min = minR; slider.max = maxR; slider.value = minR;
      if ($("raise-value")) $("raise-value").textContent = minR;
    }
  }

  settleHandBalanceIfNeeded(false);
  tickTimers();
}

/* ============================================================================
   4. AUTENTICAÇÃO, HUB DE CARDS, PERFIL E SALAS ONLINE
   ============================================================================ */
function openGameScreen() {
  trackedHandId = 0; handSettled = false;
  $("online-modal")?.classList.add("hidden");
  showScreen("game-screen");
  startTimerLoop();
}

function showError(msg) {
  if ($("lobby-error")) $("lobby-error").textContent = msg;
  if ($("hub-error")) $("hub-error").textContent = msg;
}

function getLoggedBuyInOrError() {
  const user = getCurrentUser();
  if (!user) { showError("Inicia sessão primeiro."); return null; }
  if (user.balance < BIG_BLIND) { showError(`Saldo insuficiente (${formatEuro(user.balance)}).`); return null; }
  return { name: user.username, buyIn: Math.min(STARTING_CHIPS, user.balance) };
}

function resetLocalRoomSession(notice = "") {
  stopTimerLoop();
  if (unsubscribeRoom) { unsubscribeRoom(); unsubscribeRoom = null; }
  detachPresence(false);
  clearActiveRoomSession();
  roomState = null;
  roomPresence = {};
  currentRoomCode = null;
  offlineSinceMap.clear();
  wasMyTurn = false;
  wasSeatedInRoom = false;
  trackedHandId = 0;
  handSettled = false;
  showScreen(getCurrentUser() ? "hub-screen" : "auth-screen");
  if (notice) showError(notice);
}

let authMode = "login";
function setAuthMode(mode) {
  authMode = mode;
  $("tab-login")?.classList.toggle("active", mode === "login");
  $("tab-register")?.classList.toggle("active", mode === "register");
  if ($("btn-auth-submit")) $("btn-auth-submit").textContent = mode === "login" ? "Entrar" : "Criar Conta (+100 000 €)";
  $("auth-hint")?.classList.toggle("hidden", mode !== "register");
  if ($("auth-error")) $("auth-error").textContent = "";
}

async function handlePostAuthAutoEntry(user) {
  if (!isFirebaseConfigured || !db || !user) return;

  if (pendingInviteCode) {
    const invite = pendingInviteCode;
    pendingInviteCode = "";
    clearInviteFromURL();
    if ($("room-code")) $("room-code").value = invite;
    await joinOnlineRoom(invite, true);
    return;
  }

  const saved = getSavedActiveRoomSession();
  if (saved?.code && (!saved.userKey || saved.userKey === user.key)) {
    await attemptReconnectToRoom(saved.code);
  }
}

function renderAuthUI(user) {
  if (!user) {
    hasHandledInitialAutoEntry = false;
    $("online-modal")?.classList.add("hidden");
    showScreen("auth-screen");
    return;
  }

  myName = user.username;
  const initial = (user.username.trim()[0] || "J").toUpperCase();
  const level = Math.floor(user.handsPlayed / 10) + 1;
  const xpPct = Math.max(8, ((user.handsPlayed % 10) / 10) * 100);
  const winRate = user.handsPlayed > 0 ? Math.round((user.handsWon / user.handsPlayed) * 100) : 0;
  const profit = user.balance - INITIAL_BALANCE;
  const balFormatted = formatEuro(user.balance);

  // Atualizar Hub
  if ($("hub-avatar-letter")) $("hub-avatar-letter").textContent = initial;
  if ($("hub-username")) $("hub-username").textContent = user.username;
  if ($("hub-level")) $("hub-level").textContent = `LVL ${level}`;
  if ($("hub-xp-fill")) $("hub-xp-fill").style.width = `${xpPct}%`;
  if ($("hub-balance")) $("hub-balance").textContent = balFormatted;
  if ($("card-profile-summary")) $("card-profile-summary").textContent = `${user.handsWon} vitórias • ${winRate}%`;

  // Atualizar Perfil Completo
  if ($("prof-top-balance")) $("prof-top-balance").textContent = balFormatted;
  if ($("prof-avatar-letter")) $("prof-avatar-letter").textContent = initial;
  if ($("prof-username")) $("prof-username").textContent = user.username;
  if ($("prof-level")) $("prof-level").textContent = `LVL ${level}`;
  if ($("prof-xp-fill")) $("prof-xp-fill").style.width = `${xpPct}%`;
  if ($("prof-balance")) $("prof-balance").textContent = balFormatted;

  const profitEl = $("prof-profit");
  if (profitEl) {
    const sign = profit > 0 ? "+" : "";
    profitEl.textContent = `Lucro/Prejuízo: ${sign}${formatEuro(profit)}`;
    profitEl.className = `profile-profit-pill ${profit > 0 ? "pos" : profit < 0 ? "neg" : ""}`;
  }

  if ($("stat-wins")) $("stat-wins").textContent = user.handsWon;
  if ($("stat-winrate")) $("stat-winrate").textContent = `${winRate}% vitórias`;
  if ($("stat-played")) $("stat-played").textContent = user.handsPlayed;
  if ($("stat-folds")) $("stat-folds").textContent = user.foldsCount;
  if ($("stat-allins")) $("stat-allins").textContent = user.allInsCount;
  if ($("stat-raises")) $("stat-raises").textContent = user.raisesCount;
  if ($("stat-calls")) $("stat-calls").textContent = user.callsCount;
  if ($("stat-checks")) $("stat-checks").textContent = user.checksCount;
  if ($("stat-biggest-win")) $("stat-biggest-win").textContent = formatEuro(user.biggestWin);
  if ($("stat-best-streak")) $("stat-best-streak").textContent = `Melhor série: ${user.bestStreak}`;

  if (getActiveScreenId() === "auth-screen") showScreen("hub-screen");

  if (!hasHandledInitialAutoEntry && getActiveScreenId() !== "game-screen") {
    hasHandledInitialAutoEntry = true;
    handlePostAuthAutoEntry(user);
  }
}

async function handleAuthSubmit() {
  SoundEngine.init();
  const errEl = $("auth-error"), btn = $("btn-auth-submit");
  if (errEl) errEl.textContent = "";
  const prevText = btn ? btn.textContent : "";
  if (btn) { btn.disabled = true; btn.textContent = authMode === "login" ? "A entrar..." : "A criar conta..."; }
  try {
    const u = $("auth-username")?.value || "", p = $("auth-pin")?.value || "";
    if (authMode === "login") await loginUser(u, p);
    else await registerUser(u, p);
    if ($("auth-pin")) $("auth-pin").value = "";
  } catch (err) {
    if (errEl) errEl.textContent = err?.message || "Erro na autenticação.";
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = prevText; }
  }
}

on("tab-login", "click", () => setAuthMode("login"));
on("tab-register", "click", () => setAuthMode("register"));
on("auth-pin", "input", (e) => { e.target.value = e.target.value.replace(/\D/g, "").slice(0, 4); });
on("btn-auth-submit", "click", handleAuthSubmit);
on("auth-pin", "keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); handleAuthSubmit(); } });
on("btn-logout", "click", () => {
  clearActiveRoomSession();
  try { sessionStorage.removeItem(SETTLED_HAND_KEY); } catch (_) {}
  hasHandledInitialAutoEntry = false;
  logoutUser();
  setAuthMode("login");
});

// Navegação dos Cards do Hub
const openOnlineModal = () => { SoundEngine.init(); showError(""); $("online-modal")?.classList.remove("hidden"); };
const openProfile = () => { SoundEngine.init(); showError(""); showScreen("profile-screen"); };

on("card-play-online", "click", openOnlineModal);
on("btn-close-online-modal", "click", () => $("online-modal")?.classList.add("hidden"));
$("online-modal")?.addEventListener("click", (e) => { if (e.target === $("online-modal")) $("online-modal").classList.add("hidden"); });

on("card-open-profile", "click", openProfile);
on("hub-profile-trigger", "click", openProfile);
on("btn-profile-back", "click", () => showScreen("hub-screen"));

if (pendingInviteCode && $("room-code")) {
  $("room-code").value = pendingInviteCode;
}

setAuthMode("login");
initUserSystem(db, renderAuthUI);
restoreSession();

function subscribeToRoom(code) {
  if (unsubscribeRoom) unsubscribeRoom();
  unsubscribeRoom = onValue(ref(db, `rooms/${code}`), (snap) => {
    if (isLeavingRoom || localMode || currentRoomCode !== code) return;

    if (!snap.exists()) {
      resetLocalRoomSession("A sala foi encerrada.");
      return;
    }

    const raw = snap.val();
    roomPresence = raw.presence || {};
    roomState = normalizeRoomState(raw);
    updateOfflineTrackers();

    const stillInRoom = roomState.players.some(p => p.id === myId);
    if (stillInRoom) {
      wasSeatedInRoom = true;
    } else if (wasSeatedInRoom) {
      resetLocalRoomSession("Foste removido da sala por inatividade.");
      return;
    }

    if (roomState.hostId === myId && roomState.phase === "WAITING" && roomState.players.length >= 2 && !roomState.nextHandDeadline) {
      update(ref(db, `rooms/${code}`), {
        nextHandDeadline: Date.now() + AUTO_START_DELAY_MS,
        message: `Jogadores na mesa (${roomState.players.length}/${MAX_PLAYERS}) — O jogo começa em 10s!`
      });
    }
    renderGame();
  });
}

async function attemptReconnectToRoom(code) {
  if (!isFirebaseConfigured || !db || !code) return false;
  try {
    const snap = await withTimeout(get(ref(db, `rooms/${code}`)));
    if (!snap.exists()) {
      clearActiveRoomSession();
      return false;
    }
    const raw = snap.val();
    const state = normalizeRoomState(raw);
    if (!state.players.some(p => p.id === myId)) {
      clearActiveRoomSession();
      showError("A sessão na sala anterior expirou.");
      return false;
    }

    localMode = false;
    currentRoomCode = code;
    roomState = state;
    roomPresence = raw.presence || {};
    wasSeatedInRoom = true;
    updateOfflineTrackers();
    saveActiveRoomSession(code);
    attachPresence(code);
    openGameScreen();
    renderGame();
    subscribeToRoom(code);
    return true;
  } catch (err) {
    console.error("Erro ao reconectar:", err);
    return false;
  }
}

async function joinOnlineRoom(rawCode, fromInvite = false) {
  showError("");
  if (!isFirebaseConfigured || !db) return showError("Firebase não configurado.");
  const entry = getLoggedBuyInOrError(); if (!entry) return false;
  const code = extractRoomCode(rawCode);
  if (!code) return showError("Introduz o código da sala.");

  const btn = $("btn-join-room"), prev = btn?.textContent || "Entrar";
  if (btn && !fromInvite) { btn.disabled = true; btn.textContent = "A entrar..."; }

  try {
    const roomRef = ref(db, `rooms/${code}`);
    const existsSnap = await withTimeout(get(roomRef));
    if (!existsSnap.exists()) {
      showError(`Sala "${code}" não encontrada.`);
      return false;
    }

    let abortReason = "";
    const txResult = await withTimeout(runTransaction(roomRef, (raw) => {
      if (!raw) return raw;
      const prevPresence = raw.presence || null;
      const data = normalizeRoomState(raw);
      const existingIdx = data.players.findIndex(p => p.id === myId);

      if (existingIdx >= 0) {
        data.players[existingIdx].name = entry.name;
        if (prevPresence) data.presence = prevPresence;
        return data;
      }

      if (data.players.length >= MAX_PLAYERS) {
        abortReason = "A mesa já está cheia (6/6).";
        return undefined;
      }

      data.players.push({
        id: myId, name: entry.name, chips: entry.buyIn, handStartChips: entry.buyIn,
        bet: 0, totalBet: 0, hand: [], folded: data.phase !== "WAITING",
        allIn: false, acted: false, participated: false, isBot: false,
        status: data.phase === "WAITING" ? "PRONTO" : "A AGUARDAR MÃO"
      });

      if (data.phase === "WAITING" && data.players.length >= 2 && !data.nextHandDeadline) {
        data.nextHandDeadline = Date.now() + AUTO_START_DELAY_MS;
        data.message = `Jogadores na mesa (${data.players.length}/${MAX_PLAYERS}) — O jogo começa em 10s!`;
      }

      if (prevPresence) data.presence = prevPresence;
      return data;
    }));

    if (abortReason) { showError(abortReason); return false; }
    if (!txResult.committed || !txResult.snapshot.exists()) {
      showError(`Sala "${code}" não encontrada.`);
      return false;
    }

    const finalRaw = txResult.snapshot.val();
    myName = entry.name;
    localMode = false;
    currentRoomCode = code;
    roomState = normalizeRoomState(finalRaw);
    roomPresence = finalRaw.presence || {};
    wasSeatedInRoom = true;
    updateOfflineTrackers();
    saveActiveRoomSession(code);
    clearInviteFromURL();
    attachPresence(code);
    openGameScreen();
    renderGame();
    subscribeToRoom(code);
    return true;
  } catch (err) {
    showError(String(err?.message || err));
    return false;
  } finally {
    if (btn && !fromInvite) { btn.disabled = false; btn.textContent = prev; }
  }
}

on("btn-create-room", "click", async () => {
  SoundEngine.init(); showError("");
  if (!isFirebaseConfigured || !db) return showError("Firebase não configurado.");
  const entry = getLoggedBuyInOrError(); if (!entry) return;
  const btn = $("btn-create-room"), prev = btn.textContent;
  btn.disabled = true; btn.textContent = "A criar sala...";
  try {
    myName = entry.name; localMode = false; currentRoomCode = generateRoomCode();
    const initial = createInitialRoom(myId, myName, entry.buyIn, pickNextLedIndex());
    await withTimeout(set(ref(db, `rooms/${currentRoomCode}`), initial));
    roomState = initial;
    roomPresence = {};
    wasSeatedInRoom = true;
    offlineSinceMap.clear();
    saveActiveRoomSession(currentRoomCode);
    clearInviteFromURL();
    attachPresence(currentRoomCode);
    openGameScreen();
    renderGame();
    subscribeToRoom(currentRoomCode);
  } catch (err) { showError(String(err?.message || err)); }
  finally { btn.disabled = false; btn.textContent = prev; }
});

on("btn-join-room", "click", () => {
  SoundEngine.init();
  joinOnlineRoom($("room-code")?.value || "", false);
});

on("room-code", "keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); $("btn-join-room")?.click(); } });

function startBotsGame() {
  SoundEngine.init(); showError("");
  const entry = getLoggedBuyInOrError(); if (!entry) return;
  clearActiveRoomSession();
  detachPresence(false);
  myName = entry.name; localMode = true; currentRoomCode = "OFFLINE";
  const demo = createInitialRoom(myId, myName, entry.buyIn, pickNextLedIndex());
  ["Tiago", "Marta", "Rui", "Inês"].forEach((name, i) => demo.players.push({
    id: `bot_${i}`, name, chips: STARTING_CHIPS, handStartChips: STARTING_CHIPS,
    bet: 0, totalBet: 0, hand: [], folded: false, allIn: false, acted: false,
    participated: false, isBot: true, status: ""
  }));
  roomState = demo; roomPresence = {}; wasSeatedInRoom = true;
  openGameScreen(); startNewHand();
}

on("card-play-bots", "click", startBotsGame);

function setQuickRaise(mode) {
  const me = roomState?.players.find(p => p.id === myId), slider = $("raise-slider");
  if (!me || !slider || slider.disabled) return;
  const minR = Number(slider.min), maxR = Number(slider.max);
  const potAfter = roomState.pot + Math.max(0, roomState.currentBet - me.bet);
  let target = minR;
  if (mode === "half") target = Math.round((roomState.currentBet + potAfter * 0.5) / 10) * 10;
  else if (mode === "pot") target = Math.round((roomState.currentBet + potAfter) / 10) * 10;
  target = Math.max(minR, Math.min(maxR, target));
  slider.value = target;
  if ($("raise-value")) $("raise-value").textContent = target;
}

const copyCode = (e) => {
  if (!currentRoomCode) return;
  const payload = localMode ? currentRoomCode : buildInviteLink(currentRoomCode);
  navigator.clipboard?.writeText(payload).catch(() => {});
  const btn = e.currentTarget, prev = btn.textContent;
  btn.textContent = localMode ? "Copiado ✓" : "Link copiado ✓";
  setTimeout(() => { btn.textContent = prev; }, 1500);
};

async function leaveCurrentRoom() {
  if (isLeavingRoom) return;
  isLeavingRoom = true;
  const wasOnline = !localMode;
  const codeToLeave = currentRoomCode;

  settleHandBalanceIfNeeded(true);
  stopTimerLoop();
  if (unsubscribeRoom) { unsubscribeRoom(); unsubscribeRoom = null; }
  detachPresence(true);
  clearActiveRoomSession();

  try {
    if (wasOnline && db && codeToLeave) {
      await removePlayerFromRoomTx(codeToLeave, myId, "saiu da mesa", false);
    }
  } finally {
    roomState = null;
    roomPresence = {};
    currentRoomCode = null;
    offlineSinceMap.clear();
    wasMyTurn = false;
    wasSeatedInRoom = false;
    trackedHandId = 0;
    handSettled = false;
    isLeavingRoom = false;
    showScreen(getCurrentUser() ? "hub-screen" : "auth-screen");
  }
}

on("btn-start-game", "click", startNewHand);
on("btn-new-match", "click", startNewMatchReset);
on("btn-rebuy", "click", performRebuy);
on("btn-fold", "click", () => handleAction(myId, "fold"));
on("btn-check-call", "click", () => handleAction(myId, "check-call"));
on("btn-raise", "click", () => handleAction(myId, "raise", Number($("raise-slider")?.value || 0)));
on("btn-allin", "click", () => handleAction(myId, "allin"));
on("raise-slider", "input", (e) => { if ($("raise-value")) $("raise-value").textContent = e.target.value; });
on("btn-bet-min", "click", () => setQuickRaise("min"));
on("btn-bet-half", "click", () => setQuickRaise("half"));
on("btn-bet-pot", "click", () => setQuickRaise("pot"));
on("btn-copy-code", "click", copyCode);
on("btn-waiting-copy", "click", copyCode);
on("btn-leave", "click", leaveCurrentRoom);

/* ============================================================================
   5. PWA E FULLSCREEN HORIZONTAL
   ============================================================================ */
if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));

let deferredInstallPrompt = window.__deferredInstallPrompt || null;
const installBtn = $("btn-install-app"), iosModal = $("ios-install-modal");
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
const isMobile = /Android|iPhone|iPad|iPod/.test(navigator.userAgent);
const isStandalone = window.matchMedia("(display-mode: standalone)").matches || window.matchMedia("(display-mode: fullscreen)").matches || window.navigator.standalone === true;

function syncInstallButton() {
  if (installBtn && !isStandalone && (deferredInstallPrompt || isIOS || isMobile)) installBtn.classList.remove("hidden");
}
syncInstallButton();
window.addEventListener("hiperbluff:install-ready", () => { deferredInstallPrompt = window.__deferredInstallPrompt; syncInstallButton(); });
window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferredInstallPrompt = e; window.__deferredInstallPrompt = e; syncInstallButton(); });
window.addEventListener("appinstalled", () => { deferredInstallPrompt = null; window.__deferredInstallPrompt = null; installBtn?.classList.add("hidden"); });

on("btn-install-app", "click", async () => {
  const p = deferredInstallPrompt || window.__deferredInstallPrompt;
  if (p) {
    p.prompt();
    const { outcome } = await p.userChoice;
    if (outcome === "accepted") installBtn?.classList.add("hidden");
    deferredInstallPrompt = null; window.__deferredInstallPrompt = null;
  } else if (isIOS && iosModal) iosModal.classList.remove("hidden");
  else showError("No Chrome, toca no menu (⋮) e escolhe \"Instalar aplicação\".");
});
on("btn-close-ios-modal", "click", () => iosModal?.classList.add("hidden"));
iosModal?.addEventListener("click", (e) => { if (e.target === iosModal) iosModal.classList.add("hidden"); });

const canFullscreen = Boolean(document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen);
const isInFullscreen = () => Boolean(document.fullscreenElement || document.webkitFullscreenElement || window.matchMedia("(display-mode: fullscreen)").matches);
const updateFullscreenState = () => document.body.classList.toggle("is-fullscreen", isInFullscreen());

async function enterFullscreenLandscape() {
  const el = document.documentElement;
  try {
    if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: "hide" });
    else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
  } catch (_) {}
  screen.orientation?.lock?.("landscape").catch(() => {});
  updateFullscreenState();
}

async function exitFullscreenMode() {
  try {
    if (document.exitFullscreen) await document.exitFullscreen();
    else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
  } catch (_) {}
  try { screen.orientation?.unlock?.(); } catch (_) {}
  updateFullscreenState();
}

const toggleFullscreen = () => isInFullscreen() ? exitFullscreenMode() : enterFullscreenLandscape();
["btn-fullscreen", "btn-hub-fullscreen"].forEach(id => {
  const btn = $(id);
  if (!btn) return;
  if (!canFullscreen) btn.classList.add("hidden");
  else btn.addEventListener("click", toggleFullscreen);
});

document.addEventListener("fullscreenchange", updateFullscreenState);
document.addEventListener("webkitfullscreenchange", updateFullscreenState);
window.addEventListener("resize", updateFullscreenState);
updateFullscreenState();

on("btn-rotate-landscape", "click", enterFullscreenLandscape);
document.addEventListener("gesturestart", (e) => e.preventDefault(), { passive: false });
let lastTouchEnd = 0;
document.addEventListener("touchend", (e) => {
  const now = Date.now();
  if (now - lastTouchEnd <= 300 && !e.target.closest("button, input, a, label")) e.preventDefault();
  lastTouchEnd = now;
}, { passive: false });

/* === FIM DO FICHEIRO game.js === */
