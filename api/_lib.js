// Mr. Boom: o que as rotas /api usam em comum (banco da Upstash, senhas e sessões).
// Arquivo com "_" no começo: a Vercel não cria rota para ele, só serve para as outras rotas.
//
// Cada pessoa cria a própria conta (usuário e senha) e espera o João (administrador) liberar.
// O João entra com o usuário "joao" e a senha que é o TREINO_PIN da Vercel; as outras senhas ficam
// no banco, embaralhadas com scrypt. Ao entrar, o servidor grava um cookie assinado que vale 400 dias
// e se renova a cada uso: a pessoa digita a senha uma vez por aparelho.

const crypto = require('crypto');

const REDIS_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const PIN = (process.env.TREINO_PIN || '').trim();

const LOGS = 'treino:logs';        // cargas: "pessoa|exercício" -> { "2026-10-07": { kg, reps } }
const PESSOAS = 'mrboom:pessoas';  // id -> { id, nome, usuario, criado, status, senha: { s, h }, plano, saude }
const USUARIOS = 'mrboom:usuarios'; // usuário (minúsculo) -> id, para entrar e para não repetir usuário
const CONF = 'mrboom:conf';        // segredo que assina os cookies
const COOKIE = 'mrboom';
const MAX_AGE = 400 * 24 * 60 * 60;

const ID_RE = /^[a-z0-9]{2,20}$/;
const USUARIO_RE = /^[a-z0-9][a-z0-9._-]{2,19}$/;
const RESERVADOS = ['joao', 'admin', 'administrador', 'mrboom', 'mr.boom'];
const KEY_RE = /^([a-z0-9]{2,20})\|[a-z0-9-]{1,40}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const JOAO = { id: 'joao', nome: 'João', usuario: 'joao', admin: true, status: 'ativo', plano: { modelo: 'joao' } };

const pronto = () => Boolean(REDIS_URL && REDIS_TOKEN);

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

function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch (e) { return {}; } }
  return {};
}

function lerCookies(req) {
  const out = {};
  String((req.headers && req.headers.cookie) || '').split(';').forEach((par) => {
    const i = par.indexOf('=');
    if (i <= 0) return;
    try { out[par.slice(0, i).trim()] = decodeURIComponent(par.slice(i + 1).trim()); } catch (e) { /* cookie ilegível */ }
  });
  return out;
}

/* comparação que leva o mesmo tempo para qualquer conteúdo do mesmo tamanho */
function igual(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/* data de hoje no horário de Brasília, no formato 2026-11-19 */
function hoje() { return new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' }); }

let segredoGuardado = null;
async function segredo() {
  if (segredoGuardado) return segredoGuardado;
  let s = await redis(['HGET', CONF, 'segredo']);
  if (!s) {
    await redis(['HSETNX', CONF, 'segredo', crypto.randomBytes(32).toString('hex')]);
    s = await redis(['HGET', CONF, 'segredo']);
  }
  segredoGuardado = s;
  return s;
}

function novaSenha(senha) {
  const s = crypto.randomBytes(16).toString('hex');
  return { s: s, h: crypto.scryptSync(String(senha), s, 32).toString('hex') };
}
const confere = (senha, guardada) => !!(guardada && guardada.s && guardada.h) && igual(crypto.scryptSync(String(senha), guardada.s, 32).toString('hex'), guardada.h);
/* usada quando o usuário não existe, para a resposta levar o mesmo tempo */
const FALSA = { s: '0'.repeat(32), h: '0'.repeat(64) };

/* muda quando a senha muda: os cookies antigos daquela pessoa deixam de valer */
function versao(p) {
  if (p.id === 'joao') return crypto.createHash('sha256').update('mrboom|' + PIN).digest('hex').slice(0, 12);
  return String((p.senha && p.senha.h) || '').slice(0, 12);
}
const assinar = (seg, id, v) => crypto.createHmac('sha256', seg).update(id + '.' + v).digest('hex').slice(0, 40);

async function lerPessoas() {
  const flat = (await redis(['HGETALL', PESSOAS])) || [];
  const out = [];
  for (let i = 0; i + 1 < flat.length; i += 2) {
    try {
      const p = JSON.parse(flat[i + 1]);
      if (p && p.id === flat[i] && ID_RE.test(p.id)) out.push(p);
    } catch (e) { /* registro ilegível: ignora */ }
  }
  return out;
}

async function lerPessoa(id) {
  if (id === 'joao') return PIN ? JOAO : null;
  if (!ID_RE.test(String(id))) return null;
  const raw = await redis(['HGET', PESSOAS, id]);
  if (!raw) return null;
  try { const p = JSON.parse(raw); return p && p.id === id ? p : null; } catch (e) { return null; }
}

const salvarPessoa = (p) => redis(['HSET', PESSOAS, p.id, JSON.stringify(p)]);

const normUsuario = (u) => String(u || '').trim().toLowerCase().replace(/^@/, '');

async function acharPorLogin(usuario, senha) {
  const u = normUsuario(usuario);
  senha = String(senha || '').trim();
  if (!u || !senha) return null;
  if (u === 'joao') return PIN && igual(senha, PIN) ? JOAO : null;
  const id = USUARIO_RE.test(u) ? await redis(['HGET', USUARIOS, u]) : null;
  const p = id ? await lerPessoa(id) : null;
  if (!p) { confere(senha, FALSA); return null; }
  return confere(senha, p.senha) ? p : null;
}

async function sessao(req) {
  const c = lerCookies(req)[COOKIE];
  if (!c) return null;
  const partes = c.split('.');
  if (partes.length !== 3) return null;
  const p = await lerPessoa(partes[0]);
  if (!p || !igual(versao(p), partes[1])) return null;
  return igual(assinar(await segredo(), p.id, partes[1]), partes[2]) ? p : null;
}

function atributos(req, maxAge) {
  const https = String((req.headers && req.headers['x-forwarded-proto']) || '').split(',')[0].trim() === 'https';
  return '; Path=/; Max-Age=' + maxAge + '; HttpOnly; SameSite=Lax' + (https ? '; Secure' : '');
}
async function abrirSessao(req, res, p) {
  const v = versao(p);
  res.setHeader('Set-Cookie', COOKIE + '=' + p.id + '.' + v + '.' + assinar(await segredo(), p.id, v) + atributos(req, MAX_AGE));
}
function fecharSessao(req, res) { res.setHeader('Set-Cookie', COOKIE + '=' + atributos(req, 0)); }

/* dados que podem aparecer para o administrador: nunca a senha nem as respostas de saúde */
const publico = (p) => ({ id: p.id, nome: p.nome, usuario: p.usuario || '', admin: !!p.admin, status: p.status === 'pendente' ? 'pendente' : 'ativo', plano: p.plano || null });
const ativo = (p) => !!p && p.status !== 'pendente';

/* contadores por endereço: senhas erradas (10 a cada 15 min) e contas criadas (10 por hora) */
function endereco(req) {
  const h = (req.headers && (req.headers['x-forwarded-for'] || req.headers['x-real-ip'])) || '';
  return String(h).split(',')[0].trim() || 'sem-endereco';
}
async function contador(req, tipo) {
  const k = 'mrboom:' + tipo + ':' + endereco(req);
  return { k: k, n: Number(await redis(['GET', k])) || 0 };
}
async function somar(k, segundos) {
  const n = await redis(['INCR', k]);
  if (Number(n) === 1) await redis(['EXPIRE', k, segundos]);
}

function limparEntradas(src) {
  const out = {};
  if (!src || typeof src !== 'object') return out;
  for (const d of Object.keys(src).slice(0, 400)) {
    const e = src[d];
    if (!DATE_RE.test(d) || !e || typeof e !== 'object') continue;
    const kg = Number.isFinite(e.kg) && e.kg >= 0 && e.kg <= 1000 ? e.kg : null;
    const reps = Array.isArray(e.reps) ? e.reps.slice(0, 6).map((n) => (Number.isFinite(n) && n >= 0 && n <= 300 ? Math.round(n) : null)) : [];
    if (kg === null && !reps.some((n) => n !== null)) continue;
    out[d] = { kg, reps };
    /* lado: a carga anotada é de um lado só (ou de um halter); o total é o dobro */
    if (e.lado === true && kg !== null) out[d].lado = true;
  }
  return out;
}

module.exports = {
  PIN, LOGS, PESSOAS, USUARIOS, JOAO, ID_RE, KEY_RE, DATE_RE, USUARIO_RE, RESERVADOS,
  pronto, redis, readBody, igual, hoje, novaSenha, lerPessoas, lerPessoa, salvarPessoa, normUsuario, acharPorLogin,
  sessao, abrirSessao, fecharSessao, publico, ativo, contador, somar, limparEntradas
};
