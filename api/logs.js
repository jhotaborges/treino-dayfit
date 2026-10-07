// Cargas do treino (João e Haniere), guardadas no Redis da Upstash ligado ao projeto na Vercel.
// GET  /api/logs                       -> { logs: { "joao|leg45": { "2026-10-07": { kg, reps } } }, needsPin }
// POST /api/logs { key, e, pin }       -> grava (ou apaga, se e vier vazio) o histórico de um exercício
// POST /api/logs { check: true, pin }  -> só confere o código do treino

const REDIS_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const PIN = (process.env.TREINO_PIN || '').trim();
const HASH = 'treino:logs';
const KEY_RE = /^(joao|haniere)\|[a-z0-9-]{1,40}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

async function redis(command) {
  const r = await fetch(REDIS_URL, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + REDIS_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify(command)
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(j.error || 'redis ' + r.status);
  return j.result;
}

function clean(src) {
  const out = {};
  if (!src || typeof src !== 'object') return out;
  for (const d of Object.keys(src).slice(0, 400)) {
    const e = src[d];
    if (!DATE_RE.test(d) || !e || typeof e !== 'object') continue;
    const kg = Number.isFinite(e.kg) && e.kg >= 0 && e.kg <= 1000 ? e.kg : null;
    const reps = Array.isArray(e.reps) ? e.reps.slice(0, 6).map((n) => (Number.isFinite(n) && n >= 0 && n <= 300 ? Math.round(n) : null)) : [];
    if (kg === null && !reps.some((n) => n !== null)) continue;
    out[d] = { kg, reps };
  }
  return out;
}

function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch (e) { return {}; } }
  return {};
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!REDIS_URL || !REDIS_TOKEN) {
    return res.status(503).json({ error: 'O banco de dados ainda não foi ligado ao projeto na Vercel.' });
  }
  try {
    if (req.method === 'GET') {
      const flat = (await redis(['HGETALL', HASH])) || [];
      const logs = {};
      for (let i = 0; i + 1 < flat.length; i += 2) {
        const key = flat[i];
        if (!KEY_RE.test(key)) continue;
        try {
          const e = clean(JSON.parse(flat[i + 1]));
          if (Object.keys(e).length) logs[key] = e;
        } catch (e) { /* registro ilegível: ignora */ }
      }
      return res.status(200).json({ logs, needsPin: Boolean(PIN) });
    }
    if (req.method === 'POST') {
      const body = readBody(req);
      if (PIN && String(body.pin || '').trim() !== PIN) {
        return res.status(401).json({ error: 'Código do treino incorreto.' });
      }
      if (body.check) return res.status(200).json({ ok: true });
      const key = String(body.key || '');
      if (!KEY_RE.test(key)) return res.status(400).json({ error: 'Exercício inválido.' });
      const e = clean(body.e);
      if (Object.keys(e).length) await redis(['HSET', HASH, key, JSON.stringify(e)]);
      else await redis(['HDEL', HASH, key]);
      return res.status(200).json({ ok: true });
    }
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Método não permitido.' });
  } catch (err) {
    return res.status(500).json({ error: 'Não foi possível acessar o banco de dados.' });
  }
};
