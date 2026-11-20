import { ref, get, set, update, onValue, runTransaction } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

export const INITIAL_BALANCE = 100000;
const SESSION_KEY = "hiperbluff_session_v1";

export const AVATAR_CATALOG = [
  /* --- AVATARES ORIGINAIS (12) --- */
  {
    id: "initial",
    name: "Inicial",
    bg: "linear-gradient(135deg, #38bdf8, #1d4ed8)",
    svg: ""
  },
  {
    id: "shark",
    name: "Tubarão",
    bg: "linear-gradient(135deg, #0284c7, #082f49)",
    svg: `<svg viewBox="0 0 100 100" aria-hidden="true">
      <path d="M50 10 C70 28 80 56 80 86 L20 86 C20 56 30 28 50 10 Z" fill="#64748b"/>
      <path d="M50 14 C64 30 70 55 70 86 L50 86 Z" fill="#475569"/>
      <path d="M28 62 Q50 52 72 62 L68 86 L32 86 Z" fill="#e2e8f0"/>
      <rect x="27" y="42" width="20" height="11" rx="4" fill="#0f172a"/>
      <rect x="53" y="42" width="20" height="11" rx="4" fill="#0f172a"/>
      <rect x="46" y="45" width="8" height="3" fill="#0f172a"/>
      <path d="M31 45 L42 45" stroke="#38bdf8" stroke-width="2" stroke-linecap="round"/>
      <path d="M57 45 L68 45" stroke="#38bdf8" stroke-width="2" stroke-linecap="round"/>
      <path d="M34 69 Q50 79 66 69 L63 75 Q50 83 37 75 Z" fill="#0f172a"/>
      <path d="M39 70 L42 75 L45 71 L50 76 L55 71 L58 75 L61 70" fill="none" stroke="#ffffff" stroke-width="2" stroke-linejoin="round"/>
    </svg>`
  },
  {
    id: "wolf",
    name: "Lobo Gelo",
    bg: "linear-gradient(135deg, #0ea5e9, #0f172a)",
    svg: `<svg viewBox="0 0 100 100" aria-hidden="true">
      <polygon points="22,46 28,16 44,34" fill="#cbd5e1"/>
      <polygon points="78,46 72,16 56,34" fill="#cbd5e1"/>
      <polygon points="27,42 30,24 40,35" fill="#38bdf8"/>
      <polygon points="73,42 70,24 60,35" fill="#38bdf8"/>
      <polygon points="22,44 50,28 78,44 70,76 50,88 30,76" fill="#e2e8f0"/>
      <polygon points="50,28 78,44 70,76 50,88" fill="#cbd5e1"/>
      <polygon points="35,54 50,62 65,54 58,82 50,88 42,82" fill="#f8fafc"/>
      <polygon points="32,48 44,52 36,55" fill="#0ea5e9"/>
      <polygon points="68,48 56,52 64,55" fill="#0ea5e9"/>
      <polygon points="44,72 56,72 50,79" fill="#0f172a"/>
    </svg>`
  },
  {
    id: "pro",
    name: "Poker Pro",
    bg: "linear-gradient(135deg, #059669, #022c22)",
    svg: `<svg viewBox="0 0 100 100" aria-hidden="true">
      <path d="M18 92 C20 66 34 58 50 58 C66 58 80 66 82 92 Z" fill="#0f172a"/>
      <path d="M26 52 C24 22 76 22 74 52 C74 62 68 68 62 70 L38 70 C32 68 26 62 26 52 Z" fill="#1e293b"/>
      <ellipse cx="50" cy="49" rx="19" ry="21" fill="#fed7aa"/>
      <path d="M30 40 C34 26 66 26 70 40 Z" fill="#0f172a"/>
      <rect x="33" y="42" width="15" height="9" rx="3" fill="#020617"/>
      <rect x="52" y="42" width="15" height="9" rx="3" fill="#020617"/>
      <rect x="47" y="45" width="6" height="2.5" fill="#020617"/>
      <path d="M36 45 L44 45" stroke="#34d399" stroke-width="1.8" stroke-linecap="round"/>
      <path d="M55 45 L63 45" stroke="#34d399" stroke-width="1.8" stroke-linecap="round"/>
      <path d="M43 59 Q51 63 58 58" fill="none" stroke="#9a3412" stroke-width="2.2" stroke-linecap="round"/>
    </svg>`
  },
  {
    id: "king",
    name: "Rei",
    bg: "linear-gradient(135deg, #d97706, #450a0a)",
    svg: `<svg viewBox="0 0 100 100" aria-hidden="true">
      <path d="M18 68 L24 32 L40 48 L50 22 L60 48 L76 32 L82 68 Z" fill="#fbbf24"/>
      <path d="M50 22 L60 48 L76 32 L82 68 L50 68 Z" fill="#f59e0b"/>
      <rect x="18" y="66" width="64" height="12" rx="4" fill="#d97706"/>
      <circle cx="24" cy="30" r="4.5" fill="#fef08a"/>
      <circle cx="50" cy="20" r="5.5" fill="#fef08a"/>
      <circle cx="76" cy="30" r="4.5" fill="#fef08a"/>
      <circle cx="34" cy="72" r="3" fill="#38bdf8"/>
      <circle cx="50" cy="72" r="3.5" fill="#ef4444"/>
      <circle cx="66" cy="72" r="3" fill="#38bdf8"/>
      <text x="50" y="60" text-anchor="middle" font-size="22" font-weight="900" fill="#450a0a">♠</text>
    </svg>`
  },
  {
    id: "queen",
    name: "Rainha",
    bg: "linear-gradient(135deg, #db2777, #3b0764)",
    svg: `<svg viewBox="0 0 100 100" aria-hidden="true">
      <path d="M22 68 L28 38 L42 50 L50 26 L58 50 L72 38 L78 68 Z" fill="#fde047"/>
      <path d="M50 26 L58 50 L72 38 L78 68 L50 68 Z" fill="#eab308"/>
      <rect x="22" y="66" width="56" height="10" rx="5" fill="#ca8a04"/>
      <polygon points="50,15 55,23 50,30 45,23" fill="#f43f5e"/>
      <circle cx="28" cy="36" r="4" fill="#e0f2fe"/>
      <circle cx="72" cy="36" r="4" fill="#e0f2fe"/>
      <text x="50" y="61" text-anchor="middle" font-size="21" font-weight="900" fill="#be123c">♥</text>
    </svg>`
  },
  {
    id: "joker",
    name: "Joker",
    bg: "linear-gradient(135deg, #7c3aed, #1e1b4b)",
    svg: `<svg viewBox="0 0 100 100" aria-hidden="true">
      <path d="M50 42 C36 22 18 22 14 38 C24 36 32 42 36 52 Z" fill="#ef4444"/>
      <path d="M50 42 C64 22 82 22 86 38 C76 36 68 42 64 52 Z" fill="#22c55e"/>
      <path d="M36 50 C42 26 58 26 64 50 Z" fill="#f59e0b"/>
      <circle cx="14" cy="39" r="5" fill="#fde047"/>
      <circle cx="86" cy="39" r="5" fill="#fde047"/>
      <circle cx="50" cy="24" r="5" fill="#fde047"/>
      <ellipse cx="50" cy="61" rx="22" ry="20" fill="#f8fafc"/>
      <polygon points="38,54 44,58 38,62 34,58" fill="#7c3aed"/>
      <polygon points="62,54 66,58 62,62 56,58" fill="#7c3aed"/>
      <path d="M37 68 Q50 79 63 68" fill="none" stroke="#dc2626" stroke-width="3.5" stroke-linecap="round"/>
    </svg>`
  },
  {
    id: "cowboy",
    name: "Cowboy",
    bg: "linear-gradient(135deg, #b45309, #271206)",
    svg: `<svg viewBox="0 0 100 100" aria-hidden="true">
      <ellipse cx="50" cy="54" rx="20" ry="22" fill="#fed7aa"/>
      <path d="M30 58 L70 58 L50 86 Z" fill="#b91c1c"/>
      <path d="M34 62 L66 62" stroke="#fca5a5" stroke-width="2" stroke-dasharray="4 3"/>
      <ellipse cx="50" cy="40" rx="36" ry="8" fill="#78350f"/>
      <path d="M29 40 C31 20 42 18 50 23 C58 18 69 20 71 40 Z" fill="#92400e"/>
      <rect x="30" y="34" width="40" height="5" fill="#f59e0b"/>
      <circle cx="42" cy="50" r="2.6" fill="#0f172a"/>
      <circle cx="58" cy="50" r="2.6" fill="#0f172a"/>
      <polygon points="50,65 52,70 57,70 53,73 54,78 50,75 46,78 47,73 43,70 48,70" fill="#fde047"/>
    </svg>`
  },
  {
    id: "fox",
    name: "Raposa",
    bg: "linear-gradient(135deg, #ea580c, #1c1917)",
    svg: `<svg viewBox="0 0 100 100" aria-hidden="true">
      <polygon points="22,46 26,18 46,34" fill="#f97316"/>
      <polygon points="78,46 74,18 54,34" fill="#f97316"/>
      <polygon points="27,41 29,25 41,35" fill="#431407"/>
      <polygon points="73,41 71,25 59,35" fill="#431407"/>
      <polygon points="20,46 50,30 80,46 68,78 50,86 32,78" fill="#f97316"/>
      <polygon points="20,46 38,58 50,86 32,78" fill="#fff7ed"/>
      <polygon points="80,46 62,58 50,86 68,78" fill="#fff7ed"/>
      <ellipse cx="38" cy="52" rx="3.2" ry="3.8" fill="#0f172a"/>
      <ellipse cx="62" cy="52" rx="3.2" ry="3.8" fill="#0f172a"/>
      <circle cx="37" cy="51" r="1.2" fill="#ffffff"/>
      <circle cx="61" cy="51" r="1.2" fill="#ffffff"/>
      <polygon points="45,74 55,74 50,81" fill="#0f172a"/>
    </svg>`
  },
  {
    id: "cyber",
    name: "Cyber",
    bg: "linear-gradient(135deg, #2563eb, #090d26)",
    svg: `<svg viewBox="0 0 100 100" aria-hidden="true">
      <rect x="48" y="14" width="4" height="12" fill="#94a3b8"/>
      <circle cx="50" cy="13" r="4.5" fill="#38bdf8"/>
      <rect x="24" y="26" width="52" height="50" rx="16" fill="#cbd5e1"/>
      <rect x="50" y="26" width="26" height="50" rx="12" fill="#94a3b8"/>
      <rect x="30" y="39" width="40" height="16" rx="8" fill="#0f172a"/>
      <rect x="35" y="44" width="30" height="6" rx="3" fill="#38bdf8"/>
      <rect x="38" y="63" width="24" height="5" rx="2.5" fill="#334155"/>
      <circle cx="22" cy="50" r="5" fill="#64748b"/>
      <circle cx="78" cy="50" r="5" fill="#64748b"/>
    </svg>`
  },
  {
    id: "vip",
    name: "VIP",
    bg: "linear-gradient(135deg, #1e293b, #020617)",
    svg: `<svg viewBox="0 0 100 100" aria-hidden="true">
      <polygon points="28,28 72,28 84,46 50,84 16,46" fill="#38bdf8"/>
      <polygon points="28,28 72,28 62,46 38,46" fill="#e0f2fe"/>
      <polygon points="16,46 38,46 50,84" fill="#0284c7"/>
      <polygon points="84,46 62,46 50,84" fill="#0369a1"/>
      <polygon points="38,46 62,46 50,84" fill="#7dd3fc"/>
      <polygon points="20,24 22,29 27,31 22,33 20,38 18,33 13,31 18,29" fill="#fde047"/>
      <polygon points="80,18 81.5,22 85.5,23.5 81.5,25 80,29 78.5,25 74.5,23.5 78.5,22" fill="#fde047"/>
    </svg>`
  },
  {
    id: "cat",
    name: "Gato",
    bg: "linear-gradient(135deg, #0d9488, #042f2e)",
    svg: `<svg viewBox="0 0 100 100" aria-hidden="true">
      <polygon points="24,46 28,20 44,34" fill="#0f172a"/>
      <polygon points="76,46 72,20 56,34" fill="#0f172a"/>
      <polygon points="29,40 31,27 40,35" fill="#fb7185"/>
      <polygon points="71,40 69,27 60,35" fill="#fb7185"/>
      <circle cx="50" cy="54" r="25" fill="#0f172a"/>
      <ellipse cx="40" cy="51" rx="5" ry="6" fill="#fde047"/>
      <ellipse cx="60" cy="51" rx="5" ry="6" fill="#fde047"/>
      <ellipse cx="40" cy="51" rx="2" ry="5" fill="#0f172a"/>
      <ellipse cx="60" cy="51" rx="2" ry="5" fill="#0f172a"/>
      <polygon points="47,60 53,60 50,64" fill="#fb7185"/>
      <polygon points="38,77 50,82 38,87" fill="#ef4444"/>
      <polygon points="62,77 50,82 62,87" fill="#ef4444"/>
      <circle cx="50" cy="82" r="3" fill="#fde047"/>
    </svg>`
  },

  /* --- AVATARES FRIO, CLIMATIZAÇÃO & DANFOSS (17) --- */
  {
    id: "kp",
    name: "Pressostato",
    bg: "linear-gradient(135deg, #b91c1c, #18181b)",
    svg: `<svg viewBox="0 0 100 100" aria-hidden="true">
      <rect x="44" y="13" width="12" height="9" rx="2" fill="#e2e8f0"/>
      <rect x="40" y="18" width="20" height="5" rx="1.5" fill="#94a3b8"/>
      <rect x="27" y="23" width="46" height="54" rx="5" fill="#cbd5e1"/>
      <rect x="50" y="23" width="23" height="54" rx="5" fill="#94a3b8"/>
      <rect x="27" y="23" width="46" height="15" rx="4" fill="#dc2626"/>
      <text x="50" y="34" text-anchor="middle" font-size="9.5" font-weight="900" fill="#ffffff">KP</text>
      <rect x="35" y="43" width="12" height="27" rx="2" fill="#0f172a"/>
      <rect x="37" y="45" width="8" height="23" rx="1" fill="#f8fafc"/>
      <line x1="38" y1="49" x2="43" y2="49" stroke="#334155" stroke-width="1.5"/>
      <line x1="38" y1="54" x2="43" y2="54" stroke="#334155" stroke-width="1.5"/>
      <line x1="38" y1="59" x2="43" y2="59" stroke="#334155" stroke-width="1.5"/>
      <line x1="38" y1="64" x2="43" y2="64" stroke="#334155" stroke-width="1.5"/>
      <polygon points="48,51 55,48 55,54" fill="#dc2626"/>
      <rect x="57" y="43" width="10" height="27" rx="2" fill="#1e293b"/>
      <rect x="59" y="54" width="6" height="12" rx="1" fill="#dc2626"/>
      <rect x="44" y="77" width="12" height="10" rx="2" fill="#d97706"/>
      <rect x="41" y="81" width="18" height="4" rx="1" fill="#f59e0b"/>
    </svg>`
  },
  {
    id: "dml",
    name: "Filtro DML",
    bg: "linear-gradient(135deg, #1e3a8a, #090d16)",
    svg: `<svg viewBox="0 0 100 100" aria-hidden="true">
      <g transform="rotate(-32 50 50)">
        <rect x="9" y="45" width="16" height="10" rx="2" fill="#d97706"/>
        <rect x="75" y="45" width="16" height="10" rx="2" fill="#d97706"/>
        <rect x="20" y="42" width="7" height="16" rx="2" fill="#f59e0b"/>
        <rect x="73" y="42" width="7" height="16" rx="2" fill="#f59e0b"/>
        <rect x="25" y="31" width="50" height="38" rx="12" fill="#2563eb"/>
        <rect x="25" y="50" width="50" height="19" rx="10" fill="#1d4ed8"/>
        <rect x="29" y="35" width="42" height="6" rx="3" fill="#60a5fa" opacity="0.65"/>
        <rect x="33" y="44" width="34" height="14" rx="3" fill="#f8fafc"/>
        <text x="50" y="53.5" text-anchor="middle" font-size="9.5" font-weight="900" fill="#1e3a8a">DML</text>
        <path d="M39 63 L57 63 M53 60 L58 63 L53 66" fill="none" stroke="#fef08a" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
      </g>
    </svg>`
  },
  {
    id: "txv",
    name: "Válvula T2",
    bg: "linear-gradient(135deg, #92400e, #18181b)",
    svg: `<svg viewBox="0 0 100 100" aria-hidden="true">
      <path d="M58 29 C80 26 84 48 74 58 C64 68 78 76 74 83" fill="none" stroke="#fb923c" stroke-width="3" stroke-linecap="round"/>
      <rect x="69" y="74" width="10" height="14" rx="5" fill="#ea580c" stroke="#fed7aa" stroke-width="1.2"/>
      <ellipse cx="46" cy="28" rx="18" ry="8" fill="#cbd5e1"/>
      <path d="M28 28 C28 19 64 19 64 28 Z" fill="#e2e8f0"/>
      <rect x="41" y="34" width="10" height="12" fill="#94a3b8"/>
      <rect x="34" y="45" width="24" height="22" rx="4" fill="#d97706"/>
      <rect x="21" y="50" width="15" height="12" rx="2" fill="#f59e0b"/>
      <rect x="17" y="47" width="6" height="18" rx="2" fill="#b45309"/>
      <rect x="40" y="67" width="12" height="16" rx="2" fill="#f59e0b"/>
      <rect x="37" y="79" width="18" height="6" rx="2" fill="#b45309"/>
      <circle cx="46" cy="56" r="5" fill="#92400e"/>
      <circle cx="46" cy="56" r="2.2" fill="#fef08a"/>
    </svg>`
  },
  {
    id: "sightglass",
    name: "Visor DRY",
    bg: "linear-gradient(135deg, #a16207, #0f172a)",
    svg: `<svg viewBox="0 0 100 100" aria-hidden="true">
      <polygon points="50,14 78,29 78,71 50,86 22,71 22,29" fill="#d97706"/>
      <polygon points="50,14 78,29 78,71 50,86" fill="#b45309"/>
      <circle cx="50" cy="50" r="25" fill="#f59e0b"/>
      <circle cx="50" cy="50" r="21" fill="#0f172a"/>
      <circle cx="50" cy="50" r="18" fill="#22c55e"/>
      <circle cx="50" cy="50" r="12" fill="#4ade80"/>
      <ellipse cx="43" cy="40" rx="6" ry="3.2" transform="rotate(-28 43 40)" fill="#ffffff" opacity="0.65"/>
      <text x="50" y="54" text-anchor="middle" font-size="11" font-weight="900" fill="#052e16">DRY</text>
    </svg>`
  },
  {
    id: "bitzer",
    name: "Compressor",
    bg: "linear-gradient(135deg, #166534, #052e16)",
    svg: `<svg viewBox="0 0 100 100" aria-hidden="true">
      <rect x="20" y="72" width="60" height="8" rx="2" fill="#0f172a"/>
      <rect x="17" y="40" width="38" height="33" rx="14" fill="#16a34a"/>
      <rect x="17" y="56" width="38" height="17" rx="8" fill="#15803d"/>
      <rect x="44" y="34" width="34" height="39" rx="5" fill="#22c55e"/>
      <rect x="52" y="34" width="26" height="39" rx="5" fill="#16a34a"/>
      <rect x="48" y="24" width="24" height="12" rx="2.5" fill="#15803d"/>
      <line x1="52" y1="26" x2="52" y2="34" stroke="#86efac" stroke-width="1.8"/>
      <line x1="57" y1="26" x2="57" y2="34" stroke="#86efac" stroke-width="1.8"/>
      <line x1="62" y1="26" x2="62" y2="34" stroke="#86efac" stroke-width="1.8"/>
      <line x1="67" y1="26" x2="67" y2="34" stroke="#86efac" stroke-width="1.8"/>
      <rect x="25" y="25" width="18" height="16" rx="3" fill="#1e293b"/>
      <rect x="28" y="29" width="12" height="4" rx="1" fill="#4ade80"/>
      <circle cx="64" cy="57" r="7" fill="#0f172a"/>
      <circle cx="64" cy="57" r="4" fill="#fde047"/>
      <circle cx="24" cy="54" r="3" fill="#86efac"/>
    </svg>`
  },
  {
    id: "fan",
    name: "Ventilador",
    bg: "linear-gradient(135deg, #0284c7, #082f49)",
    svg: `<svg viewBox="0 0 100 100" aria-hidden="true">
      <circle cx="50" cy="50" r="37" fill="#0f172a" stroke="#38bdf8" stroke-width="3"/>
      <path d="M50 50 C44 26 56 17 66 25 C72 30 62 44 50 50 Z" fill="#7dd3fc"/>
      <path d="M50 50 C74 44 83 56 75 66 C70 72 56 62 50 50 Z" fill="#38bdf8"/>
      <path d="M50 50 C56 74 44 83 34 75 C28 70 38 56 50 50 Z" fill="#7dd3fc"/>
      <path d="M50 50 C26 56 17 44 25 34 C30 28 44 38 50 50 Z" fill="#38bdf8"/>
      <circle cx="50" cy="50" r="28" fill="none" stroke="#e0f2fe" stroke-width="1.4" opacity="0.55"/>
      <circle cx="50" cy="50" r="18" fill="none" stroke="#e0f2fe" stroke-width="1.4" opacity="0.55"/>
      <line x1="14" y1="50" x2="86" y2="50" stroke="#e0f2fe" stroke-width="1.4" opacity="0.45"/>
      <line x1="50" y1="14" x2="50" y2="86" stroke="#e0f2fe" stroke-width="1.4" opacity="0.45"/>
      <circle cx="50" cy="50" r="9" fill="#1e293b" stroke="#bae6fd" stroke-width="2"/>
      <circle cx="50" cy="50" r="3.2" fill="#38bdf8"/>
    </svg>`
  },
  {
    id: "testo",
    name: "Digital 550s",
    bg: "linear-gradient(135deg, #ea580c, #18181b)",
    svg: `<svg viewBox="0 0 100 100" aria-hidden="true">
      <rect x="24" y="18" width="52" height="58" rx="9" fill="#f97316"/>
      <rect x="28" y="21" width="44" height="52" rx="6" fill="#1e293b"/>
      <rect x="32" y="26" width="36" height="23" rx="3" fill="#e0f2fe"/>
      <text x="50" y="38" text-anchor="middle" font-size="11.5" font-weight="900" fill="#0f172a">-25°C</text>
      <text x="50" y="46.5" text-anchor="middle" font-size="6.8" font-weight="800" fill="#0284c7">12.4 BAR</text>
      <circle cx="38" cy="60" r="7" fill="#2563eb" stroke="#93c5fd" stroke-width="1.5"/>
      <circle cx="62" cy="60" r="7" fill="#dc2626" stroke="#fca5a5" stroke-width="1.5"/>
      <rect x="46" y="56" width="8" height="8" rx="2" fill="#f97316"/>
      <rect x="33" y="76" width="6" height="10" rx="1.5" fill="#d97706"/>
      <rect x="47" y="76" width="6" height="10" rx="1.5" fill="#facc15"/>
      <rect x="61" y="76" width="6" height="10" rx="1.5" fill="#d97706"/>
    </svg>`
  },
  {
    id: "manifold",
    name: "Manifold",
    bg: "linear-gradient(135deg, #1d4ed8, #7f1d1d)",
    svg: `<svg viewBox="0 0 100 100" aria-hidden="true">
      <path d="M35 72 L35 88" stroke="#38bdf8" stroke-width="4.5" stroke-linecap="round"/>
      <path d="M50 72 L50 88" stroke="#facc15" stroke-width="4.5" stroke-linecap="round"/>
      <path d="M65 72 L65 88" stroke="#ef4444" stroke-width="4.5" stroke-linecap="round"/>
      <rect x="29" y="56" width="42" height="15" rx="3" fill="#d97706"/>
      <circle cx="24" cy="63" r="6" fill="#2563eb" stroke="#bae6fd" stroke-width="1.5"/>
      <circle cx="76" cy="63" r="6" fill="#dc2626" stroke="#fecaca" stroke-width="1.5"/>
      <circle cx="34" cy="36" r="17" fill="#2563eb" stroke="#bae6fd" stroke-width="2"/>
      <circle cx="34" cy="36" r="13" fill="#f8fafc"/>
      <path d="M25 39 A9 9 0 0 1 43 39" fill="none" stroke="#38bdf8" stroke-width="2.5"/>
      <line x1="34" y1="36" x2="27" y2="28" stroke="#0f172a" stroke-width="2.2" stroke-linecap="round"/>
      <circle cx="34" cy="36" r="2.2" fill="#0f172a"/>
      <circle cx="66" cy="36" r="17" fill="#dc2626" stroke="#fecaca" stroke-width="2"/>
      <circle cx="66" cy="36" r="13" fill="#f8fafc"/>
      <path d="M57 39 A9 9 0 0 1 75 39" fill="none" stroke="#ef4444" stroke-width="2.5"/>
      <line x1="66" y1="36" x2="74" y2="29" stroke="#dc2626" stroke-width="2.2" stroke-linecap="round"/>
      <circle cx="66" cy="36" r="2.2" fill="#0f172a"/>
    </svg>`
  },
  {
    id: "vacuum",
    name: "Bomba Vácuo",
    bg: "linear-gradient(135deg, #334155, #090d16)",
    svg: `<svg viewBox="0 0 100 100" aria-hidden="true">
      <path d="M34 33 L38 22 L66 22 L70 33" fill="none" stroke="#94a3b8" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
      <rect x="24" y="25" width="7" height="12" rx="1.5" fill="#f59e0b"/>
      <rect x="19" y="36" width="28" height="39" rx="5" fill="#1e293b"/>
      <rect x="44" y="39" width="37" height="34" rx="8" fill="#0284c7"/>
      <rect x="44" y="56" width="37" height="17" rx="6" fill="#0369a1"/>
      <line x1="51" y1="45" x2="75" y2="45" stroke="#7dd3fc" stroke-width="2" opacity="0.6"/>
      <line x1="51" y1="51" x2="75" y2="51" stroke="#7dd3fc" stroke-width="2" opacity="0.6"/>
      <line x1="51" y1="57" x2="75" y2="57" stroke="#7dd3fc" stroke-width="2" opacity="0.6"/>
      <circle cx="32" cy="56" r="8" fill="#0f172a" stroke="#cbd5e1" stroke-width="2"/>
      <path d="M25 58 A7 7 0 0 0 39 58 Z" fill="#f59e0b"/>
      <rect x="18" y="75" width="64" height="6" rx="2.5" fill="#0f172a"/>
    </svg>`
  },
  {
    id: "copper",
    name: "Cobre & Corte",
    bg: "linear-gradient(135deg, #c2410c, #1c1917)",
    svg: `<svg viewBox="0 0 100 100" aria-hidden="true">
      <circle cx="48" cy="54" r="26" fill="none" stroke="#b45309" stroke-width="11"/>
      <circle cx="48" cy="54" r="26" fill="none" stroke="#fb923c" stroke-width="6"/>
      <circle cx="48" cy="54" r="26" fill="none" stroke="#ffedd5" stroke-width="1.6" stroke-dasharray="16 28"/>
      <g transform="rotate(-35 60 44)">
        <rect x="44" y="25" width="26" height="18" rx="5" fill="#dc2626"/>
        <rect x="48" y="41" width="18" height="12" rx="3" fill="#e2e8f0"/>
        <circle cx="57" cy="48" r="5" fill="#64748b" stroke="#f8fafc" stroke-width="1.5"/>
        <rect x="54" y="13" width="6" height="13" fill="#cbd5e1"/>
        <rect x="48" y="9" width="18" height="7" rx="3" fill="#0f172a"/>
      </g>
    </svg>`
  },
  {
    id: "torch",
    name: "Maçarico",
    bg: "linear-gradient(135deg, #b45309, #270909)",
    svg: `<svg viewBox="0 0 100 100" aria-hidden="true">
      <path d="M62 24 L62 46 Q62 56 72 56 L86 56" fill="none" stroke="#d97706" stroke-width="12" stroke-linecap="round"/>
      <path d="M62 24 L62 46 Q62 56 72 56 L86 56" fill="none" stroke="#fdba74" stroke-width="4" stroke-linecap="round"/>
      <circle cx="64" cy="52" r="9" fill="#ef4444" opacity="0.65"/>
      <circle cx="64" cy="52" r="4.5" fill="#fef08a"/>
      <path d="M16 82 L39 62" stroke="#b45309" stroke-width="8" stroke-linecap="round"/>
      <path d="M35 65 L45 56" stroke="#f59e0b" stroke-width="6" stroke-linecap="round"/>
      <path d="M44 56 Q56 44 65 50 Q57 60 44 56 Z" fill="#f97316"/>
      <path d="M44 56 Q54 48 61 51 Q54 57 44 56 Z" fill="#38bdf8"/>
      <path d="M44 56 Q50 51 55 52 Q50 56 44 56 Z" fill="#ffffff"/>
      <circle cx="52" cy="34" r="2.2" fill="#fde047"/>
      <circle cx="76" cy="36" r="2" fill="#fde047"/>
      <circle cx="73" cy="70" r="2.4" fill="#fb923c"/>
    </svg>`
  },
  {
    id: "co2",
    name: "Garrafa CO₂",
    bg: "linear-gradient(135deg, #475569, #090d16)",
    svg: `<svg viewBox="0 0 100 100" aria-hidden="true">
      <circle cx="30" cy="80" r="10" fill="#bae6fd" opacity="0.32"/>
      <circle cx="70" cy="80" r="10" fill="#bae6fd" opacity="0.32"/>
      <circle cx="50" cy="84" r="12" fill="#e0f2fe" opacity="0.28"/>
      <rect x="44" y="14" width="12" height="5" rx="2" fill="#f59e0b"/>
      <rect x="47" y="18" width="6" height="9" fill="#d97706"/>
      <path d="M33 40 C33 27 67 27 67 40 L67 79 C67 83 63 85 50 85 C37 85 33 83 33 79 Z" fill="#94a3b8"/>
      <path d="M50 30 C61 30 67 34 67 40 L67 79 C67 83 63 85 50 85 Z" fill="#64748b"/>
      <path d="M33 40 C33 27 67 27 67 40 Z" fill="#475569"/>
      <rect x="33" y="48" width="34" height="19" fill="#0f172a"/>
      <text x="50" y="61.5" text-anchor="middle" font-size="12.5" font-weight="900" fill="#38bdf8">CO₂</text>
      <text x="50" y="76" text-anchor="middle" font-size="7.5" font-weight="800" fill="#f8fafc">R744</text>
    </svg>`
  },
  {
    id: "gas",
    name: "Garrafa R32",
    bg: "linear-gradient(135deg, #0e7490, #082f49)",
    svg: `<svg viewBox="0 0 100 100" aria-hidden="true">
      <path d="M35 28 L38 17 L62 17 L65 28" fill="none" stroke="#7dd3fc" stroke-width="4" stroke-linejoin="round"/>
      <rect x="46" y="19" width="8" height="8" rx="1.5" fill="#f59e0b"/>
      <rect x="42" y="15" width="16" height="4" rx="2" fill="#fbbf24"/>
      <rect x="28" y="28" width="44" height="54" rx="14" fill="#06b6d4"/>
      <rect x="50" y="28" width="22" height="54" rx="12" fill="#0891b2"/>
      <rect x="28" y="45" width="44" height="19" fill="#f8fafc"/>
      <text x="50" y="59" text-anchor="middle" font-size="14" font-weight="900" fill="#0e7490">R32</text>
      <text x="50" y="76" text-anchor="middle" font-size="10" fill="#e0f2fe">❄</text>
    </svg>`
  },
  {
    id: "hptrip",
    name: "Alarme HP",
    bg: "linear-gradient(135deg, #991b1b, #090d16)",
    svg: `<svg viewBox="0 0 100 100" aria-hidden="true">
      <line x1="50" y1="11" x2="50" y2="20" stroke="#fde047" stroke-width="3.5" stroke-linecap="round"/>
      <line x1="23" y1="22" x2="30" y2="29" stroke="#fde047" stroke-width="3.5" stroke-linecap="round"/>
      <line x1="77" y1="22" x2="70" y2="29" stroke="#fde047" stroke-width="3.5" stroke-linecap="round"/>
      <line x1="15" y1="45" x2="23" y2="45" stroke="#f87171" stroke-width="3.5" stroke-linecap="round"/>
      <line x1="77" y1="45" x2="85" y2="45" stroke="#f87171" stroke-width="3.5" stroke-linecap="round"/>
      <path d="M29 66 L29 44 C29 30 71 30 71 44 L71 66 Z" fill="#ef4444"/>
      <path d="M50 31 C62 31 71 36 71 44 L71 66 L50 66 Z" fill="#dc2626"/>
      <ellipse cx="42" cy="43" rx="5" ry="9" transform="rotate(14 42 43)" fill="#fecaca" opacity="0.55"/>
      <rect x="23" y="65" width="54" height="12" rx="4" fill="#1e293b"/>
      <rect x="29" y="77" width="42" height="6" rx="2" fill="#0f172a"/>
      <text x="50" y="57" text-anchor="middle" font-size="16" font-weight="900" fill="#ffffff">HP</text>
    </svg>`
  },
  {
    id: "thermo",
    name: "Temp -25°C",
    bg: "linear-gradient(135deg, #1e293b, #020617)",
    svg: `<svg viewBox="0 0 100 100" aria-hidden="true">
      <rect x="14" y="25" width="72" height="50" rx="8" fill="#334155" stroke="#64748b" stroke-width="2"/>
      <rect x="19" y="30" width="62" height="27" rx="4" fill="#020617"/>
      <text x="53" y="49" text-anchor="middle" font-size="18.5" font-weight="900" fill="#ef4444">-25°</text>
      <circle cx="26" cy="37" r="2.6" fill="#38bdf8"/>
      <circle cx="26" cy="48" r="2.2" fill="#22c55e"/>
      <rect x="22" y="62" width="11" height="7" rx="2" fill="#0f172a"/>
      <rect x="37" y="62" width="11" height="7" rx="2" fill="#0f172a"/>
      <rect x="52" y="62" width="11" height="7" rx="2" fill="#0f172a"/>
      <rect x="67" y="62" width="11" height="7" rx="2" fill="#dc2626"/>
    </svg>`
  },
  {
    id: "tech",
    name: "Técnico",
    bg: "linear-gradient(135deg, #0369a1, #0f172a)",
    svg: `<svg viewBox="0 0 100 100" aria-hidden="true">
      <path d="M18 92 C21 68 35 61 50 61 C65 61 79 68 82 92 Z" fill="#1e3a8a"/>
      <path d="M40 62 L50 78 L60 62 Z" fill="#e2e8f0"/>
      <rect x="44" y="55" width="12" height="10" rx="4" fill="#fed7aa"/>
      <ellipse cx="50" cy="48" rx="18" ry="19" fill="#fed7aa"/>
      <path d="M30 37 C32 21 68 21 70 37 Z" fill="#dc2626"/>
      <path d="M27 37 Q50 31 76 38 L72 42 Q50 37 29 41 Z" fill="#991b1b"/>
      <rect x="44" y="25" width="12" height="7" rx="2" fill="#ffffff"/>
      <rect x="33" y="42" width="15" height="9" rx="3" fill="#e0f2fe" stroke="#0f172a" stroke-width="2"/>
      <rect x="52" y="42" width="15" height="9" rx="3" fill="#e0f2fe" stroke="#0f172a" stroke-width="2"/>
      <line x1="48" y1="46" x2="52" y2="46" stroke="#0f172a" stroke-width="2"/>
      <circle cx="40.5" cy="46.5" r="2.2" fill="#0f172a"/>
      <circle cx="59.5" cy="46.5" r="2.2" fill="#0f172a"/>
      <path d="M43 57 Q50 62 57 57" fill="none" stroke="#9a3412" stroke-width="2.2" stroke-linecap="round"/>
      <circle cx="35" cy="79" r="5" fill="#2563eb" stroke="#bae6fd" stroke-width="1.5"/>
      <circle cx="65" cy="79" r="5" fill="#dc2626" stroke="#fecaca" stroke-width="1.5"/>
    </svg>`
  },
  {
    id: "penguin",
    name: "Pinguim",
    bg: "linear-gradient(135deg, #38bdf8, #0c4a6e)",
    svg: `<svg viewBox="0 0 100 100" aria-hidden="true">
      <ellipse cx="50" cy="60" rx="26" ry="28" fill="#0f172a"/>
      <ellipse cx="50" cy="64" rx="18" ry="21" fill="#f8fafc"/>
      <path d="M28 38 C30 20 70 20 72 38 Z" fill="#facc15"/>
      <rect x="24" y="36" width="52" height="6" rx="3" fill="#eab308"/>
      <rect x="46" y="22" width="8" height="14" rx="2" fill="#fde047"/>
      <circle cx="40" cy="49" r="4.2" fill="#ffffff"/>
      <circle cx="60" cy="49" r="4.2" fill="#ffffff"/>
      <circle cx="41" cy="49" r="2.1" fill="#0f172a"/>
      <circle cx="59" cy="49" r="2.1" fill="#0f172a"/>
      <polygon points="43,54 57,54 50,62" fill="#f97316"/>
      <g transform="rotate(28 76 66)">
        <rect x="73" y="54" width="5" height="24" rx="2" fill="#cbd5e1"/>
        <circle cx="75.5" cy="53" r="6" fill="#94a3b8"/>
        <rect x="73.5" y="46" width="4" height="7" fill="#0c4a6e"/>
      </g>
    </svg>`
  }
];

let dbRef = null;
let currentUser = null;
let unsubscribeUser = null;
let onUserChangeCallback = null;

export function getAvatarById(avatarId) {
  return AVATAR_CATALOG.find(a => a.id === avatarId) || AVATAR_CATALOG[0];
}

export function getAvatarMarkup(avatarId, fallbackName = "J") {
  const item = getAvatarById(avatarId);
  if (item.id === "initial" || !item.svg) {
    const clean = String(fallbackName || "J").trim().replace(/[<>&"']/g, "");
    const letter = (clean[0] || "J").toUpperCase();
    return `<div class="avatar-svg-wrap" style="background:${item.bg}"><span class="avatar-initial-letter">${letter}</span></div>`;
  }
  return `<div class="avatar-svg-wrap" style="background:${item.bg}">${item.svg}</div>`;
}

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
  const validAvatar = AVATAR_CATALOG.some(a => a.id === data.avatar) ? data.avatar : "initial";
  return {
    key,
    username: data.username || key,
    avatar: validAvatar,
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
      avatar: "initial",
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

export async function updateUserAvatar(avatarId) {
  if (!dbRef || !currentUser || !currentUser.key) return null;
  const chosen = getAvatarById(avatarId);
  currentUser = { ...currentUser, avatar: chosen.id };
  notifyChange();

  try {
    await withTimeout(update(ref(dbRef, `users/${currentUser.key}`), { avatar: chosen.id }));
    return currentUser;
  } catch (err) {
    console.error("Erro ao guardar avatar:", err);
    throw formatFirebaseError(err);
  }
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
