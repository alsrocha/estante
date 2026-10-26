// Código compartilhado entre a página e o service worker: banco local (IndexedDB), datas e o resumo diário.
const DB_NAME = "pendencias", DB_VER = 1;

function openDB() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, DB_VER);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains("items")) db.createObjectStore("items", { keyPath: "id" });
      if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta");
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
function tx(store, mode, fn) {
  return openDB().then(db => new Promise((res, rej) => {
    const t = db.transaction(store, mode), s = t.objectStore(store);
    const out = fn(s);
    t.oncomplete = () => res(out && "result" in out ? out.result : out);
    t.onerror = () => rej(t.error);
  }));
}
const DB = {
  all: () => tx("items", "readonly", s => s.getAll()),
  put: item => tx("items", "readwrite", s => { s.put(item); }),
  del: id => tx("items", "readwrite", s => { s.delete(id); }),
  clear: () => tx("items", "readwrite", s => { s.clear(); }),
  get: key => tx("meta", "readonly", s => s.get(key)),
  set: (key, val) => tx("meta", "readwrite", s => { s.put(val, key); }),
};

// Datas sempre como texto "aaaa-mm-dd" no horário local.
const pad = n => String(n).padStart(2, "0");
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseYmd = s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const addDays = (s, n) => { const d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d); };
const daysBetween = (a, b) => Math.round((parseYmd(b) - parseYmd(a)) / 86400000);
const mondayOf = s => { const d = parseYmd(s); const wd = (d.getDay() + 6) % 7; d.setDate(d.getDate() - wd); return ymd(d); };
const br = s => s ? s.split("-").reverse().join("/") : "";

const DEFAULT_SETTINGS = { time1: "08:00", time2On: false, time2: "19:00", notifyMeta: true, notifyLembrete: true, notifyAviso: true };
async function getSettings() { return Object.assign({}, DEFAULT_SETTINGS, await DB.get("settings")); }

// Situação de cada item na data de hoje.
function lembreteAtivo(i, today) { return i.type === "lembrete" && i.status === "pendente" && !(i.snoozeUntil && i.snoozeUntil > today); }
function metaDaSemana(i, today) { return i.type === "meta" && i.week === mondayOf(today); }
function metaAberta(i, today) { return metaDaSemana(i, today) && i.status === "pendente" && !(i.snoozeUntil && i.snoozeUntil > today); }
function avisoExpirado(i, today) { return i.type === "aviso" && i.status === "pendente" && i.expiry < today; }
function avisoAtivo(i, today) { return i.type === "aviso" && i.status === "pendente" && i.expiry >= today; }
function avisoVencendo(i, today) { return avisoAtivo(i, today) && daysBetween(today, i.expiry) <= (i.warnDays ?? 3) && !(i.snoozeUntil && i.snoozeUntil > today); }
function faltamTxt(i, today) {
  const n = daysBetween(today, i.expiry);
  return n === 0 ? "último dia hoje!" : n === 1 ? "vence amanhã" : `faltam ${n} dias`;
}
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

// Monta o texto da notificação diária. Retorna null quando não há nada pendente.
function buildSummary(items, st, today) {
  const L = st.notifyLembrete ? items.filter(i => lembreteAtivo(i, today)) : [];
  const M = st.notifyMeta ? items.filter(i => metaAberta(i, today)) : [];
  const A = st.notifyAviso ? items.filter(i => avisoVencendo(i, today)).sort((a, b) => a.expiry.localeCompare(b.expiry)) : [];
  const total = L.length + M.length + A.length;
  if (!total) return null;
  const parts = [];
  if (L.length) parts.push(plural(L.length, "lembrete", "lembretes"));
  if (M.length) parts.push(plural(M.length, "meta", "metas"));
  if (A.length) parts.push(plural(A.length, "aviso vencendo", "avisos vencendo"));
  const title = "Você tem " + (parts.length > 1 ? parts.slice(0, -1).join(", ") + " e " + parts.at(-1) : parts[0]);
  const lines = [
    ...A.map(i => `⏳ ${i.title}: ${faltamTxt(i, today)}`),
    ...L.map(i => `• ${i.title}` + (i.due && i.due < today ? " (atrasado)" : "")),
    ...M.map(i => `◎ ${i.title}` + (i.target > 1 ? ` (${i.count || 0}/${i.target})` : "")),
  ];
  const body = lines.slice(0, 6).join("\n") + (lines.length > 6 ? `\n+ ${lines.length - 6} outros` : "");
  return { title, body, total };
}
function badgeCount(items, today) {
  return items.filter(i => lembreteAtivo(i, today) || metaAberta(i, today) || avisoVencendo(i, today)).length;
}

// Horários do dia que já passaram e ainda não geraram notificação.
async function slotsDue(now) {
  const st = await getSettings(), today = ymd(now), hm = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const shown = (await DB.get("shown")) || {};
  const slots = [["s1", st.time1]];
  if (st.time2On) slots.push(["s2", st.time2]);
  return { st, today, shown, due: slots.filter(([k, t]) => t && hm >= t && shown[k] !== today).map(([k]) => k) };
}

// Mostra o resumo do dia se algum horário já chegou. force: mostra mesmo assim (push e teste).
async function maybeNotify(reg, { force = false, test = false } = {}) {
  const now = new Date();
  const { st, today, shown, due } = await slotsDue(now);
  if (!force && !due.length) return false;
  const items = await DB.all();
  let s = buildSummary(items, st, today);
  if (!s && test) s = { title: "Notificação de teste", body: "Tudo certo! Você não tem pendências agora.", total: 0 };
  if (!test) { due.forEach(k => shown[k] = today); await DB.set("shown", shown); }
  try { if ("setAppBadge" in navigator) s && s.total ? navigator.setAppBadge(s.total) : navigator.clearAppBadge(); } catch (e) {}
  if (!s) return false;
  await reg.showNotification(s.title, {
    body: s.body, tag: "resumo-diario", renotify: true,
    icon: "icons/icon-192.png", badge: "icons/badge-96.png",
    data: { url: "./?aba=hoje" },
    actions: [{ action: "abrir", title: "Abrir" }, { action: "adiar", title: "Adiar para amanhã" }],
  });
  return true;
}

// "Adiar para amanhã" na notificação: tira do resumo tudo que estava nele até amanhã.
async function adiarTudoAteAmanha() {
  const today = ymd(new Date()), st = await getSettings(), amanha = addDays(today, 1);
  for (const i of await DB.all()) {
    const entra = (st.notifyLembrete && lembreteAtivo(i, today)) || (st.notifyMeta && metaAberta(i, today)) || (st.notifyAviso && avisoVencendo(i, today));
    if (entra) { i.snoozeUntil = amanha; await DB.put(i); }
  }
  const shown = (await DB.get("shown")) || {};
  shown.s1 = shown.s2 = today;
  await DB.set("shown", shown);
}
