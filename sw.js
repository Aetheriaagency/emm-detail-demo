/* Demo EMM Detail: guarda todo en la tablet para que se pueda enseñar sin internet.
   Sirve lo guardado al momento y, si hay conexión, lo actualiza por detrás para la próxima vez. */
const CACHE = "emm-demo-v1";
const PRECARGA = ["./", "index.html", "manifest.webmanifest", "img/antes.jpg", "img/despues.jpg", "img/espuma.jpg", "img/hero-detail.jpg", "img/hero-movil.jpg", "img/hero2.jpg", "img/icono-192.png", "img/icono-512.png", "img/interior.jpg", "img/llanta.jpg", "img/pulido.jpg", "club/datos.js", "club/estilo.css", "club/index.html", "club/socio.html", "club/taller.html", "club/tpv.html", "club/"];
const FUERA = ["https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => Promise.all(
    [...PRECARGA, ...FUERA].map((u) => c.add(new Request(u, { cache: "reload" })).catch(() => {}))
  )).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const propio = url.origin === self.location.origin;
  const fuentes = url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com" || url.hostname === "cdnjs.cloudflare.com";
  if (!propio && !fuentes) return;
  e.respondWith(caches.open(CACHE).then(async (c) => {
    const guardado = await c.match(req, { ignoreSearch: propio });
    const red = fetch(req).then((r) => {
      if (r && (r.ok || r.type === "opaque")) c.put(req, r.clone());
      return r;
    }).catch(() => null);
    if (guardado) { e.waitUntil(red); return guardado; }
    const r = await red;
    if (r) return r;
    if (req.mode === "navigate") return (await c.match("club/index.html")) || Response.error();
    return Response.error();
  }));
});
