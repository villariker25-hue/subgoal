// ── Configuración ─────────────────────────────────────────────
// Client ID de la app registrada en https://dev.twitch.tv/console/apps
// (tipo "Público"). La URL de redirección registrada debe ser
// exactamente la de panel.html publicada (ver LEEME.md).
const TWITCH_CLIENT_ID = "PON_AQUI_EL_CLIENT_ID";

// Firebase: misma base que gastos-casa y el overlay del casino, apartado
// propio por código (hogares/subgoal-<código>). Solo guarda la meta, el
// diseño y los subs contados; el token de Twitch nunca sale del panel.
const FB_API_KEY = "AIzaSyDdB36I8wdRiHkBwOi-HqMnCd_CRBd2NAI";
const FB_DB      = "https://gastos-casa-2b557-default-rtdb.europe-west1.firebasedatabase.app";

const CFG_DEFECTO = {
  titulo: "Sub goal",
  meta: 50,
  autoSubir: 0,          // al llegar a la meta, súmale esto (0 = no)
  modo: "sesion",        // "sesion" = cuenta desde 0 · "total" = subs reales del canal
  contarResubs: true,
  contarRegalos: true,
  puntos: false,         // T1 = 1, T2 = 2, T3 = 6 (sub points de Twitch)
  estilo: "barra",       // "barra" | "pastilla"
  fuente: "Poppins",
  c1: "#9146ff",
  c2: "#ff4fd8",
  fondo: "#16121f",
  texto: "#ffffff",
  escala: 100,
  redondeo: 14,
  mostrarPct: false,
  mostrarUltimo: true,
  celebrar: true,
};

const FUENTES = ["Poppins", "Inter", "Montserrat", "Bebas Neue", "Bangers", "Press Start 2P"];

// ── Código del apartado ──────────────────────────────────────
function codigoDeUrl() {
  const c = new URLSearchParams(location.search).get("c") || "";
  return /^[a-z0-9]{8,32}$/.test(c) ? c : "";
}

function codigoNuevo() {
  const abc = "abcdefghijkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(14));
  return Array.from(bytes, b => abc[b % abc.length]).join("");
}

function urlBase() {
  return location.href.split(/[?#]/)[0].replace(/[^/]*$/, "");
}

// ── Firebase por REST (sesión anónima) ───────────────────────
async function tokenFirebase(forzar = false) {
  const guardado = JSON.parse(localStorage.getItem("subgoal_fb") || "null");
  if (!forzar && guardado && Date.now() < guardado.caduca) return guardado.token;
  const a = await (await fetch(
    "https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=" + FB_API_KEY,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }
  )).json();
  const nuevo = { token: a.idToken,
                  caduca: Date.now() + (parseInt(a.expiresIn || "3600", 10) - 300) * 1000 };
  localStorage.setItem("subgoal_fb", JSON.stringify(nuevo));
  return nuevo.token;
}

async function nube(codigo, metodo, sub = "", cuerpo = null, reintento = false) {
  const t = await tokenFirebase();
  const r = await fetch(`${FB_DB}/hogares/subgoal-${codigo}${sub}.json?auth=${t}`,
    { method: metodo, body: cuerpo === null ? undefined : JSON.stringify(cuerpo) });
  if (r.status === 401 && !reintento) {
    await tokenFirebase(true);                 // token caducado: renovar una vez
    return nube(codigo, metodo, sub, cuerpo, true);
  }
  if (!r.ok) throw new Error("Firebase " + r.status);
  return r.json();
}

// Escucha en directo el apartado (streaming REST con EventSource).
// alCambiar(estado) se llama con el estado completo tras cada cambio.
function escuchar(codigo, alCambiar, alEstado = () => {}) {
  let estado = {};
  let fuente = null;

  function aplicar(ruta, datos, esPatch) {
    if (esPatch) {                 // un patch son varios "put" bajo la ruta
      for (const [k, v] of Object.entries(datos || {})) aplicar(ruta + "/" + k, v, false);
      return;
    }
    const partes = ruta.split("/").filter(Boolean);
    if (!partes.length) { estado = datos || {}; return; }
    let nodo = estado = estado || {};
    for (const p of partes.slice(0, -1)) nodo = nodo[p] = (nodo[p] && typeof nodo[p] === "object") ? nodo[p] : {};
    const ult = partes[partes.length - 1];
    if (datos === null) delete nodo[ult];
    else nodo[ult] = datos;
  }

  async function abrir(forzar) {
    if (fuente) fuente.close();
    const t = await tokenFirebase(forzar);
    fuente = new EventSource(`${FB_DB}/hogares/subgoal-${codigo}.json?auth=${t}`);
    fuente.onopen = () => alEstado(true);
    fuente.onerror = () => alEstado(false);
    for (const tipo of ["put", "patch"]) {
      fuente.addEventListener(tipo, e => {
        const m = JSON.parse(e.data);
        aplicar(m.path, m.data, tipo === "patch");
        alCambiar(estado || {});
      });
    }
    fuente.addEventListener("auth_revoked", () => abrir(true));
    fuente.addEventListener("cancel", () => setTimeout(() => abrir(true), 2000));
  }

  abrir(false).catch(() => setTimeout(() => abrir(true), 5000));
  // El token anónimo dura 1 h: reabrimos antes de que caduque.
  setInterval(() => abrir(true), 50 * 60 * 1000);
}

// ── Cálculo del contador ─────────────────────────────────────
function valorEvento(ev, cfg) {
  if (ev.tipo === "resub" && !cfg.contarResubs) return 0;
  if (ev.tipo === "regalo" && !cfg.contarRegalos) return 0;
  const porTier = cfg.puntos ? ({ "2000": 2, "3000": 6 }[ev.tier] || 1) : 1;
  return (ev.cant || 1) * porTier;
}

function contarBase(estado) {
  const cfg = Object.assign({}, CFG_DEFECTO, estado.cfg);
  if (cfg.modo === "total") {
    const tot = estado.total || {};
    return (cfg.puntos ? tot.puntos : tot.subs) || 0;
  }
  return Object.values(estado.eventos || {}).reduce((s, ev) => s + valorEvento(ev, cfg), 0);
}

function contar(estado) {
  return contarBase(estado) + (estado.ajuste || 0);
}

function ultimosEventos(estado, n = 10) {
  return Object.entries(estado.eventos || {})
    .map(([id, ev]) => ({ id, ...ev }))
    .sort((a, b) => (b.t || 0) - (a.t || 0))
    .slice(0, n);
}
