// Mr. Boom: desempenho de cada pessoa, calculado a partir das cargas anotadas (só o administrador vê).
// Arquivo com "_" no começo: a Vercel não cria rota para ele, só serve para /api/conta.
//
// Treino feito = dia com pelo menos uma carga ou repetição anotada. Quem treina sem anotar não aparece aqui.
// Meta = os dias por semana que a pessoa escolheu nas perguntas (o ACSM recomenda 2 a 3 dias por semana para
// iniciantes, e a OMS, fortalecimento muscular em 2 dias ou mais). As respostas de saúde nunca entram aqui.

const L = require('./_lib');

const JANELA = 28;          // dias da frequência: as últimas 4 semanas, contando hoje
const SEMANAS = 8;          // semanas no gráfico
const PARADO = 14;          // sem anotar nada há mais de 14 dias
const EM_DIA = 0.75;        // fez pelo menos 75% dos treinos combinados
const MAX_EXERCICIOS = 12;

const DIA = 86400000;
const toMs = (d) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
const toDate = (ms) => new Date(ms).toISOString().slice(0, 10);
const somar = (d, n) => toDate(toMs(d) + n * DIA);
const entre = (a, b) => Math.round((toMs(b) - toMs(a)) / DIA);
/* segunda-feira da semana da data */
const segunda = (d) => somar(d, -((new Date(toMs(d)).getUTCDay() + 6) % 7));

/* cargas de todo mundo, agrupadas por pessoa: { id: { "id|exercício": { data: { kg, reps } } } } */
async function cargasPorPessoa() {
  const flat = (await L.redis(['HGETALL', L.LOGS])) || [];
  const out = {};
  for (let i = 0; i + 1 < flat.length; i += 2) {
    const key = flat[i], m = L.KEY_RE.exec(key);
    if (!m) continue;
    try {
      const e = L.limparEntradas(JSON.parse(flat[i + 1]));
      if (Object.keys(e).length) (out[m[1]] = out[m[1]] || {})[key] = e;
    } catch (err) { /* registro ilegível: ignora */ }
  }
  return out;
}

const reps = (e) => (e.reps || []).reduce((s, n) => s + (Number.isFinite(n) ? n : 0), 0);

/* resumo que aparece no ícone de cada pessoa */
function resumo(p, cargas, hoje) {
  hoje = hoje || L.hoje();
  const dias = new Set();
  Object.keys(cargas || {}).forEach((k) => Object.keys(cargas[k]).forEach((d) => { if (d <= hoje) dias.add(d); }));
  const todos = Array.from(dias).sort();
  const ultimo = todos.length ? todos[todos.length - 1] : null;
  const porSemana = p.plano && Array.isArray(p.plano.dias) ? p.plano.dias.length : 0;
  const desde = somar(hoje, -(JANELA - 1));
  /* quem começou há menos de 4 semanas é comparado só com os dias desde o começo */
  /* o começo é o primeiro dia do plano; sem essa data, o dia em que o acesso foi liberado (ou a conta criada) */
  const comeco = [p.plano && p.plano.inicio, p.liberado, p.criado].find((d) => L.DATE_RE.test(String(d || '')));
  const inicioJanela = comeco && comeco > desde ? comeco : desde;
  const diasJanela = Math.max(1, entre(inicioJanela, hoje) + 1);
  const meta = porSemana ? Math.max(1, Math.round(porSemana * diasJanela / 7)) : null;
  const feitos = todos.filter((d) => d >= inicioJanela).length;
  const freq = meta ? Math.min(1, feitos / meta) : null;
  let status;
  if (!p.plano) status = 'sem-plano';
  else if (!ultimo) status = 'sem-registro';
  else if (entre(ultimo, hoje) > PARADO) status = 'parado';
  else status = freq >= EM_DIA ? 'em-dia' : 'irregular';
  return { status, feitos, meta, freq, ultimo, diasJanela, porSemana };
}

/* detalhe da janela de desempenho */
function detalhe(p, cargas, hoje) {
  hoje = hoje || L.hoje();
  cargas = cargas || {};
  const r = resumo(p, cargas, hoje);
  /* treinos e volume (kg × repetições) por semana, de segunda a domingo */
  const seg0 = segunda(hoje);
  const semanas = [];
  for (let i = SEMANAS - 1; i >= 0; i--) semanas.push({ inicio: somar(seg0, -7 * i), treinos: 0, volume: 0 });
  const idx = (d) => { const n = Math.floor(entre(semanas[0].inicio, d) / 7); return n >= 0 && n < SEMANAS ? n : -1; };
  const diasSemana = semanas.map(() => new Set());
  Object.keys(cargas).forEach((k) => Object.keys(cargas[k]).forEach((d) => {
    if (d > hoje) return;
    const i = idx(d);
    if (i < 0) return;
    diasSemana[i].add(d);
    const e = cargas[k][d];
    if (Number.isFinite(e.kg)) semanas[i].volume += Math.round(e.kg * reps(e));
  }));
  semanas.forEach((s, i) => { s.treinos = diasSemana[i].size; });
  /* semanas seguidas batendo a meta, sem contar a semana atual, que ainda não acabou */
  let seguidas = 0;
  if (r.porSemana) for (let i = SEMANAS - 2; i >= 0 && semanas[i].treinos >= r.porSemana; i--) seguidas++;

  /* cargas de cada exercício desde o começo do plano atual: a primeira e a última */
  const inicioPlano = p.plano && L.DATE_RE.test(String(p.plano.inicio || '')) ? p.plano.inicio : '0000-00-00';
  const exercicios = Object.keys(cargas).map((k) => {
    const datas = Object.keys(cargas[k]).filter((d) => d >= inicioPlano && d <= hoje && Number.isFinite(cargas[k][d].kg)).sort();
    if (!datas.length) return null;
    const a = datas[0], b = datas[datas.length - 1], ka = cargas[k][a].kg, kb = cargas[k][b].kg;
    return { key: k, registros: datas.length, primeira: { d: a, kg: ka }, ultima: { d: b, kg: kb },
      variacao: datas.length > 1 && ka > 0 ? Math.round((kb - ka) / ka * 1000) / 10 : null };
  }).filter(Boolean).sort((x, y) => y.registros - x.registros || (y.ultima.d < x.ultima.d ? -1 : 1));
  const comparaveis = exercicios.filter((x) => x.variacao !== null);
  const progressao = {
    subiram: comparaveis.filter((x) => x.variacao > 0).length,
    iguais: comparaveis.filter((x) => x.variacao === 0).length,
    cairam: comparaveis.filter((x) => x.variacao < 0).length,
    media: comparaveis.length ? Math.round(comparaveis.reduce((s, x) => s + x.variacao, 0) / comparaveis.length * 10) / 10 : null
  };
  return Object.assign(r, { hoje, semanas, seguidas, progressao, exercicios: exercicios.slice(0, MAX_EXERCICIOS), totalExercicios: exercicios.length });
}

module.exports = { cargasPorPessoa, resumo, detalhe, JANELA, SEMANAS, PARADO, EM_DIA };
