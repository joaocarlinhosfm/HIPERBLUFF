import { ref, get, set, update, onValue, runTransaction } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

export const INITIAL_BALANCE = 100000;
const SESSION_KEY = "hiperbluff_session_v1";

let dbRef = null;
let currentUser = null;
let unsubscribeUser = null;
let onUserChangeCallback = null;

export function formatEuro(amount) {
  return `${Math.floor(Number(amount) || 0).toLocaleString("pt-PT")} €`;
}

export function normalizeUsernameKey(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9_-]/g, "");
}

function buildUserObject(key, data = {}) {
  return {
    key,
    username: data.username || key,
    balance: Math.max(0, Number(data.balance) || 0),
    handsPlayed: Number(data.handsPlayed) || 0,
    handsWon: Number(data.handsWon) || 0,
    foldsCount: Number(data.foldsCount) || 0,
    allInsCount: Number(data.allInsCount) || 0,
    raisesCount: Number(data.raisesCount) || 0,
    callsCount: Number(data.callsCount) || 0,
    checksCount: Number(data.checksCount) || 0,
    biggestWin: Number(data.biggestWin) || 0,
    currentStreak: Number(data.currentStreak) || 0,
    bestStreak: Number(data.bestStreak) || 0
  };
}

async function hashPin(userKey, pin) {
  const raw = `hiperbluff_salt_${userKey}_${pin}`;
  if (window.crypto && window.crypto.subtle) {
    const encoded = new TextEncoder().encode(raw);
    const digest = await window.crypto.subtle.digest("SHA-256", encoded);
    return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, "0")).join("");
  }
  let h = 2166136261;
  for (let i = 0; i < raw.length; i++) {
    h ^= raw.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `fb_${(h >>> 0).toString(16)}`;
}

function validateCredentials(username, pin) {
  const displayName = String(username || "").trim();
  if (displayName.length < 2 || displayName.length > 14) {
    throw new Error("O username deve ter entre 2 e 14 caracteres.");
  }
  const key = normalizeUsernameKey(displayName);
  if (key.length < 2) throw new Error("Usa pelo menos 2 letras ou números no username.");
  if (!/^\d{4}$/.test(String(pin || ""))) throw new Error("A password deve ter exatamente 4 números.");
  return { displayName, key };
}

function withTimeout(promise, ms = 10000) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error("Sem resposta do Firebase. Verifica a ligação.")), ms))
  ]);
}

function formatFirebaseError(err) {
  const msg = String(err?.message || err || "");
  if (msg.toLowerCase().includes("permission")) {
    return new Error("Permissão negada no Firebase. Publica as regras do nó 'users'.");
  }
  return err instanceof Error ? err : new Error(msg || "Erro no Firebase.");
}

function notifyChange() {
  if (typeof onUserChangeCallback === "function") onUserChangeCallback(currentUser);
}

function saveSession(key, pinHash) {
  try { localStorage.setItem(SESSION_KEY, JSON.stringify({ key, pinHash })); } catch (_) {}
}

function clearSession() {
  try { localStorage.removeItem(SESSION_KEY); } catch (_) {}
}

function subscribeUser(key) {
  if (unsubscribeUser) { unsubscribeUser(); unsubscribeUser = null; }
  if (!dbRef || !key) return;

  unsubscribeUser = onValue(ref(dbRef, `users/${key}`), (snap) => {
    if (!snap.exists()) return;
    currentUser = buildUserObject(key, snap.val());
    notifyChange();
  });
}

export function initUserSystem(database, onChange) {
  dbRef = database;
  onUserChangeCallback = onChange;
}

export function getCurrentUser() {
  return currentUser;
}

export async function restoreSession() {
  if (!dbRef) { notifyChange(); return null; }

  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(SESSION_KEY) || "null"); } catch (_) {}
  if (!saved || !saved.key || !saved.pinHash) { notifyChange(); return null; }

  try {
    const snap = await withTimeout(get(ref(dbRef, `users/${saved.key}`)));
    if (snap.exists() && snap.val().pinHash === saved.pinHash) {
      currentUser = buildUserObject(saved.key, snap.val());
      notifyChange();
      subscribeUser(saved.key);
      return currentUser;
    }
  } catch (err) {
    console.error("Erro ao restaurar sessão:", err);
  }

  clearSession();
  currentUser = null;
  notifyChange();
  return null;
}

export async function registerUser(username, pin) {
  if (!dbRef) throw new Error("Firebase não configurado.");
  const { displayName, key } = validateCredentials(username, pin);
  const pinHash = await hashPin(key, pin);
  const userRef = ref(dbRef, `users/${key}`);

  try {
    const existingSnap = await withTimeout(get(userRef));
    if (existingSnap.exists()) throw new Error("Esse username já existe. Escolhe outro ou faz Login.");

    const record = {
      username: displayName,
      pinHash,
      balance: INITIAL_BALANCE,
      handsPlayed: 0,
      handsWon: 0,
      foldsCount: 0,
      allInsCount: 0,
      raisesCount: 0,
      callsCount: 0,
      checksCount: 0,
      biggestWin: 0,
      currentStreak: 0,
      bestStreak: 0,
      createdAt: Date.now()
    };

    await withTimeout(set(userRef, record));
    currentUser = buildUserObject(key, record);
    saveSession(key, pinHash);
    notifyChange();
    subscribeUser(key);
    return currentUser;
  } catch (err) {
    throw formatFirebaseError(err);
  }
}

export async function loginUser(username, pin) {
  if (!dbRef) throw new Error("Firebase não configurado.");
  const { key } = validateCredentials(username, pin);
  const pinHash = await hashPin(key, pin);

  try {
    const snap = await withTimeout(get(ref(dbRef, `users/${key}`)));
    if (!snap.exists()) throw new Error("Utilizador não encontrado. Toca em 'Criar Conta' acima.");
    const data = snap.val();
    if (data.pinHash !== pinHash) throw new Error("Password de 4 números incorreta.");

    currentUser = buildUserObject(key, data);
    saveSession(key, pinHash);
    notifyChange();
    subscribeUser(key);
    return currentUser;
  } catch (err) {
    throw formatFirebaseError(err);
  }
}

export function logoutUser() {
  if (unsubscribeUser) { unsubscribeUser(); unsubscribeUser = null; }
  currentUser = null;
  clearSession();
  notifyChange();
}

export async function recordActionStats({ fold = 0, allIn = 0, raise = 0, call = 0, check = 0 } = {}) {
  if (!dbRef || !currentUser || !currentUser.key) return;
  if (!fold && !allIn && !raise && !call && !check) return;

  const userRef = ref(dbRef, `users/${currentUser.key}`);
  try {
    await runTransaction(userRef, (data) => {
      if (!data) return data;
      if (fold)  data.foldsCount  = (Number(data.foldsCount) || 0) + fold;
      if (allIn) data.allInsCount = (Number(data.allInsCount) || 0) + allIn;
      if (raise) data.raisesCount = (Number(data.raisesCount) || 0) + raise;
      if (call)  data.callsCount  = (Number(data.callsCount) || 0) + call;
      if (check) data.checksCount = (Number(data.checksCount) || 0) + check;
      return data;
    });
  } catch (err) {
    console.error("Erro ao gravar estatística de ação:", err);
  }
}

export async function applyBalanceDelta(delta, { won = false, countHand = true } = {}) {
  if (!dbRef || !currentUser || !currentUser.key) return;
  const safeDelta = Math.round(Number(delta) || 0);
  if (safeDelta === 0 && !countHand) return;

  const userRef = ref(dbRef, `users/${currentUser.key}`);
  try {
    await runTransaction(userRef, (data) => {
      if (!data) return data;
      const prevBal = Number(data.balance) || 0;
      data.balance = Math.max(0, prevBal + safeDelta);
      if (countHand) {
        data.handsPlayed = (Number(data.handsPlayed) || 0) + 1;
        if (won) {
          data.handsWon = (Number(data.handsWon) || 0) + 1;
          const nextStreak = (Number(data.currentStreak) || 0) + 1;
          data.currentStreak = nextStreak;
          data.bestStreak = Math.max(Number(data.bestStreak) || 0, nextStreak);
        } else {
          data.currentStreak = 0;
        }
      }
      if (safeDelta > 0) {
        data.biggestWin = Math.max(Number(data.biggestWin) || 0, safeDelta);
      }
      return data;
    });
  } catch (err) {
    try {
      const snap = await get(userRef);
      if (!snap.exists()) return;
      const d = snap.val();
      const nextStreak = countHand ? (won ? (Number(d.currentStreak) || 0) + 1 : 0) : (Number(d.currentStreak) || 0);
      await update(userRef, {
        balance: Math.max(0, (Number(d.balance) || 0) + safeDelta),
        handsPlayed: countHand ? (Number(d.handsPlayed) || 0) + 1 : (Number(d.handsPlayed) || 0),
        handsWon: countHand && won ? (Number(d.handsWon) || 0) + 1 : (Number(d.handsWon) || 0),
        currentStreak: nextStreak,
        bestStreak: Math.max(Number(d.bestStreak) || 0, nextStreak),
        biggestWin: safeDelta > 0 ? Math.max(Number(d.biggestWin) || 0, safeDelta) : (Number(d.biggestWin) || 0)
      });
    } catch (err2) {
      console.error("Erro ao atualizar saldo:", err2);
    }
  }
}

/* === FIM DO FICHEIRO user.js === */
