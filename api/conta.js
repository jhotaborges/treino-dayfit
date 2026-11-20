// Mr. Boom: conta de cada pessoa.
// GET  /api/conta                                       -> { pessoa } (e renova o cookie) ou 401; o administrador recebe também { pendentes }
// GET  /api/conta?pessoas=1                             -> { pessoas } (só o administrador)
// POST /api/conta { acao: 'cadastrar', nome, usuario, senha } -> cria a conta, que fica esperando liberação, e já deixa logado
// POST /api/conta { acao: 'entrar', usuario, senha }    -> { pessoa } e grava o cookie
// POST /api/conta { acao: 'sair' }                      -> apaga o cookie
// POST /api/conta { acao: 'plano', plano, saude }       -> guarda as respostas das perguntas (conta liberada)
//   saude = { peso, altura, lesoes, triagem }: respostas de saúde, que só a própria pessoa recebe de volta.
//   Ficam fora da lista do administrador e da resposta de liberar.
// POST /api/conta { acao: 'liberar' | 'recusar' | 'remover', id }  -> administrador
// POST /api/conta { acao: 'senha', id, senha }          -> administrador troca a senha de alguém que esqueceu

const crypto = require('crypto');
const L = require('./_lib');

const MODELOS = { c2: 2, c3: 3, ul4: 4 };
const NIVEIS = ['novo', 'menos1', 'mais1'];
const TEMPOS = ['curto', 'normal'];
const FOCOS = ['igual', 'inferior', 'superior'];
/* respostas de saúde: as partes do corpo na ordem em que aparecem nas perguntas */
const LESOES = ['pescoco', 'ombro', 'cotovelo', 'lombar', 'quadril', 'joelho', 'tornozelo', 'osteo', 'outra'];
const TRIAGENS = ['nao', 'liberado', 'pendente'];
const MAX_PESSOAS = 60, MAX_PEDIDOS = 30;

function limparPlano(src, antigo) {
  if (!src || typeof src !== 'object') return null;
  const modelo = String(src.modelo || '');
  if (!Object.prototype.hasOwnProperty.call(MODELOS, modelo)) return null;
  const dias = Array.isArray(src.dias) ? Array.from(new Set(src.dias.map(Number))).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6) : [];
  if (dias.length !== MODELOS[modelo]) return null;
  if (NIVEIS.indexOf(src.nivel) < 0 || TEMPOS.indexOf(src.tempo) < 0 || FOCOS.indexOf(src.foco) < 0) return null;
  /* as fases contam a partir do primeiro dia; refazer as perguntas mantém a data, a não ser que a pessoa peça um ciclo novo */
  const daPessoa = L.DATE_RE.test(String(src.inicio || '')) ? src.inicio : L.hoje();
  const inicio = !src.novoCiclo && antigo && L.DATE_RE.test(String(antigo.inicio || '')) ? antigo.inicio : daPessoa;
  return { modelo, dias: dias.sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)), nivel: src.nivel, tempo: src.tempo, foco: src.foco, inicio };
}

/* número opcional: vazio vira null; fora da faixa ou ilegível vira undefined (recusado) */
function medida(v, min, max, casas) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(String(v).trim().replace(',', '.'));
  if (!Number.isFinite(n)) return undefined;
  const f = Math.pow(10, casas), r = Math.round(n * f) / f;
  return r >= min && r <= max ? r : undefined;
}
function limparSaude(src) {
  if (!src || typeof src !== 'object' || Array.isArray(src)) return null;
  const peso = medida(src.peso, 30, 300, 1), altura = medida(src.altura, 100, 250, 0);
  if (peso === undefined || altura === undefined) return null;
  if (!Array.isArray(src.lesoes) || TRIAGENS.indexOf(src.triagem) < 0) return null;
  const lesoes = LESOES.filter((x) => src.lesoes.indexOf(x) >= 0);
  return { peso: peso, altura: altura, lesoes: lesoes, triagem: src.triagem, em: L.hoje() };
}
/* o que a própria pessoa recebe: os dados públicos e as respostas de saúde dela */
const proprio = (p) => Object.assign(L.publico(p), { saude: p.saude || null });

const nomeLimpo = (s) => String(s || '').replace(/\s+/g, ' ').trim();
const pendente = (p) => p && p.status === 'pendente';

async function apagarCargas(id) {
  const flat = (await L.redis(['HGETALL', L.LOGS])) || [];
  const chaves = [];
  for (let i = 0; i + 1 < flat.length; i += 2) if (String(flat[i]).indexOf(id + '|') === 0) chaves.push(flat[i]);
  for (let i = 0; i < chaves.length; i += 100) await L.redis(['HDEL', L.LOGS].concat(chaves.slice(i, i + 100)));
}
async function apagarPessoa(p) {
  await L.redis(['HDEL', L.PESSOAS, p.id]);
  if (p.usuario) {
    const dono = await L.redis(['HGET', L.USUARIOS, p.usuario]);
    if (dono === p.id) await L.redis(['HDEL', L.USUARIOS, p.usuario]);
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!L.pronto()) return res.status(503).json({ erro: 'O banco de dados ainda não foi ligado ao projeto na Vercel.' });
  try {
    if (req.method === 'GET') {
      const p = await L.sessao(req);
      if (!p) return res.status(401).json({ entrar: true });
      await L.abrirSessao(req, res, p);
      const q = new URL(req.url || '/', 'http://local').searchParams;
      if (q.get('pessoas')) {
        if (!p.admin) return res.status(403).json({ erro: 'Só o administrador vê a lista de pessoas.' });
        const lista = (await L.lerPessoas())
          .map((x) => ({ id: x.id, nome: x.nome, usuario: x.usuario || '', status: pendente(x) ? 'pendente' : 'ativo', criado: x.criado || null, plano: x.plano || null }))
          .sort((a, b) => (a.status === b.status ? a.nome.localeCompare(b.nome, 'pt-BR') : a.status === 'pendente' ? -1 : 1));
        return res.status(200).json({ pessoas: lista });
      }
      const out = { pessoa: proprio(p) };
      if (p.admin) out.pendentes = (await L.lerPessoas()).filter(pendente).length;
      return res.status(200).json(out);
    }
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'GET, POST');
      return res.status(405).json({ erro: 'Método não permitido.' });
    }

    const body = L.readBody(req);
    const acao = String(body.acao || '');

    if (acao === 'entrar') {
      const t = await L.contador(req, 'erros');
      if (t.n >= 10) return res.status(429).json({ erro: 'Muitas tentativas erradas. Espere 15 minutos e tente de novo.' });
      const p = await L.acharPorLogin(body.usuario, body.senha);
      if (!p) { await L.somar(t.k, 900); return res.status(401).json({ erro: 'Usuário ou senha incorretos.' }); }
      await L.abrirSessao(req, res, p);
      return res.status(200).json({ pessoa: proprio(p) });
    }

    if (acao === 'cadastrar') {
      const c = await L.contador(req, 'cadastros');
      if (c.n >= 10) return res.status(429).json({ erro: 'Muitas contas criadas a partir desta conexão. Tente de novo mais tarde.' });
      const nome = nomeLimpo(body.nome);
      const usuario = L.normUsuario(body.usuario);
      const senha = String(body.senha || '').trim();
      if (nome.length < 2 || nome.length > 30) return res.status(400).json({ erro: 'Escreva seu nome, com 2 a 30 letras.', campo: 'nome' });
      if (!L.USUARIO_RE.test(usuario)) return res.status(400).json({ erro: 'O usuário precisa ter de 3 a 20 letras ou números, sem espaço nem acento. Pode usar ponto, hífen e sublinhado.', campo: 'usuario' });
      if (senha.length < 6 || senha.length > 40) return res.status(400).json({ erro: 'A senha precisa ter de 6 a 40 caracteres.', campo: 'senha' });
      if (L.RESERVADOS.indexOf(usuario) >= 0) return res.status(409).json({ erro: 'Esse usuário já existe. Escolha outro.', campo: 'usuario' });
      const lista = await L.lerPessoas();
      if (lista.filter(pendente).length >= MAX_PEDIDOS) return res.status(429).json({ erro: 'Há muitos pedidos esperando liberação. Tente de novo mais tarde.' });
      if (lista.length >= MAX_PESSOAS) return res.status(400).json({ erro: 'O Mr. Boom já está com o número máximo de pessoas.' });
      let id = '';
      do { id = 'p' + crypto.randomBytes(4).toString('hex'); } while (lista.some((x) => x.id === id));
      if (Number(await L.redis(['HSETNX', L.USUARIOS, usuario, id])) !== 1) return res.status(409).json({ erro: 'Esse usuário já existe. Escolha outro.', campo: 'usuario' });
      const nova = { id: id, nome: nome, usuario: usuario, criado: L.hoje(), status: 'pendente', senha: L.novaSenha(senha), plano: null };
      await L.salvarPessoa(nova);
      await L.somar(c.k, 3600);
      await L.abrirSessao(req, res, nova);
      return res.status(200).json({ pessoa: proprio(nova) });
    }

    if (acao === 'sair') {
      L.fecharSessao(req, res);
      return res.status(200).json({ ok: true });
    }

    const eu = await L.sessao(req);
    if (!eu) return res.status(401).json({ entrar: true });

    if (acao === 'plano') {
      if (eu.id === 'joao') return res.status(400).json({ erro: 'O treino do João é montado à parte.' });
      if (!L.ativo(eu)) return res.status(403).json({ erro: 'Seu acesso ainda não foi liberado.', aguardando: true });
      const plano = limparPlano(body.plano, eu.plano);
      if (!plano) return res.status(400).json({ erro: 'Faltou responder alguma pergunta.' });
      /* páginas antigas não mandam as respostas de saúde: as que já existem continuam */
      if (body.saude !== undefined && body.saude !== null) {
        const saude = limparSaude(body.saude);
        if (!saude) return res.status(400).json({ erro: 'Confira o peso, a altura e as perguntas sobre lesões e saúde.' });
        eu.saude = saude;
      }
      eu.plano = plano;
      await L.salvarPessoa(eu);
      return res.status(200).json({ pessoa: proprio(eu) });
    }

    if (!eu.admin) return res.status(403).json({ erro: 'Só o administrador mexe nas contas.' });

    const alvo = await L.lerPessoa(String(body.id || ''));
    if (!alvo || alvo.id === 'joao') return res.status(404).json({ erro: 'Pessoa não encontrada.' });

    if (acao === 'liberar') {
      if (pendente(alvo)) { alvo.status = 'ativo'; alvo.liberado = L.hoje(); await L.salvarPessoa(alvo); }
      return res.status(200).json({ pessoa: L.publico(alvo) });
    }
    if (acao === 'recusar') {
      if (!pendente(alvo)) return res.status(400).json({ erro: 'Esse acesso já foi liberado. Para tirar a pessoa, use Remover.' });
      await apagarPessoa(alvo);
      return res.status(200).json({ ok: true });
    }
    if (acao === 'senha') {
      const senha = String(body.senha || '').trim();
      if (senha.length < 6 || senha.length > 40) return res.status(400).json({ erro: 'A senha precisa ter de 6 a 40 caracteres.' });
      alvo.senha = L.novaSenha(senha);
      await L.salvarPessoa(alvo);
      return res.status(200).json({ ok: true });
    }
    if (acao === 'remover') {
      await apagarPessoa(alvo);
      await apagarCargas(alvo.id);
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ erro: 'Ação desconhecida.' });
  } catch (err) {
    return res.status(500).json({ erro: 'Não foi possível acessar o banco de dados.' });
  }
};
