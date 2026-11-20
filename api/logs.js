// Mr. Boom: cargas de quem está logado, guardadas no Redis da Upstash ligado ao projeto na Vercel.
// GET  /api/logs             -> { logs: { "joao|leg45": { "2026-10-07": { kg, reps } } }, pessoa } (só as da pessoa;
//                               o administrador recebe também { pendentes }, o número de pedidos esperando liberação)
// POST /api/logs { key, e }  -> grava (ou apaga, se e vier vazio) o histórico de um exercício da pessoa
// Páginas antigas, de antes do Mr. Boom, ainda mandam { key, e, pin }: o código do treino vale como o João.

const L = require('./_lib');

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!L.pronto()) {
    return res.status(503).json({ error: 'O banco de dados ainda não foi ligado ao projeto na Vercel.' });
  }
  try {
    if (req.method === 'GET') {
      const p = await L.sessao(req);
      if (!p) return res.status(401).json({ entrar: true });
      if (!L.ativo(p)) return res.status(403).json({ error: 'Seu acesso ainda não foi liberado.', aguardando: true });
      await L.abrirSessao(req, res, p);
      const flat = (await L.redis(['HGETALL', L.LOGS])) || [];
      const logs = {};
      for (let i = 0; i + 1 < flat.length; i += 2) {
        const key = flat[i], m = L.KEY_RE.exec(key);
        if (!m || m[1] !== p.id) continue;
        try {
          const e = L.limparEntradas(JSON.parse(flat[i + 1]));
          if (Object.keys(e).length) logs[key] = e;
        } catch (e) { /* registro ilegível: ignora */ }
      }
      const out = { logs, pessoa: p.id };
      if (p.admin) out.pendentes = (await L.lerPessoas()).filter((x) => !L.ativo(x)).length;
      return res.status(200).json(out);
    }
    if (req.method === 'POST') {
      const body = L.readBody(req);
      let p = await L.sessao(req);
      if (!p && L.PIN && body.pin !== undefined && L.igual(String(body.pin || '').trim(), L.PIN)) p = L.JOAO;
      if (!p) return res.status(401).json({ error: 'Entre de novo com a sua senha.', entrar: true });
      if (!L.ativo(p)) return res.status(403).json({ error: 'Seu acesso ainda não foi liberado.', aguardando: true });
      if (body.check) return res.status(200).json({ ok: true });
      const key = String(body.key || ''), m = L.KEY_RE.exec(key);
      if (!m) return res.status(400).json({ error: 'Exercício inválido.' });
      if (m[1] !== p.id) return res.status(403).json({ error: 'Esse registro é de outra pessoa.' });
      const e = L.limparEntradas(body.e);
      if (Object.keys(e).length) await L.redis(['HSET', L.LOGS, key, JSON.stringify(e)]);
      else await L.redis(['HDEL', L.LOGS, key]);
      return res.status(200).json({ ok: true });
    }
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Método não permitido.' });
  } catch (err) {
    return res.status(500).json({ error: 'Não foi possível acessar o banco de dados.' });
  }
};
