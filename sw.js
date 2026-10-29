// Guarda o app no celular para abrir mesmo sem internet.
// Ao publicar uma versão nova, troque o número em VERSION.
const VERSION = 'leitor-v11';
const SHARED = 'leitor-compartilhados';
const APP = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png', './lib/epub.min.js', './lib/jszip.min.js'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(APP)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION && k !== SHARED).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// livro enviado pelo "Compartilhar" de outro app (WhatsApp, arquivos...):
// guarda o arquivo e abre o leitor, que coloca na estante
async function receiveShared(req) {
  const form = await req.formData();
  const cache = await caches.open(SHARED);
  let i = 0;
  for (const f of form.getAll('livro')) {
    if (!(f instanceof File)) continue;
    await cache.put('./compartilhado/' + Date.now() + '-' + (i++), new Response(f, {
      headers: { 'Content-Type': f.type || 'application/epub+zip', 'X-Nome': encodeURIComponent(f.name || 'livro.epub') }
    }));
  }
  return Response.redirect('./?compartilhado=1', 303);
}

self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method === 'POST' && url.pathname.endsWith('/compartilhar')) {
    e.respondWith(receiveShared(req).catch(() => Response.redirect('./', 303)));
    return;
  }
  if (req.method !== 'GET') return;
  const isFont = url.host === 'fonts.googleapis.com' || url.host === 'fonts.gstatic.com';
  if (url.origin !== location.origin && !isFont) return;

  // páginas do app: tenta a internet primeiro (para pegar atualizações), senão usa a cópia guardada
  if (req.mode === 'navigate') {
    e.respondWith(
      // no-cache: confere sempre com o site, sem usar a cópia velha do navegador
      fetch(req, { cache: 'no-cache' }).then(res => {
        const copy = res.clone();
        caches.open(VERSION).then(c => c.put('./index.html', copy));
        return res;
      }).catch(() => caches.match('./index.html'))
    );
    return;
  }

  // arquivos e fontes: usa a cópia guardada e busca na internet só se não tiver
  e.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (res.ok || res.type === 'opaque') {
        const copy = res.clone();
        caches.open(VERSION).then(c => c.put(req, copy));
      }
      return res;
    }))
  );
});
