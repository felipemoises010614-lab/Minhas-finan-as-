// Minhas Finanças — API e bot de WhatsApp (Cloudflare Worker + D1)
//
// Rotas:
//   GET  /webhook                 verificação do webhook pela Meta
//   POST /webhook                 mensagens recebidas no WhatsApp
//   GET  /lancamentos             lista todos os lançamentos        (Bearer API_TOKEN)
//   POST /lancamentos             cria um lançamento                (Bearer API_TOKEN)
//   POST /lancamentos/importar    cria vários (ignora ids repetidos) (Bearer API_TOKEN)
//   DELETE /lancamentos/:id       exclui um lançamento              (Bearer API_TOKEN)
//   GET  /whatsapp/diagnostico    confere a configuração do WhatsApp (Bearer API_TOKEN)
//   POST /whatsapp/teste-envio      manda uma mensagem de teste para o primeiro número permitido (Bearer API_TOKEN)
//   POST /whatsapp/inscrever?waba=ID  inscreve a conta do WhatsApp no app, para receber mensagens (Bearer API_TOKEN)
//
// Configuração (Settings → Variables and Secrets do Worker):
//   DB               binding do banco D1
//   API_TOKEN        senha que o app usa para acessar a API
//   VERIFY_TOKEN     texto combinado com a Meta na verificação do webhook
//   APP_SECRET       "Chave secreta do app" da Meta (confere a assinatura das mensagens)
//   WHATSAPP_TOKEN   token de acesso permanente da Meta
//   PHONE_NUMBER_ID  identificação do número do WhatsApp que envia as respostas
//   ALLOWED_NUMBERS  seus números com DDI e DDD, só dígitos, separados por vírgula (ex.: 5511987654321)
//   TIMEZONE         opcional, padrão America/Sao_Paulo
//   GRAPH_VERSION    opcional, padrão v23.0

const CATEGORIAS = {
  gasto: {
    'Alimentação': ['mercado', 'supermercado', 'padaria', 'restaurante', 'lanche', 'lanchonete', 'almoco', 'jantar', 'cafe', 'ifood', 'pizza', 'hamburguer', 'acougue', 'feira', 'comida', 'sorvete', 'bar', 'hortifruti', 'alimentacao'],
    'Moradia': ['aluguel', 'condominio', 'iptu', 'reforma', 'moveis', 'moradia', 'casa'],
    'Transporte': ['uber', 'taxi', 'onibus', 'metro', 'gasolina', 'combustivel', 'posto', 'estacionamento', 'pedagio', 'passagem', 'trem', 'transporte', 'etanol'],
    'Contas': ['luz', 'energia', 'agua', 'internet', 'telefone', 'celular', 'gas', 'conta', 'boleto', 'netflix', 'spotify', 'assinatura', 'streaming', 'fatura', 'contas'],
    'Saúde': ['farmacia', 'remedio', 'medico', 'consulta', 'dentista', 'exame', 'academia', 'hospital', 'saude'],
    'Educação': ['curso', 'escola', 'faculdade', 'livro', 'mensalidade', 'material', 'educacao'],
    'Lazer': ['cinema', 'show', 'viagem', 'passeio', 'jogo', 'ingresso', 'festa', 'hotel', 'lazer'],
    'Compras': ['roupa', 'sapato', 'tenis', 'shopping', 'presente', 'amazon', 'loja', 'compras', 'compra'],
    'Outros': ['outros'],
  },
  entrada: {
    'Salário': ['salario', 'pagamento', 'adiantamento', 'vale', 'ferias', 'decimo'],
    'Freelance': ['freela', 'freelance', 'servico', 'bico', 'projeto', 'trabalho'],
    'Investimentos': ['rendimento', 'dividendo', 'dividendos', 'juros', 'investimento', 'investimentos', 'cdb', 'tesouro', 'poupanca'],
    'Presentes': ['presente', 'presentes'],
    'Outros': ['outros', 'reembolso', 'venda'],
  },
};

const PALAVRAS_ENTRADA = ['entrada', 'recebi', 'ganhei', 'receita', 'recebimento'];
const PALAVRAS_GASTO = ['gasto', 'gastei', 'paguei', 'comprei', 'despesa'];
const PREPOSICOES = ['no', 'na', 'nos', 'nas', 'em', 'de', 'do', 'da', 'dos', 'das', 'com', 'pra', 'para', 'pro', 'o', 'a', 'os', 'as', 'um', 'uma'];

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const brl = (centavos) => moeda.format(centavos / 100);

// ---------- Interpretação das mensagens ----------

function semAcento(texto) {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function hojeNoFuso(fuso) {
  // en-CA formata como AAAA-MM-DD
  return new Intl.DateTimeFormat('en-CA', { timeZone: fuso }).format(new Date());
}

function somarDias(iso, dias) {
  const d = new Date(iso + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

function dataValida(iso) {
  const d = new Date(iso + 'T12:00:00Z');
  return !isNaN(d) && d.toISOString().slice(0, 10) === iso;
}

function lerData(token, hoje) {
  const t = semAcento(token);
  if (t === 'hoje') return hoje;
  if (t === 'ontem') return somarDias(hoje, -1);
  if (t === 'anteontem') return somarDias(hoje, -2);
  const m = t.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?$/);
  if (!m) return null;
  let ano = m[3] ? Number(m[3]) : Number(hoje.slice(0, 4));
  if (ano < 100) ano += 2000;
  const iso = `${ano}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  if (!dataValida(iso)) return null;
  // Sem ano e no futuro: provavelmente é do ano passado (ex.: "28/12" em janeiro)
  if (!m[3] && iso > hoje) return `${ano - 1}${iso.slice(4)}`;
  return iso;
}

// "45,90" "1.234,56" "1234.5" "R$45" → centavos
function lerValor(token) {
  let t = token.replace(/^r\$/i, '');
  if (t.includes(',')) {
    if (!/^\d{1,3}(\.\d{3})*,\d{1,2}$|^\d+,\d{1,2}$/.test(t)) return null;
    t = t.replace(/\./g, '').replace(',', '.');
  } else if (/^\d{1,3}(\.\d{3})+$/.test(t)) {
    t = t.replace(/\./g, '');
  } else if (!/^\d+(\.\d{1,2})?$/.test(t)) {
    return null;
  }
  const centavos = Math.round(parseFloat(t) * 100);
  return centavos > 0 ? centavos : null;
}

function acharCategoria(tipo, palavras, explicita) {
  const cats = CATEGORIAS[tipo];
  if (explicita) {
    const alvo = semAcento(explicita);
    const nome = Object.keys(cats).find((c) => semAcento(c).startsWith(alvo));
    if (nome) return nome;
  }
  for (const p of palavras.map(semAcento)) {
    for (const [nome, chaves] of Object.entries(cats)) {
      if (chaves.some((k) => p === k || p === k + 's')) return nome;
    }
  }
  return 'Outros';
}

// Interpreta uma linha. Retorna { comando } ou { lancamento } ou { erro }.
function interpretarLinha(linha, hoje) {
  const texto = linha.trim().replace(/\s+/g, ' ');
  const simples = semAcento(texto).replace(/[!?.]+$/, '');

  if (['saldo', 'resumo', 'ajuda', 'menu', 'oi', 'ola'].includes(simples)) {
    return { comando: simples === 'menu' || simples === 'oi' || simples === 'ola' ? 'ajuda' : simples };
  }
  if (/^(desfazer|apagar|excluir|apaga|desfaz)( (o )?ultimo)?$/.test(simples)) return { comando: 'desfazer' };

  let tipo = 'gasto';
  let tokens = texto.split(' ');
  // Sinal grudado no valor: "+5000", "-45,90"
  if (/^[+-]/.test(tokens[0])) {
    if (tokens[0][0] === '+') tipo = 'entrada';
    tokens[0] = tokens[0].slice(1);
    if (!tokens[0]) tokens.shift();
  }

  let valor = null, data = null, categoria = null;
  const resto = [];
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    const t = semAcento(tok);
    if (PALAVRAS_ENTRADA.includes(t)) { tipo = 'entrada'; continue; }
    if (PALAVRAS_GASTO.includes(t)) { tipo = 'gasto'; continue; }
    if (t === 'r$') continue;
    if (tok.startsWith('#') && tok.length > 1) { categoria = tok.slice(1); continue; }
    if (!data) {
      const d = lerData(tok, hoje);
      if (d) { data = d; continue; }
    }
    if (valor === null) {
      const v = lerValor(tok.replace(/^[+-]/, ''));
      if (v !== null) {
        if (tok[0] === '+') tipo = 'entrada';
        valor = v;
        continue;
      }
    }
    resto.push(tok);
  }

  if (valor === null) return { erro: texto };

  while (resto.length && PREPOSICOES.includes(semAcento(resto[0]))) resto.shift();
  const nomeCategoria = acharCategoria(tipo, resto, categoria);
  let descricao = resto.join(' ').slice(0, 80) || nomeCategoria;
  descricao = descricao[0].toUpperCase() + descricao.slice(1);

  return { lancamento: { tipo, data: data || hoje, descricao, categoria: nomeCategoria, valor } };
}

// ---------- Banco de dados ----------

function validar(l) {
  return l && typeof l === 'object'
    && (l.tipo === 'gasto' || l.tipo === 'entrada')
    && typeof l.data === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(l.data) && dataValida(l.data)
    && typeof l.descricao === 'string' && l.descricao.trim().length > 0 && l.descricao.length <= 80
    && typeof l.categoria === 'string' && l.categoria.length > 0 && l.categoria.length <= 40
    && Number.isInteger(l.valor) && l.valor > 0 && l.valor < 1e12
    && (l.id === undefined || (typeof l.id === 'string' && /^[\w-]{1,64}$/.test(l.id)));
}

function novoId() {
  return Date.now().toString(36) + crypto.randomUUID().slice(0, 8);
}

function inserir(db, l, origem) {
  return db.prepare(
    'INSERT OR IGNORE INTO lancamentos (id, tipo, data, descricao, categoria, valor, origem) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).bind(l.id || novoId(), l.tipo, l.data, l.descricao.trim(), l.categoria, l.valor, origem);
}

async function totaisDoMes(db, mes) {
  const { results } = await db.prepare(
    'SELECT tipo, categoria, SUM(valor) AS total FROM lancamentos WHERE data LIKE ? GROUP BY tipo, categoria ORDER BY total DESC'
  ).bind(mes + '-%').all();
  const entradas = results.filter((r) => r.tipo === 'entrada');
  const gastos = results.filter((r) => r.tipo === 'gasto');
  const soma = (lista) => lista.reduce((t, r) => t + r.total, 0);
  return { entradas, gastos, totalEntradas: soma(entradas), totalGastos: soma(gastos) };
}

function nomeDoMes(mes) {
  return `${MESES[Number(mes.slice(5, 7)) - 1]}/${mes.slice(0, 4)}`;
}

function diaMes(iso) {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

// ---------- Respostas do bot ----------

const AJUDA = [
  '📒 *Minhas Finanças*',
  '',
  'Mande um lançamento por linha:',
  '• `mercado 45,90`',
  '• `uber 23 ontem`',
  '• `farmácia 80 15/10`',
  '• `+5000 salário` (entrada)',
  '• `recebi 300 freela` (entrada)',
  '• `presente mãe 120 #compras` (escolhe a categoria)',
  '',
  'Comandos:',
  '• *saldo* — saldo do mês',
  '• *resumo* — total por categoria',
  '• *desfazer* — apaga o último lançamento',
].join('\n');

async function responderTexto(env, texto, hoje) {
  const db = env.DB;
  const linhas = texto.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 20);
  const resultados = linhas.map((l) => interpretarLinha(l, hoje));
  const mes = hoje.slice(0, 7);

  const comando = resultados.length === 1 && resultados[0].comando;
  if (comando === 'ajuda') return AJUDA;
  if (comando === 'saldo') {
    const t = await totaisDoMes(db, mes);
    return [
      `📊 *Saldo de ${nomeDoMes(mes)}*`,
      `Entradas: ${brl(t.totalEntradas)}`,
      `Gastos: ${brl(t.totalGastos)}`,
      `*Saldo: ${brl(t.totalEntradas - t.totalGastos)}*`,
    ].join('\n');
  }
  if (comando === 'resumo') {
    const t = await totaisDoMes(db, mes);
    if (!t.entradas.length && !t.gastos.length) return `Nada lançado em ${nomeDoMes(mes)} ainda.`;
    const partes = [`📊 *Resumo de ${nomeDoMes(mes)}*`];
    if (t.gastos.length) {
      partes.push('', `*Gastos* (${brl(t.totalGastos)})`);
      for (const g of t.gastos) partes.push(`• ${g.categoria}: ${brl(g.total)}`);
    }
    if (t.entradas.length) {
      partes.push('', `*Entradas* (${brl(t.totalEntradas)})`);
      for (const e of t.entradas) partes.push(`• ${e.categoria}: ${brl(e.total)}`);
    }
    partes.push('', `*Saldo: ${brl(t.totalEntradas - t.totalGastos)}*`);
    return partes.join('\n');
  }
  if (comando === 'desfazer') {
    const ultimo = await db.prepare('SELECT * FROM lancamentos ORDER BY rowid DESC LIMIT 1').first();
    if (!ultimo) return 'Não há lançamentos para apagar.';
    await db.prepare('DELETE FROM lancamentos WHERE id = ?').bind(ultimo.id).run();
    return `🗑️ Apaguei: ${ultimo.descricao} — ${brl(ultimo.valor)} (${diaMes(ultimo.data)})`;
  }

  const novos = resultados.filter((r) => r.lancamento).map((r) => r.lancamento);
  const erros = resultados.filter((r) => r.erro || r.comando).map((r) => r.erro || r.comando);

  if (!novos.length) {
    return `🤔 Não entendi${erros.length ? `: "${erros[0]}"` : ''}.\n\n${AJUDA}`;
  }

  await db.batch(novos.map((l) => inserir(db, l, 'whatsapp')));

  const partes = [novos.length === 1 ? '✅ Lançado:' : `✅ ${novos.length} lançamentos:`];
  for (const l of novos) {
    const sinal = l.tipo === 'gasto' ? '−' : '+';
    partes.push(`${sinal} ${brl(l.valor)} · ${l.descricao} · ${l.categoria} · ${diaMes(l.data)}`);
  }
  if (erros.length) partes.push('', `Não entendi: ${erros.map((e) => `"${e}"`).join(', ')}`);
  const t = await totaisDoMes(db, mes);
  partes.push('', `Saldo de ${nomeDoMes(mes)}: *${brl(t.totalEntradas - t.totalGastos)}*`);
  return partes.join('\n');
}

// ---------- WhatsApp ----------

function digitos(n) {
  return String(n || '').replace(/\D/g, '');
}

// Celulares do Brasil às vezes chegam da Meta sem o nono dígito (55 11 8765-4321).
// Gera as duas formas para comparar e para enviar.
function variantesBR(numero) {
  const n = digitos(numero);
  if (n.startsWith('55') && n.length === 13 && n[4] === '9') return [n, n.slice(0, 4) + n.slice(5)];
  if (n.startsWith('55') && n.length === 12 && /[6-9]/.test(n[4])) return [n.slice(0, 4) + '9' + n.slice(4), n];
  return [n];
}

function numeroPermitido(env, numero) {
  const permitidos = String(env.ALLOWED_NUMBERS || '').split(',').map(digitos).filter(Boolean);
  if (!permitidos.length) return false;
  const formas = variantesBR(numero);
  return permitidos.some((p) => variantesBR(p).some((v) => formas.includes(v)));
}

async function enviarWhatsApp(env, para, texto) {
  const versao = env.GRAPH_VERSION || 'v23.0';
  const url = `https://graph.facebook.com/${versao}/${env.PHONE_NUMBER_ID}/messages`;
  let ultimoErro;
  for (const numero of variantesBR(para)) {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: numero,
        type: 'text',
        text: { body: texto.slice(0, 4000), preview_url: false },
      }),
    });
    if (resp.ok) return;
    ultimoErro = `${resp.status} ${await resp.text()}`;
  }
  console.error('Falha ao enviar mensagem no WhatsApp:', ultimoErro);
}

async function assinaturaValida(env, corpo, cabecalho) {
  if (!env.APP_SECRET || !cabecalho || !cabecalho.startsWith('sha256=')) return false;
  const chave = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(env.APP_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const assinatura = await crypto.subtle.sign('HMAC', chave, new TextEncoder().encode(corpo));
  const esperado = [...new Uint8Array(assinatura)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return iguais(esperado, cabecalho.slice(7));
}

function iguais(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let dif = 0;
  for (let i = 0; i < a.length; i++) dif |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return dif === 0;
}

async function receberWebhook(request, env) {
  const corpo = await request.text();
  if (!(await assinaturaValida(env, corpo, request.headers.get('X-Hub-Signature-256')))) {
    return new Response('Assinatura inválida', { status: 401 });
  }

  let payload;
  try { payload = JSON.parse(corpo); } catch { return new Response('JSON inválido', { status: 400 }); }

  const hoje = hojeNoFuso(env.TIMEZONE || 'America/Sao_Paulo');
  const mensagens = (payload.entry || [])
    .flatMap((e) => e.changes || [])
    .flatMap((c) => (c.value && c.value.messages) || []);

  for (const msg of mensagens) {
    if (!numeroPermitido(env, msg.from)) {
      console.warn('Mensagem ignorada de número não autorizado:', msg.from);
      continue;
    }
    // A Meta reenvia o webhook se não receber resposta a tempo: processa cada mensagem uma vez só
    const nova = await env.DB.prepare('INSERT OR IGNORE INTO mensagens (id) VALUES (?)').bind(msg.id).run();
    if (!nova.meta.changes) continue;

    let resposta;
    try {
      resposta = msg.type === 'text'
        ? await responderTexto(env, msg.text.body, hoje)
        : 'Por enquanto só entendo mensagens de texto. Mande *ajuda* para ver exemplos.';
    } catch (e) {
      console.error(e);
      resposta = '⚠️ Deu um erro ao salvar. Tente de novo em instantes.';
    }
    await enviarWhatsApp(env, msg.from, resposta);
  }
  return new Response('ok');
}

// ---------- API do app ----------

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Max-Age': '86400',
};

function json(dados, status = 200) {
  return new Response(JSON.stringify(dados), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS },
  });
}

async function api(request, env, caminho) {
  const token = (request.headers.get('Authorization') || '').replace(/^Bearer /, '');
  if (!env.API_TOKEN || !iguais(token, env.API_TOKEN)) return json({ erro: 'Token inválido' }, 401);

  const db = env.DB;
  const colunas = 'id, tipo, data, descricao, categoria, valor, origem';

  if (caminho === '/lancamentos' && request.method === 'GET') {
    const { results } = await db.prepare(`SELECT ${colunas} FROM lancamentos ORDER BY data DESC, rowid DESC`).all();
    return json(results);
  }

  if (caminho === '/lancamentos' && request.method === 'POST') {
    const l = await request.json().catch(() => null);
    if (!validar(l)) return json({ erro: 'Lançamento inválido' }, 400);
    const item = { ...l, id: l.id || novoId() };
    await inserir(db, item, 'app').run();
    return json({ id: item.id, tipo: item.tipo, data: item.data, descricao: item.descricao.trim(), categoria: item.categoria, valor: item.valor, origem: 'app' }, 201);
  }

  if (caminho === '/lancamentos/importar' && request.method === 'POST') {
    const lista = await request.json().catch(() => null);
    if (!Array.isArray(lista)) return json({ erro: 'Envie uma lista de lançamentos' }, 400);
    const validos = lista.filter(validar).slice(0, 5000);
    let adicionados = 0;
    for (let i = 0; i < validos.length; i += 100) {
      const res = await db.batch(validos.slice(i, i + 100).map((l) => inserir(db, l, 'app')));
      adicionados += res.reduce((t, r) => t + r.meta.changes, 0);
    }
    return json({ adicionados, ignorados: lista.length - adicionados });
  }

  const m = caminho.match(/^\/lancamentos\/([\w-]{1,64})$/);
  if (m && request.method === 'DELETE') {
    await db.prepare('DELETE FROM lancamentos WHERE id = ?').bind(m[1]).run();
    return new Response(null, { status: 204, headers: CORS });
  }

  return json({ erro: 'Rota não encontrada' }, 404);
}

// ---------- Diagnóstico do WhatsApp ----------

async function graph(env, metodo, caminho) {
  const versao = env.GRAPH_VERSION || 'v23.0';
  const resp = await fetch(`https://graph.facebook.com/${versao}/${caminho}`, {
    method: metodo,
    headers: { Authorization: `Bearer ${env.WHATSAPP_TOKEN}` },
  });
  return { status: resp.status, resposta: await resp.json().catch(() => null) };
}

async function adminWhatsApp(request, env, caminho, url) {
  const token = (request.headers.get('Authorization') || '').replace(/^Bearer /, '');
  if (!env.API_TOKEN || !iguais(token, env.API_TOKEN)) return json({ erro: 'Token inválido' }, 401);

  if (caminho === '/whatsapp/diagnostico' && request.method === 'GET') {
    const configurado = Object.fromEntries(
      ['DB', 'API_TOKEN', 'VERIFY_TOKEN', 'APP_SECRET', 'WHATSAPP_TOKEN', 'PHONE_NUMBER_ID', 'ALLOWED_NUMBERS'].map((k) => [k, !!env[k]])
    );
    const numero = env.WHATSAPP_TOKEN && env.PHONE_NUMBER_ID
      ? await graph(env, 'GET', `${env.PHONE_NUMBER_ID}?fields=display_phone_number,verified_name`)
      : null;
    const permitidos = String(env.ALLOWED_NUMBERS || '').split(',').map(digitos).filter(Boolean)
      .map((n) => n.slice(0, 4) + '*'.repeat(Math.max(n.length - 6, 0)) + n.slice(-2));
    const recebidas = env.DB
      ? await env.DB.prepare('SELECT COUNT(*) AS total, MAX(recebida_em) AS ultima FROM mensagens').first()
      : null;
    return json({ configurado, numero, permitidos, recebidas });
  }

  // Manda uma mensagem de teste para o primeiro número permitido e devolve a resposta da Meta
  if (caminho === '/whatsapp/teste-envio' && request.method === 'POST') {
    const para = String(env.ALLOWED_NUMBERS || '').split(',').map(digitos).filter(Boolean)[0];
    if (!para) return json({ erro: 'ALLOWED_NUMBERS vazio' }, 400);
    const versao = env.GRAPH_VERSION || 'v23.0';
    const tentativas = [];
    for (const numero of variantesBR(para)) {
      const resp = await fetch(`https://graph.facebook.com/${versao}/${env.PHONE_NUMBER_ID}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ messaging_product: 'whatsapp', to: numero, type: 'text', text: { body: '🔧 Teste do Minhas Finanças: o bot consegue te enviar mensagens.' } }),
      });
      tentativas.push({ status: resp.status, resposta: await resp.json().catch(() => null) });
      if (resp.ok) break;
    }
    return json(tentativas);
  }

  const waba = url.searchParams.get('waba') || '';
  if (caminho === '/whatsapp/inscrever' && /^\d{5,30}$/.test(waba)) {
    if (request.method === 'POST') return json(await graph(env, 'POST', `${waba}/subscribed_apps`));
    if (request.method === 'GET') return json(await graph(env, 'GET', `${waba}/subscribed_apps`));
  }
  return json({ erro: 'Rota não encontrada' }, 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const caminho = url.pathname.replace(/\/+$/, '') || '/';

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

    if (caminho === '/webhook' && request.method === 'GET') {
      const ok = url.searchParams.get('hub.mode') === 'subscribe'
        && env.VERIFY_TOKEN && url.searchParams.get('hub.verify_token') === env.VERIFY_TOKEN;
      return ok ? new Response(url.searchParams.get('hub.challenge')) : new Response('Proibido', { status: 403 });
    }
    if (caminho === '/webhook' && request.method === 'POST') return receberWebhook(request, env);

    if (caminho.startsWith('/whatsapp/')) {
      try {
        return await adminWhatsApp(request, env, caminho, url);
      } catch (e) {
        console.error(e);
        return json({ erro: 'Erro interno' }, 500);
      }
    }

    if (caminho.startsWith('/lancamentos')) {
      try {
        return await api(request, env, caminho);
      } catch (e) {
        console.error(e);
        return json({ erro: 'Erro interno' }, 500);
      }
    }

    if (caminho === '/') return new Response('Minhas Finanças API está no ar ✅');
    return new Response('Não encontrado', { status: 404 });
  },
};
