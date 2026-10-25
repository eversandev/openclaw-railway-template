import { DatabaseSync } from 'node:sqlite';
import { randomBytes, scrypt, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';

const derive = promisify(scrypt);
const hash = value => createHash('sha256').update(value).digest('hex');
const assets = fileURLToPath(new URL('./public/studio/', import.meta.url));

// Separate accounts: no gateway token, owner tools or private workspace is sent to visitors.
export function mountStudio(app, { stateDir, secureCookies = true, falKey = process.env.FAL_KEY, falFetch = fetch }) {
  fs.mkdirSync(stateDir, { recursive: true });
  const db = new DatabaseSync(path.join(stateDir, 'studio.sqlite'));
  db.exec(`PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE, salt TEXT, password TEXT);
    CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id TEXT, expires INTEGER);
    CREATE TABLE IF NOT EXISTS media_jobs (id TEXT PRIMARY KEY, user_id TEXT, kind TEXT, prompt TEXT, model TEXT, status TEXT, status_url TEXT, result_url TEXT, result TEXT, created INTEGER);
    CREATE UNIQUE INDEX IF NOT EXISTS media_active_user ON media_jobs(user_id) WHERE status IN ('SUBMITTING','IN_QUEUE','IN_PROGRESS','UNKNOWN');
    CREATE TABLE IF NOT EXISTS drafts (user_id TEXT, kind TEXT, prompt TEXT, PRIMARY KEY(user_id,kind));`);
  fs.chmodSync(path.join(stateDir, 'studio.sqlite'), 0o600);
  const router = express.Router();
  const cookieName = secureCookies ? '__Host-studio' : 'studio-local';
  const cookie = (token, age) => `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${secureCookies ? '; Secure' : ''}`;
  const attempts = new Map();
  const session = req => {
    const token = (req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith(cookieName + '='))?.slice(cookieName.length + 1);
    if (!token) return null;
    return db.prepare('SELECT users.id, users.email FROM sessions JOIN users ON users.id=sessions.user_id WHERE token=? AND expires>?').get(hash(token), Date.now());
  };
  router.use((req, res, next) => {
    res.set({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin',
      'Content-Security-Policy': "default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data: https:; media-src https:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'" });
    if (req.method === 'POST') {
      let origin;
      try { origin = new URL(req.headers.origin).host; } catch { return res.sendStatus(403); }
      if (origin !== req.headers.host) return res.sendStatus(403);
    }
    next();
  });
  router.get('/api/me', (req, res) => {
    const user = session(req);
    if (!user) return res.status(401).json({ error: 'Entre na sua conta para continuar.' });
    res.json({ email: user.email, drafts: db.prepare('SELECT kind,prompt FROM drafts WHERE user_id=?').all(user.id), mediaConnected: Boolean(falKey) });
  });
  router.post('/api/:action', async (req, res, next) => {
    if (!['login', 'register'].includes(req.params.action)) return next();
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 12 || password.length > 256)
      return res.status(400).json({ error: 'Use um e-mail válido e uma senha de 12 a 256 caracteres.' });
    // Aggregate and per-address limits bound expensive password work; no proxy headers are trusted.
    const keys = ['global', email];
    for (const key of keys) {
      const entry = attempts.get(key);
      if (entry && entry.until > Date.now() && entry.count >= (key === 'global' ? 100 : 10))
        return res.status(429).json({ error: 'Muitas tentativas. Tente novamente em 15 minutos.' });
    }
    for (const key of keys) {
      const entry = attempts.get(key);
      attempts.set(key, entry && entry.until > Date.now() ? { ...entry, count: entry.count + 1 } : { count: 1, until: Date.now() + 900000 });
    }
    if (attempts.size > 1000) for (const [key, value] of attempts) if (value.until < Date.now()) attempts.delete(key);
    try {
      let user = db.prepare('SELECT * FROM users WHERE email=?').get(email);
      if (req.params.action === 'register') {
        if (user) return res.status(400).json({ error: 'Não foi possível criar a conta. Tente entrar.' });
        const salt = randomBytes(16).toString('hex');
        const digest = (await derive(password, salt, 64)).toString('hex');
        user = { id: randomBytes(16).toString('hex'), email };
        db.prepare('INSERT INTO users VALUES (?,?,?,?)').run(user.id, email, salt, digest);
      } else {
        const digest = await derive(password, user?.salt || 'invalid-user-salt', 64);
        if (!user || !timingSafeEqual(digest, Buffer.from(user.password, 'hex')))
          return res.status(401).json({ error: 'E-mail ou senha incorretos.' });
      }
      const token = randomBytes(32).toString('hex');
      db.prepare('DELETE FROM sessions WHERE expires<=?').run(Date.now());
      db.prepare('INSERT INTO sessions VALUES (?,?,?)').run(hash(token), user.id, Date.now() + 86400000);
      res.set('Set-Cookie', cookie(token, 86400)).json({ ok: true });
    } catch { res.status(400).json({ error: 'Não foi possível concluir. Tente novamente.' }); }
  });
  router.post('/api/logout', (req, res) => {
    const token = (req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith(cookieName + '='))?.slice(cookieName.length + 1);
    if (token) db.prepare('DELETE FROM sessions WHERE token=?').run(hash(token));
    res.set('Set-Cookie', cookie('', 0)).json({ ok: true });
  });
  router.post('/api/draft', (req, res) => {
    const user = session(req);
    if (!user) return res.sendStatus(401);
    const { kind, prompt } = req.body;
    if (!['chat','images','music','video'].includes(kind) || typeof prompt !== 'string' || prompt.length > 10000) return res.sendStatus(400);
    db.prepare('INSERT INTO drafts VALUES (?,?,?) ON CONFLICT(user_id,kind) DO UPDATE SET prompt=excluded.prompt').run(user.id, kind, prompt);
    res.json({ ok: true });
  });
  const models = { images: 'fal-ai/nano-banana-2', video: 'fal-ai/veo3.1/fast', music: 'mureka/api/generate/song' };
  const queueUrl = value => {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.hostname !== 'queue.fal.run' || url.username || url.password || url.port) throw new Error('Invalid provider URL');
    return url.href;
  };
  const publicJob = job => ({ id: job.id, kind: job.kind, prompt: job.prompt, model: job.model, status: job.status, created: job.created, result: JSON.parse(job.result || '[]') });
  const safeMedia = data => {
    const values = [...(data.images || []), data.video, data.audio, data.audio_url ? { url: data.audio_url } : null].filter(Boolean);
    return values.filter(v => { try { return new URL(v.url).protocol === 'https:'; } catch { return false; } }).map(v => ({ url: v.url }));
  };
  const falRequest = async (url, options = {}) => {
    const response = await falFetch(queueUrl(url), { ...options, headers: { 'Authorization': `Key ${falKey}`, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(30000), redirect: 'error' });
    if (!response.ok) { const error = new Error('Provider request failed'); error.providerStatus = response.status; throw error; }
    return response.json();
  };
  router.get('/api/media', (req, res) => {
    const user = session(req); if (!user) return res.sendStatus(401);
    res.json(db.prepare('SELECT * FROM media_jobs WHERE user_id=? ORDER BY created DESC LIMIT 50').all(user.id).map(publicJob));
  });
  router.post('/api/media', async (req, res) => {
    const user = session(req); if (!user) return res.sendStatus(401);
    if (!falKey) return res.status(503).json({ error: 'A geração ainda não está configurada.' });
    const { kind, prompt, options = {} } = req.body;
    if (!models[kind] || typeof prompt !== 'string' || !prompt.trim() || prompt.length > 5000 || !options || typeof options !== 'object')
      return res.status(400).json({ error: 'Descreva sua criação em até 5.000 caracteres.' });
    const choose = (value, values, fallback) => values.includes(value) ? value : fallback;
    let input;
    if (kind === 'images') input = { prompt: prompt.trim(), num_images: 1, aspect_ratio: choose(options.ratio, ['1:1','16:9','9:16','4:3','3:4'], '1:1'), resolution: '1K', output_format: 'png' };
    if (kind === 'video') input = { prompt: prompt.trim(), aspect_ratio: choose(options.ratio,['16:9','9:16'],'16:9'), duration: choose(options.duration,['4s','6s','8s'],'4s'), resolution: choose(options.resolution,['720p','1080p'],'720p'), generate_audio: options.audio !== false };
    if (kind === 'music') {
      input = { prompt: prompt.trim(), model: 'mureka-9.5', enable_safety_checker: true };
      if (typeof options.lyrics === 'string' && options.lyrics.trim()) {
        if (options.lyrics.length > 5000) return res.status(400).json({ error: 'A letra deve ter até 5.000 caracteres.' });
        input.lyrics = options.lyrics.trim();
      }
    }
    const id = randomBytes(16).toString('hex');
    try { db.prepare('INSERT INTO media_jobs VALUES (?,?,?,?,?,?,?,?,?,?)').run(id,user.id,kind,prompt.trim(),models[kind],'SUBMITTING',null,null,null,Date.now()); }
    catch { return res.status(409).json({ error: 'Você já tem uma geração em andamento. Aguarde o resultado.' }); }
    try {
      const job = await falRequest(`https://queue.fal.run/${models[kind]}`, { method: 'POST', body: JSON.stringify(input) });
      const statusUrl = queueUrl(job.status_url), resultUrl = queueUrl(job.response_url);
      db.prepare('UPDATE media_jobs SET status=?,status_url=?,result_url=? WHERE id=?').run('IN_QUEUE',statusUrl,resultUrl,id);
      res.status(202).json(publicJob(db.prepare('SELECT * FROM media_jobs WHERE id=?').get(id)));
    } catch (error) {
      const knownRejection = error.providerStatus >= 400 && error.providerStatus < 500;
      db.prepare('UPDATE media_jobs SET status=? WHERE id=?').run(knownRejection?'FAILED':'UNKNOWN',id);
      const message = error.providerStatus === 401 || error.providerStatus === 403 ? 'A fal.ai recusou a chave ou o acesso ao modelo. Verifique a configuração.' : error.providerStatus === 402 ? 'A conta fal.ai precisa de créditos para gerar.' : knownRejection ? 'A fal.ai recusou o pedido. Verifique o saldo e a descrição.' : 'Não foi possível confirmar o envio. Não repita o pedido: ele pode ter sido recebido. Contate o administrador.';
      res.status(502).json({ error: message });
    }
  });
  router.get('/api/media/:id', async (req, res) => {
    const user = session(req); if (!user) return res.sendStatus(401);
    const job = db.prepare('SELECT * FROM media_jobs WHERE id=? AND user_id=?').get(req.params.id,user.id);
    if (!job) return res.sendStatus(404);
    if (!['IN_QUEUE','IN_PROGRESS'].includes(job.status)) return res.json(publicJob(job));
    try {
      const status = await falRequest(job.status_url);
      if (status.status === 'COMPLETED') {
        try {
          const data = await falRequest(job.result_url);
          const media = safeMedia(data);
          db.prepare('UPDATE media_jobs SET status=?,result=? WHERE id=?').run(media.length?'COMPLETED':'FAILED',JSON.stringify(media),job.id);
        } catch(error) {
          if (error.providerStatus === 400 || error.providerStatus === 422) db.prepare('UPDATE media_jobs SET status=? WHERE id=?').run('FAILED',job.id);
          else throw error;
        }
      } else if (['IN_QUEUE','IN_PROGRESS'].includes(status.status)) {
        db.prepare('UPDATE media_jobs SET status=? WHERE id=?').run(status.status,job.id);
      } else if (status.status === 'FAILED') db.prepare('UPDATE media_jobs SET status=? WHERE id=?').run('FAILED',job.id);
      res.json(publicJob(db.prepare('SELECT * FROM media_jobs WHERE id=?').get(job.id)));
    } catch { res.status(503).json({ error: 'A consulta está temporariamente indisponível. O pedido foi preservado; não envie outro.' }); }
  });
  router.use('/api', (_req, res) => res.status(404).json({ error: 'Recurso indisponível.' }));
  router.use(express.static(assets, { index: 'index.html' }));
  app.use('/studio', router);
  return { close: () => db.close() };
}
