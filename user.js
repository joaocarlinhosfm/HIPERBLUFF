import { ref, get, onValue, runTransaction } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

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

async function hashPin(userKey, pin) {
  const raw = `hiperbluff_salt_${userKey}_${pin}`;
  if (window.crypto && window.crypto.subtle) {
    const encoded = new TextEncoder().encode(raw);
    const digest = await window.crypto.subtle.digest("SHA-256", encoded);
    return Array.from(new Uint8Array(digest))
      .map(b => b.toString(16).padStart(2, "0"))
      .join("");
  }
  // Fallback simples caso abra fora de HTTPS/localhost
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
  if (key.length < 2) {
    throw new Error("Usa pelo menos 2 letras ou números no username.");
  }
  if (!/^\d{4}$/.test(String(pin || ""))) {
    throw new Error("A password deve ter exatamente 4 números.");
  }
  return { displayName, key };
}

function withTimeout(promise, ms = 10000) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Sem resposta do Firebase. Verifica a ligação ou as regras da base de dados.")), ms)
    )
  ]);
}

function notifyChange() {
  if (typeof onUserChangeCallback === "function") {
    onUserChangeCallback(currentUser);
  }
}

function saveSession(key, pinHash) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify({ key, pinHash }));
  } catch (_) {}
}

function clearSession() {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch (_) {}
}

function subscribeUser(key) {
  if (unsubscribeUser) {
    unsubscribeUser();
    unsubscribeUser = null;
  }
  if (!dbRef || !key) return;

  unsubscribeUser = onValue(ref(dbRef, `users/${key}`), (snap) => {
    if (!snap.exists()) {
      logoutUser();
      return;
    }
    const data = snap.val();
    currentUser = {
      key,
      username: data.username || key,
      balance: Math.max(0, Number(data.balance) || 0),
      handsPlayed: Number(data.handsPlayed) || 0,
      handsWon: Number(data.handsWon) || 0
    };
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
  if (!dbRef) {
    notifyChange();
    return null;
  }

  let saved = null;
  try {
    saved = JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
  } catch (_) {}

  if (!saved || !saved.key || !saved.pinHash) {
    notifyChange();
    return null;
  }

  try {
    const snap = await withTimeout(get(ref(dbRef, `users/${saved.key}`)));
    if (snap.exists() && snap.val().pinHash === saved.pinHash) {
      const data = snap.val();
      currentUser = {
        key: saved.key,
        username: data.username || saved.key,
        balance: Math.max(0, Number(data.balance) || 0),
        handsPlayed: Number(data.handsPlayed) || 0,
        handsWon: Number(data.handsWon) || 0
      };
      subscribeUser(saved.key);
      notifyChange();
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
  const result = await withTimeout(
    runTransaction(userRef, (existing) => {
      if (existing !== null) return; // Aborta se o username já existir
      return {
        username: displayName,
        pinHash,
        balance: INITIAL_BALANCE,
        handsPlayed: 0,
        handsWon: 0,
        createdAt: Date.now()
      };
    })
  );

  if (!result.committed) {
    throw new Error("Esse username já existe. Escolhe outro ou faz Login.");
  }

  const data = result.snapshot.val();
  currentUser = {
    key,
    username: data.username,
    balance: Number(data.balance) || INITIAL_BALANCE,
    handsPlayed: 0,
    handsWon: 0
  };

  saveSession(key, pinHash);
  subscribeUser(key);
  notifyChange();
  return currentUser;
}

export async function loginUser(username, pin) {
  if (!dbRef) throw new Error("Firebase não configurado.");
  const { key } = validateCredentials(username, pin);
  const pinHash = await hashPin(key, pin);

  const snap = await withTimeout(get(ref(dbRef, `users/${key}`)));
  if (!snap.exists()) {
    throw new Error("Utilizador não encontrado. Cria conta primeiro.");
  }

  const data = snap.val();
  if (data.pinHash !== pinHash) {
    throw new Error("Password de 4 números incorreta.");
  }

  currentUser = {
    key,
    username: data.username || key,
    balance: Math.max(0, Number(data.balance) || 0),
    handsPlayed: Number(data.handsPlayed) || 0,
    handsWon: Number(data.handsWon) || 0
  };

  saveSession(key, pinHash);
  subscribeUser(key);
  notifyChange();
  return currentUser;
}

export function logoutUser() {
  if (unsubscribeUser) {
    unsubscribeUser();
    unsubscribeUser = null;
  }
  currentUser = null;
  clearSession();
  notifyChange();
}

/**
 * Atualiza o saldo do utilizador de forma atómica no Firebase após cada mão.
 * delta pode ser positivo (lucro) ou negativo (perda).
 */
export async function applyBalanceDelta(delta, { won = false, countHand = true } = {}) {
  if (!dbRef || !currentUser || !currentUser.key) return;
  const safeDelta = Math.round(Number(delta) || 0);
  if (safeDelta === 0 && !countHand) return;

  const userRef = ref(dbRef, `users/${currentUser.key}`);
  try {
    await runTransaction(userRef, (data) => {
      if (!data) return data;
      const prevBalance = Number(data.balance) || 0;
      data.balance = Math.max(0, prevBalance + safeDelta);
      if (countHand) {
        data.handsPlayed = (Number(data.handsPlayed) || 0) + 1;
        if (won) data.handsWon = (Number(data.handsWon) || 0) + 1;
      }
      return data;
    });
  } catch (err) {
    console.error("Erro ao atualizar saldo do utilizador:", err);
  }
}
