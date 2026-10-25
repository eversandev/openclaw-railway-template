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
export function mountStudio(app, { stateDir, secureCookies = true }) {
  fs.mkdirSync(stateDir, { recursive: true });
  const db = new DatabaseSync(path.join(stateDir, 'studio.sqlite'));
  db.exec(`PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE, salt TEXT, password TEXT);
    CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id TEXT, expires INTEGER);
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
      'Content-Security-Policy': "default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'" });
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
    res.json({ email: user.email, drafts: db.prepare('SELECT kind,prompt FROM drafts WHERE user_id=?').all(user.id), mediaConnected: false });
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
  router.use('/api', (_req, res) => res.status(404).json({ error: 'Recurso indisponível.' }));
  router.use(express.static(assets, { index: 'index.html' }));
  app.use('/studio', router);
  return { close: () => db.close() };
}
