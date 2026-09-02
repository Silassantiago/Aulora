const CACHE='aulora-simple-activity-v1';
const ASSETS=['/','/index.html','/styles.css','/app.js','/manifest.webmanifest','/icon-192.png','/icon-512.png','/henry-robot.png'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',event=>{
  const req=event.request,url=new URL(req.url);
  if(req.method!=='GET'||url.origin!==location.origin||url.pathname.startsWith('/api/'))return;
  if(req.mode==='navigate'||/\.(?:js|css|html)$/.test(url.pathname)){
    event.respondWith(fetch(req).then(res=>{if(res.ok){const copy=res.clone();caches.open(CACHE).then(c=>c.put(req.mode==='navigate'?'/index.html':req,copy));}return res;}).catch(()=>caches.match(req.mode==='navigate'?'/index.html':req)));return;
  }
  event.respondWith(caches.match(req).then(hit=>hit||fetch(req).then(res=>{if(res.ok){const copy=res.clone();caches.open(CACHE).then(c=>c.put(req,copy));}return res;})));
});
