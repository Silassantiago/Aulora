const MODEL = '@cf/meta/llama-3.1-8b-instruct-fast';
const SESSION_COOKIE = 'aulora_session';
const SESSION_DAYS = 30;
const FREE_AI_LIMIT = 5;
const PRO_AI_LIMIT = 200;
const FREE_MATERIAL_LIMIT = 25;
const PRO_MATERIAL_LIMIT = 1000;
const jsonHeaders = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff'
};
let schemaReady = false;

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), { status, headers: { ...jsonHeaders, ...headers } });
}
function cleanText(value, max = 12000) {
  return String(value ?? '').replace(/\u0000/g, '').trim().slice(0, max);
}
function cleanEmail(value) {
  return cleanText(value, 254).toLowerCase();
}
function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
function sanitizeData(raw = {}) {
  const out = {};
  for (const [k, v] of Object.entries(raw)) out[k] = typeof v === 'string' ? cleanText(v) : v;
  if (out.count) out.count = Math.max(1, Math.min(20, Number(out.count) || 10));
  if (out.totalPoints) out.totalPoints = Math.max(1, Math.min(100, Number(out.totalPoints) || 10));
  return out;
}
function sanitizeHtml(html = '') {
  let s = String(html).slice(0, 90000);
  const allowed = new Set(['div','h1','h2','h3','p','ul','ol','li','strong','em','span','table','thead','tbody','tr','th','td','br']);
  s = s.replace(/<!--[\s\S]*?-->/g, '');
  s = s.replace(/<\/([a-z0-9-]+)[^>]*>/gi, (m, tag) => allowed.has(tag.toLowerCase()) ? `</${tag.toLowerCase()}>` : '');
  s = s.replace(/<([a-z0-9-]+)([^>]*)>/gi, (m, tag, attrs) => {
    tag = tag.toLowerCase(); if (!allowed.has(tag)) return '';
    if (tag === 'br') return '<br>';
    const match = String(attrs).match(/\sclass\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
    const cls = cleanText(match?.[1] || match?.[2] || '', 120).replace(/[^a-zA-Z0-9_ -]/g, '').trim();
    return `<${tag}${cls ? ` class="${cls}"` : ''}>`;
  });
  return s;
}
function nowIso() { return new Date().toISOString(); }
function monthKey() { return new Date().toISOString().slice(0, 7); }
function planLimits(plan) {
  const pro = plan === 'pro';
  return { ai: pro ? PRO_AI_LIMIT : FREE_AI_LIMIT, materials: pro ? PRO_MATERIAL_LIMIT : FREE_MATERIAL_LIMIT };
}
function parseCookies(request) {
  const raw = request.headers.get('cookie') || '';
  return Object.fromEntries(raw.split(';').map(v => v.trim()).filter(Boolean).map(v => {
    const i = v.indexOf('='); return i < 0 ? [v, ''] : [v.slice(0, i), decodeURIComponent(v.slice(i + 1))];
  }));
}
function sessionCookie(token, request) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly${secure}; SameSite=Lax; Path=/; Max-Age=${SESSION_DAYS * 86400}`;
}
function clearSessionCookie(request) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${SESSION_COOKIE}=; HttpOnly${secure}; SameSite=Lax; Path=/; Max-Age=0`;
}
function mutationOriginAllowed(request) {
  const origin = request.headers.get('origin');
  return !origin || origin === new URL(request.url).origin;
}
function bytesToBase64(bytes) {
  let binary = ''; for (const b of bytes) binary += String.fromCharCode(b); return btoa(binary);
}
function base64ToBytes(value) {
  const bin = atob(value); return Uint8Array.from(bin, c => c.charCodeAt(0));
}
function bytesToHex(bytes) { return [...bytes].map(b => b.toString(16).padStart(2, '0')).join(''); }
async function sha256(value) {
  const data = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  return new Uint8Array(await crypto.subtle.digest('SHA-256', data));
}
function constantTimeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0; for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]; return diff === 0;
}
async function hashPassword(password, saltBytes = crypto.getRandomValues(new Uint8Array(16))) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: saltBytes, iterations: 120000, hash: 'SHA-256' }, key, 256);
  return { salt: bytesToBase64(saltBytes), hash: bytesToBase64(new Uint8Array(bits)) };
}
async function verifyPassword(password, salt, expected) {
  const derived = await hashPassword(password, base64ToBytes(salt));
  return constantTimeEqual(base64ToBytes(derived.hash), base64ToBytes(expected));
}
async function ensureSchema(db) {
  if (schemaReady) return;
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL DEFAULT '',
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      plan TEXT NOT NULL DEFAULT 'free',
      plan_status TEXT NOT NULL DEFAULT 'active',
      profile_json TEXT NOT NULL DEFAULT '{}',
      stripe_customer_id TEXT,
      stripe_subscription_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    )`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS materials (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL,
      type_label TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL,
      subtitle TEXT NOT NULL DEFAULT '',
      data_json TEXT NOT NULL DEFAULT '{}',
      html TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    )`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_materials_user_updated ON materials(user_id, updated_at DESC)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS usage_monthly (
      user_id TEXT NOT NULL,
      month TEXT NOT NULL,
      ai_count INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY(user_id, month),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    )`)
  ]);
  schemaReady = true;
}
async function createSession(db, userId, request) {
  const raw = bytesToBase64(crypto.getRandomValues(new Uint8Array(32))).replace(/=+$/g, '');
  const hash = bytesToHex(await sha256(raw));
  const created = new Date();
  const expires = new Date(created.getTime() + SESSION_DAYS * 86400_000).toISOString();
  await db.prepare('INSERT INTO sessions(token_hash,user_id,expires_at,created_at) VALUES(?,?,?,?)').bind(hash, userId, expires, created.toISOString()).run();
  return { raw, cookie: sessionCookie(raw, request) };
}
async function currentUser(request, env) {
  if (!env.DB) return null;
  const token = parseCookies(request)[SESSION_COOKIE]; if (!token) return null;
  const hash = bytesToHex(await sha256(token));
  const row = await env.DB.prepare(`SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?`).bind(hash, nowIso()).first();
  return row || null;
}
function safeProfile(value) {
  let raw = value;
  if (typeof value === 'string') { try { raw = JSON.parse(value); } catch { raw = {}; } }
  raw = raw && typeof raw === 'object' ? raw : {};
  return {
    teacher: cleanText(raw.teacher, 120), school: cleanText(raw.school, 160), city: cleanText(raw.city, 100),
    stage: cleanText(raw.stage, 100) || 'Anos finais do Ensino Fundamental'
  };
}
async function usageFor(env, user) {
  const month = monthKey();
  const row = await env.DB.prepare('SELECT ai_count FROM usage_monthly WHERE user_id=? AND month=?').bind(user.id, month).first();
  return { month, ai: Number(row?.ai_count || 0), limits: planLimits(user.plan) };
}
async function userPayload(env, user) {
  const usage = await usageFor(env, user);
  return {
    id: user.id, email: user.email, name: user.name, plan: user.plan, planStatus: user.plan_status,
    profile: safeProfile(user.profile_json), usage,
    billing: { enabled: Boolean(env.STRIPE_SECRET_KEY && env.STRIPE_PRICE_PRO), customer: Boolean(user.stripe_customer_id) }
  };
}
async function requireUser(request, env) {
  const user = await currentUser(request, env);
  return user ? { user } : { response: json({ error: 'Faça login para continuar.', code: 'AUTH_REQUIRED' }, 401) };
}

function commonSystem() {
  return `Você é o motor pedagógico do Aulora, uma ferramenta brasileira para professores. Responda em português do Brasil, com correção gramatical, adequação à etapa de ensino e conteúdo pedagógico utilizável.
Regras obrigatórias:
- Não invente código BNCC, habilidade curricular, autor, referência bibliográfica, citação, dado estatístico ou fonte. Se o usuário não informar uma referência curricular, não crie uma.
- Não use Markdown. O campo html deve conter somente fragmento HTML, sem <html>, <head> ou <body>.
- Use somente div, h1, h2, h3, p, ul, ol, li, strong, em, span, table, thead, tbody, tr, th, td e br.
- Não use links, imagens, scripts, estilos, atributos on*, formulários ou conteúdo executável.
- O professor sempre deve revisar o material antes da aplicação.
- Para trabalhos acadêmicos, use como referência de apresentação a ABNT NBR 14724:2024, citações a NBR 10520:2023 e referências a NBR 6023:2018, sem inventar regras institucionais específicas.
- Não escreva citações ou referências inexistentes.`;
}
function promptFor(kind, d) {
  const payload = JSON.stringify(d, null, 2);
  if (kind === 'plan') return `${commonSystem()}\nCrie um PLANO DE AULA completo. Inclua identificação, tema, objetivo geral, objetivos específicos, conhecimentos prévios, desenvolvimento em etapas com tempo aproximado, metodologia, recursos, avaliação, fechamento e adaptações quando informadas. Código BNCC só pode ser reproduzido se fornecido.\nDados:\n${payload}`;
  if (kind === 'activity') return `${commonSystem()}\nCrie uma ATIVIDADE PEDAGÓGICA com exatamente ${d.count || 10} questões. Respeite formato e dificuldade. Questões objetivas precisam de 4 alternativas A-D com uma correta; discursivas precisam de orientação de correção. Ao final inclua <div class="answer-key"><h2>GABARITO / ORIENTAÇÕES DE CORREÇÃO</h2>...</div>.\nDados:\n${payload}`;
  if (kind === 'exam') return `${commonSystem()}\nCrie uma AVALIAÇÃO com exatamente ${d.count || 10} questões e total de ${d.totalPoints || 10} pontos. Distribua os pontos para somar exatamente o total. Questões objetivas têm 4 alternativas com uma correta; discursivas têm critério de correção. Inclua gabarito ao final em <div class="answer-key">.\nDados:\n${payload}`;
  return `${commonSystem()}\nCrie uma ESTRUTURA GUIADA DE TRABALHO ACADÊMICO. Não produza texto pronto para ser apresentado como autoria do estudante. Monte capa textual, resumo orientativo, palavras-chave, introdução, objetivos, referencial teórico, metodologia, resultados/discussão, considerações finais e referências. Onde depender de pesquisa, oriente a inserir fontes realmente consultadas. Inclua nota final para conferir o manual institucional.\nDados:\n${payload}`;
}
function defaultMeta(kind, d) {
  if (kind === 'plan') return { title: `Plano de aula — ${d.topic || 'Sem tema'}`, subtitle: `${d.discipline || ''} • ${d.grade || ''}`, typeLabel: 'Plano de aula' };
  if (kind === 'activity') return { title: `Atividade — ${d.topic || 'Sem tema'}`, subtitle: `${d.discipline || ''} • ${d.grade || ''}`, typeLabel: 'Atividade' };
  if (kind === 'exam') return { title: `Avaliação — ${d.topic || 'Sem tema'}`, subtitle: `${d.discipline || ''} • ${d.grade || ''}`, typeLabel: 'Avaliação' };
  return { title: d.title || 'Estrutura acadêmica', subtitle: `${d.workType || 'Trabalho acadêmico'} • ${d.author || ''}`, typeLabel: 'Acadêmico / ABNT' };
}
async function generateAI(env, kind, d) {
  const meta = defaultMeta(kind, d);
  const schema = { type: 'object', properties: { title: { type: 'string' }, subtitle: { type: 'string' }, typeLabel: { type: 'string' }, html: { type: 'string' } }, required: ['title', 'subtitle', 'typeLabel', 'html'] };
  const result = await env.AI.run(MODEL, {
    messages: [{ role: 'system', content: 'Siga rigorosamente as instruções e devolva JSON válido no esquema solicitado.' }, { role: 'user', content: promptFor(kind, d) }],
    response_format: { type: 'json_schema', json_schema: schema }, max_tokens: 3500, temperature: 0.3
  });
  let data = result?.response ?? result;
  if (result?.choices?.[0]?.message?.content) data = result.choices[0].message.content;
  if (typeof data === 'string') data = JSON.parse(data.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim());
  if (!data || typeof data !== 'object') throw new Error('Resposta inválida do modelo');
  return { title: cleanText(data.title || meta.title, 180), subtitle: cleanText(data.subtitle || meta.subtitle, 240), typeLabel: cleanText(data.typeLabel || meta.typeLabel, 80), html: sanitizeHtml(data.html || '') };
}

async function stripeRequest(env, path, params) {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== null && value !== '') body.set(key, String(value));
  const response = await fetch(`https://api.stripe.com${path}`, { method: 'POST', headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error?.message || 'Falha na cobrança.');
  return data;
}
async function verifyStripeSignature(rawBody, header, secret) {
  if (!header || !secret) return false;
  const parts = header.split(',').map(x => x.trim());
  const timestamp = Number(parts.find(x => x.startsWith('t='))?.slice(2));
  const signatures = parts.filter(x => x.startsWith('v1=')).map(x => x.slice(3));
  if (!timestamp || !signatures.length || Math.abs(Date.now() / 1000 - timestamp) > 300) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${rawBody}`)));
  const expected = bytesToHex(sig);
  return signatures.some(s => s.length === expected.length && constantTimeEqual(new TextEncoder().encode(s), new TextEncoder().encode(expected)));
}

async function api(request, env, url) {
  if (!env.DB) return json({ error: 'Banco de dados não configurado.' }, 503);
  await ensureSchema(env.DB);
  const path = url.pathname;

  if (path === '/api/health' && request.method === 'GET') {
    return json({ ok: true, ai: Boolean(env.AI), db: true, billing: Boolean(env.STRIPE_SECRET_KEY && env.STRIPE_PRICE_PRO), service: 'Aulora' });
  }
  if (path === '/api/auth/signup' && request.method === 'POST') {
    if (!mutationOriginAllowed(request)) return json({ error: 'Origem não autorizada.' }, 403);
    const body = await request.json().catch(() => ({}));
    const email = cleanEmail(body.email), name = cleanText(body.name, 120), password = String(body.password || '');
    if (!isEmail(email)) return json({ error: 'Informe um e-mail válido.' }, 400);
    if (password.length < 8 || password.length > 128) return json({ error: 'A senha deve ter entre 8 e 128 caracteres.' }, 400);
    if (await env.DB.prepare('SELECT id FROM users WHERE email=?').bind(email).first()) return json({ error: 'Já existe uma conta com este e-mail.' }, 409);
    const id = crypto.randomUUID(), hp = await hashPassword(password), ts = nowIso();
    await env.DB.prepare('INSERT INTO users(id,email,name,password_hash,password_salt,plan,plan_status,profile_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)')
      .bind(id, email, name, hp.hash, hp.salt, 'free', 'active', JSON.stringify({ teacher: name, school: '', city: '', stage: 'Anos finais do Ensino Fundamental' }), ts, ts).run();
    const session = await createSession(env.DB, id, request);
    const user = await env.DB.prepare('SELECT * FROM users WHERE id=?').bind(id).first();
    return json({ user: await userPayload(env, user) }, 201, { 'set-cookie': session.cookie });
  }
  if (path === '/api/auth/login' && request.method === 'POST') {
    if (!mutationOriginAllowed(request)) return json({ error: 'Origem não autorizada.' }, 403);
    const body = await request.json().catch(() => ({}));
    const email = cleanEmail(body.email), password = String(body.password || '');
    const user = await env.DB.prepare('SELECT * FROM users WHERE email=?').bind(email).first();
    if (!user || !(await verifyPassword(password, user.password_salt, user.password_hash))) return json({ error: 'E-mail ou senha incorretos.' }, 401);
    const session = await createSession(env.DB, user.id, request);
    return json({ user: await userPayload(env, user) }, 200, { 'set-cookie': session.cookie });
  }
  if (path === '/api/auth/logout' && request.method === 'POST') {
    const token = parseCookies(request)[SESSION_COOKIE];
    if (token) await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(bytesToHex(await sha256(token))).run();
    return json({ ok: true }, 200, { 'set-cookie': clearSessionCookie(request) });
  }
  if (path === '/api/me' && request.method === 'GET') {
    const user = await currentUser(request, env);
    return json({ user: user ? await userPayload(env, user) : null });
  }
  if (path === '/api/me' && request.method === 'PUT') {
    if (!mutationOriginAllowed(request)) return json({ error: 'Origem não autorizada.' }, 403);
    const auth = await requireUser(request, env); if (auth.response) return auth.response;
    const body = await request.json().catch(() => ({})); const profile = safeProfile(body.profile || {});
    const name = cleanText(body.name || profile.teacher || auth.user.name, 120);
    await env.DB.prepare('UPDATE users SET name=?, profile_json=?, updated_at=? WHERE id=?').bind(name, JSON.stringify(profile), nowIso(), auth.user.id).run();
    const user = await env.DB.prepare('SELECT * FROM users WHERE id=?').bind(auth.user.id).first();
    return json({ user: await userPayload(env, user) });
  }

  if (path === '/api/materials' && request.method === 'GET') {
    const auth = await requireUser(request, env); if (auth.response) return auth.response;
    const rows = await env.DB.prepare('SELECT id,type,type_label,title,subtitle,data_json,html,created_at,updated_at FROM materials WHERE user_id=? ORDER BY updated_at DESC LIMIT 1000').bind(auth.user.id).all();
    return json({ materials: (rows.results || []).map(r => ({ id: r.id, type: r.type, typeLabel: r.type_label, title: r.title, subtitle: r.subtitle, data: (() => { try { return JSON.parse(r.data_json); } catch { return {}; } })(), html: r.html, createdAt: r.created_at, updatedAt: r.updated_at })) });
  }
  if (path === '/api/materials' && request.method === 'POST') {
    if (!mutationOriginAllowed(request)) return json({ error: 'Origem não autorizada.' }, 403);
    const auth = await requireUser(request, env); if (auth.response) return auth.response;
    const body = await request.json().catch(() => ({})), m = body.material || {};
    const id = cleanText(m.id, 100) || crypto.randomUUID(), type = cleanText(m.type, 30), title = cleanText(m.title, 220);
    if (!type || !title) return json({ error: 'Material inválido.' }, 400);
    const existing = await env.DB.prepare('SELECT user_id FROM materials WHERE id=?').bind(id).first();
    if (existing && existing.user_id !== auth.user.id) return json({ error: 'Material não pertence a esta conta.' }, 403);
    if (!existing) {
      const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM materials WHERE user_id=?').bind(auth.user.id).first();
      if (Number(count?.n || 0) >= planLimits(auth.user.plan).materials) return json({ error: 'Limite de materiais na nuvem atingido.', code: 'MATERIAL_LIMIT' }, 429);
    }
    const ts = nowIso(), created = cleanText(m.createdAt, 40) || ts;
    const values = [id, auth.user.id, type, cleanText(m.typeLabel, 80), title, cleanText(m.subtitle, 300), JSON.stringify(sanitizeData(m.data || {})).slice(0, 50000), sanitizeHtml(m.html || ''), created, ts];
    if (existing) await env.DB.prepare('UPDATE materials SET type=?,type_label=?,title=?,subtitle=?,data_json=?,html=?,updated_at=? WHERE id=? AND user_id=?').bind(type, values[3], title, values[5], values[6], values[7], ts, id, auth.user.id).run();
    else await env.DB.prepare('INSERT INTO materials(id,user_id,type,type_label,title,subtitle,data_json,html,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(...values).run();
    return json({ ok: true, id, updatedAt: ts });
  }
  if (path === '/api/materials' && request.method === 'DELETE' && url.searchParams.get('all') === '1') {
    if (!mutationOriginAllowed(request)) return json({ error: 'Origem não autorizada.' }, 403);
    const auth = await requireUser(request, env); if (auth.response) return auth.response;
    await env.DB.prepare('DELETE FROM materials WHERE user_id=?').bind(auth.user.id).run(); return json({ ok: true });
  }
  if (path.startsWith('/api/materials/') && request.method === 'DELETE') {
    if (!mutationOriginAllowed(request)) return json({ error: 'Origem não autorizada.' }, 403);
    const auth = await requireUser(request, env); if (auth.response) return auth.response;
    const id = decodeURIComponent(path.slice('/api/materials/'.length));
    await env.DB.prepare('DELETE FROM materials WHERE id=? AND user_id=?').bind(id, auth.user.id).run(); return json({ ok: true });
  }

  if (path === '/api/generate' && request.method === 'POST') {
    if (!mutationOriginAllowed(request)) return json({ error: 'Origem não autorizada.' }, 403);
    const auth = await requireUser(request, env); if (auth.response) return auth.response;
    const len = Number(request.headers.get('content-length') || 0); if (len > 60000) return json({ error: 'Conteúdo muito grande.' }, 413);
    const body = await request.json().catch(() => ({})); const kind = cleanText(body.kind, 20);
    if (!['plan', 'activity', 'exam', 'abnt'].includes(kind)) return json({ error: 'Tipo de material inválido.' }, 400);
    const d = sanitizeData(body.data || {});
    if (kind !== 'abnt' && (!d.topic || !d.discipline || !d.grade)) return json({ error: 'Preencha tema, disciplina e turma.' }, 400);
    if (kind === 'abnt' && (!d.title || !d.author)) return json({ error: 'Preencha título e autor.' }, 400);
    if (!env.AI) return json({ error: 'Geração inteligente não configurada.' }, 503);
    const usage = await usageFor(env, auth.user); if (usage.ai >= usage.limits.ai) return json({ error: 'Seu limite mensal de gerações inteligentes foi atingido.', code: 'AI_LIMIT', usage }, 429);
    try {
      const output = await generateAI(env, kind, d);
      await env.DB.prepare(`INSERT INTO usage_monthly(user_id,month,ai_count) VALUES(?,?,1) ON CONFLICT(user_id,month) DO UPDATE SET ai_count=ai_count+1`).bind(auth.user.id, usage.month).run();
      const after = await usageFor(env, auth.user); return json({ ...output, usage: after });
    } catch (err) {
      console.error('Aulora generation error', err); return json({ error: 'Não foi possível gerar o material agora. Tente novamente em instantes.' }, 503);
    }
  }

  if (path === '/api/billing/checkout' && request.method === 'POST') {
    if (!mutationOriginAllowed(request)) return json({ error: 'Origem não autorizada.' }, 403);
    const auth = await requireUser(request, env); if (auth.response) return auth.response;
    if (!env.STRIPE_SECRET_KEY || !env.STRIPE_PRICE_PRO) return json({ error: 'Cobrança ainda não configurada pelo administrador.', code: 'BILLING_NOT_CONFIGURED' }, 503);
    if (auth.user.plan === 'pro' && ['active', 'trialing'].includes(auth.user.plan_status)) return json({ error: 'Sua conta já está no plano Pro.' }, 409);
    const origin = url.origin;
    const params = {
      mode: 'subscription', 'line_items[0][price]': env.STRIPE_PRICE_PRO, 'line_items[0][quantity]': '1',
      success_url: `${origin}/?billing=success`, cancel_url: `${origin}/?billing=cancel`, client_reference_id: auth.user.id,
      'metadata[aulora_user_id]': auth.user.id, 'subscription_data[metadata][aulora_user_id]': auth.user.id, allow_promotion_codes: 'true'
    };
    if (auth.user.stripe_customer_id) params.customer = auth.user.stripe_customer_id; else params.customer_email = auth.user.email;
    try { const session = await stripeRequest(env, '/v1/checkout/sessions', params); return json({ url: session.url }); }
    catch (err) { return json({ error: cleanText(err.message, 300) || 'Não foi possível abrir o pagamento.' }, 502); }
  }
  if (path === '/api/billing/portal' && request.method === 'POST') {
    if (!mutationOriginAllowed(request)) return json({ error: 'Origem não autorizada.' }, 403);
    const auth = await requireUser(request, env); if (auth.response) return auth.response;
    if (!env.STRIPE_SECRET_KEY || !auth.user.stripe_customer_id) return json({ error: 'Portal de assinatura indisponível.' }, 503);
    try { const portal = await stripeRequest(env, '/v1/billing_portal/sessions', { customer: auth.user.stripe_customer_id, return_url: url.origin }); return json({ url: portal.url }); }
    catch (err) { return json({ error: cleanText(err.message, 300) || 'Não foi possível abrir a assinatura.' }, 502); }
  }
  if (path === '/api/billing/webhook' && request.method === 'POST') {
    if (!env.STRIPE_WEBHOOK_SECRET) return json({ error: 'Webhook não configurado.' }, 503);
    const raw = await request.text();
    if (!(await verifyStripeSignature(raw, request.headers.get('stripe-signature'), env.STRIPE_WEBHOOK_SECRET))) return json({ error: 'Assinatura inválida.' }, 400);
    const event = JSON.parse(raw), obj = event?.data?.object || {};
    if (event.type === 'checkout.session.completed') {
      const userId = obj.client_reference_id || obj.metadata?.aulora_user_id;
      if (userId) await env.DB.prepare(`UPDATE users SET plan='pro',plan_status='active',stripe_customer_id=?,stripe_subscription_id=?,updated_at=? WHERE id=?`).bind(obj.customer || null, obj.subscription || null, nowIso(), userId).run();
    }
    if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
      const userId = obj.metadata?.aulora_user_id, status = cleanText(obj.status, 30);
      if (userId) {
        const pro = ['active', 'trialing'].includes(status) && event.type !== 'customer.subscription.deleted';
        await env.DB.prepare(`UPDATE users SET plan=?,plan_status=?,stripe_customer_id=COALESCE(?,stripe_customer_id),stripe_subscription_id=?,updated_at=? WHERE id=?`).bind(pro ? 'pro' : 'free', status || 'inactive', obj.customer || null, obj.id || null, nowIso(), userId).run();
      }
    }
    return json({ received: true });
  }

  if (path === '/api/admin/set-plan' && request.method === 'POST') {
    if (!env.AULORA_ADMIN_KEY) return json({ error: 'Administração não configurada.' }, 404);
    const supplied = request.headers.get('x-aulora-admin-key') || '';
    if (!constantTimeEqual(new TextEncoder().encode(supplied), new TextEncoder().encode(String(env.AULORA_ADMIN_KEY)))) return json({ error: 'Não autorizado.' }, 401);
    const body = await request.json().catch(() => ({})), email = cleanEmail(body.email), plan = body.plan === 'pro' ? 'pro' : 'free';
    await env.DB.prepare('UPDATE users SET plan=?,plan_status=?,updated_at=? WHERE email=?').bind(plan, 'active', nowIso(), email).run(); return json({ ok: true, email, plan });
  }

  return json({ error: 'Rota não encontrada.' }, 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      try { return await api(request, env, url); }
      catch (err) { console.error('Aulora API error', err); return json({ error: 'Erro interno do Aulora.' }, 500); }
    }
    return env.ASSETS.fetch(request);
  }
};
