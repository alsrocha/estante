// Service worker: guarda o app para abrir sem internet e dispara o resumo diário de pendências.
importScripts("core.js");
const CACHE = "pendencias-v1";
const SHELL = ["./", "index.html", "core.js", "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png", "icons/badge-96.png"];

self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL))); self.skipWaiting(); });
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  // rede primeiro (pega atualizações), cache se estiver offline
  e.respondWith(fetch(e.request).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r; })
    .catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match("index.html"))));
});

// Chrome no Android acorda o app de tempos em tempos (app instalado). Não tem horário exato.
self.addEventListener("periodicsync", e => {
  if (e.tag === "resumo-diario") e.waitUntil(maybeNotify(self.registration));
});

// Push opcional (GitHub Actions). A mensagem só "acorda" o app; o texto é montado aqui, com os dados do aparelho.
self.addEventListener("push", e => {
  e.waitUntil(maybeNotify(self.registration, { force: true }).then(shown => shown || self.registration.showNotification("Pendências", {
    body: "Tudo em dia! Nenhuma pendência para hoje.", tag: "resumo-diario", icon: "icons/icon-192.png", badge: "icons/badge-96.png", data: { url: "./" },
  })));
});

self.addEventListener("notificationclick", e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || "./", self.registration.scope).href;
  e.waitUntil((async () => {
    if (e.action === "adiar") { await adiarTudoAteAmanha(); try { navigator.clearAppBadge && navigator.clearAppBadge(); } catch (x) {} return; }
    const cs = await clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of cs) { if ("focus" in c) { c.postMessage({ type: "recarregar" }); return c.focus(); } }
    return clients.openWindow(url);
  })());
});
