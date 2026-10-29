'use strict';

const CHAVE_STORAGE = 'minhas-financas:lancamentos';

const CATEGORIAS = {
  gasto: [
    { nome: 'Alimentação', cor: '#f97316' },
    { nome: 'Moradia', cor: '#6366f1' },
    { nome: 'Transporte', cor: '#0ea5e9' },
    { nome: 'Contas', cor: '#a855f7' },
    { nome: 'Saúde', cor: '#ef4444' },
    { nome: 'Educação', cor: '#14b8a6' },
    { nome: 'Lazer', cor: '#eab308' },
    { nome: 'Compras', cor: '#ec4899' },
    { nome: 'Outros', cor: '#64748b' },
  ],
  entrada: [
    { nome: 'Salário', cor: '#16a34a' },
    { nome: 'Freelance', cor: '#22c55e' },
    { nome: 'Investimentos', cor: '#84cc16' },
    { nome: 'Presentes', cor: '#10b981' },
    { nome: 'Outros', cor: '#64748b' },
  ],
};

const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const formatoMes = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' });
const formatoDia = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' });

const $ = (seletor) => document.querySelector(seletor);

const form = $('#form-lancamento');
const selectCategoria = form.elements.categoria;

let lancamentos = carregar();
let mesSelecionado = hojeISO().slice(0, 7); // AAAA-MM

// ---------- Utilidades ----------

function hojeISO() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

function dataLocal(iso) {
  const [a, m, d] = iso.split('-').map(Number);
  return new Date(a, m - 1, d || 1);
}

function formatarCentavos(centavos) {
  return moeda.format(centavos / 100);
}

// Aceita "1.234,56", "1234,56", "1234.56", "12" → centavos (inteiro)
function lerValor(texto) {
  let t = String(texto).trim().replace(/[R$\s]/g, '');
  if (!t) return NaN;
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return NaN;
  return Math.round(parseFloat(t) * 100);
}

function corDaCategoria(tipo, nome) {
  const cat = CATEGORIAS[tipo].find((c) => c.nome === nome);
  return cat ? cat.cor : '#64748b';
}

function gerarId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// ---------- Persistência ----------

function carregar() {
  try {
    const dados = JSON.parse(localStorage.getItem(CHAVE_STORAGE));
    return Array.isArray(dados) ? dados.filter(valido) : [];
  } catch {
    return [];
  }
}

function salvar() {
  try {
    localStorage.setItem(CHAVE_STORAGE, JSON.stringify(lancamentos));
  } catch {
    alert('Não foi possível salvar no navegador. Verifique se o armazenamento está liberado.');
  }
}

function valido(l) {
  return l && typeof l === 'object'
    && (l.tipo === 'gasto' || l.tipo === 'entrada')
    && /^\d{4}-\d{2}-\d{2}$/.test(l.data)
    && typeof l.descricao === 'string'
    && typeof l.categoria === 'string'
    && Number.isInteger(l.valor) && l.valor > 0;
}

// ---------- Formulário ----------

function preencherCategorias(tipo) {
  selectCategoria.replaceChildren(
    ...CATEGORIAS[tipo].map((c) => new Option(c.nome, c.nome))
  );
}

function tipoAtual() {
  return form.elements.tipo.value;
}

form.addEventListener('change', (e) => {
  if (e.target.name === 'tipo') preencherCategorias(tipoAtual());
});

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const erro = $('#erro-form');
  const data = form.elements.data.value;
  const descricao = form.elements.descricao.value.trim();
  const valor = lerValor(form.elements.valor.value);

  if (!data) return mostrarErro('Informe a data.', form.elements.data);
  if (!(valor > 0)) return mostrarErro('Informe um valor válido, ex.: 25,90.', form.elements.valor);
  if (!descricao) return mostrarErro('Informe uma descrição.', form.elements.descricao);

  erro.textContent = '';
  lancamentos.push({
    id: gerarId(),
    tipo: tipoAtual(),
    data,
    descricao,
    categoria: selectCategoria.value,
    valor,
  });
  salvar();

  // Mostra o mês do lançamento recém-adicionado
  mesSelecionado = data.slice(0, 7);
  form.elements.valor.value = '';
  form.elements.descricao.value = '';
  render();
  form.elements.valor.focus();

  function mostrarErro(msg, campo) {
    erro.textContent = msg;
    campo.focus();
  }
});

// ---------- Navegação de mês ----------

function mudarMes(delta) {
  const d = dataLocal(mesSelecionado + '-01');
  d.setMonth(d.getMonth() + delta);
  mesSelecionado = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  render();
}

$('#mes-anterior').addEventListener('click', () => mudarMes(-1));
$('#mes-seguinte').addEventListener('click', () => mudarMes(1));

// ---------- Renderização ----------

function render() {
  const doMes = lancamentos
    .filter((l) => l.data.startsWith(mesSelecionado))
    .sort((a, b) => b.data.localeCompare(a.data) || b.id.localeCompare(a.id));

  const nomeMes = formatoMes.format(dataLocal(mesSelecionado + '-01'));
  $('#mes-atual').textContent = nomeMes[0].toUpperCase() + nomeMes.slice(1);

  const entradas = doMes.filter((l) => l.tipo === 'entrada');
  const gastos = doMes.filter((l) => l.tipo === 'gasto');
  const totalEntradas = soma(entradas);
  const totalGastos = soma(gastos);
  const saldo = totalEntradas - totalGastos;

  $('#total-entradas').textContent = formatarCentavos(totalEntradas);
  $('#total-gastos').textContent = formatarCentavos(totalGastos);
  const elSaldo = $('#saldo');
  elSaldo.textContent = formatarCentavos(saldo);
  elSaldo.className = 'valor ' + (saldo > 0 ? 'positivo' : saldo < 0 ? 'negativo' : '');

  const porCatGastos = agrupar(gastos, 'gasto');
  const porCatEntradas = agrupar(entradas, 'entrada');

  renderGrafico(porCatGastos, totalGastos);
  renderCategorias(porCatGastos, totalGastos, porCatEntradas, totalEntradas);
  renderLancamentos(doMes);
}

function soma(lista) {
  return lista.reduce((t, l) => t + l.valor, 0);
}

function agrupar(lista, tipo) {
  const mapa = new Map();
  for (const l of lista) mapa.set(l.categoria, (mapa.get(l.categoria) || 0) + l.valor);
  return [...mapa]
    .map(([nome, total]) => ({ nome, total, cor: corDaCategoria(tipo, nome) }))
    .sort((a, b) => b.total - a.total);
}

const SVG_NS = 'http://www.w3.org/2000/svg';

function elSvg(tag, attrs) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

function renderGrafico(categorias, total) {
  const svg = $('#grafico');
  const legenda = $('#legenda');
  const vazio = total === 0;

  $('#sem-gastos').hidden = !vazio;
  svg.closest('.grafico').hidden = vazio;
  svg.querySelectorAll(':scope > :not(desc)').forEach((n) => n.remove());
  legenda.replaceChildren();
  if (vazio) return;

  const cx = 100, cy = 100, r = 72, espessura = 30;
  const circ = 2 * Math.PI * r;
  const gap = categorias.length > 1 ? 2 : 0;
  let acumulado = 0;

  svg.append(elSvg('circle', {
    cx, cy, r, fill: 'none', stroke: 'currentColor', 'stroke-opacity': 0.06, 'stroke-width': espessura,
  }));

  for (const c of categorias) {
    const fatia = (c.total / total) * circ;
    const arco = elSvg('circle', {
      cx, cy, r,
      fill: 'none',
      stroke: c.cor,
      'stroke-width': espessura,
      'stroke-dasharray': `${Math.max(fatia - gap, 0.5)} ${circ}`,
      'stroke-dashoffset': -acumulado,
      transform: `rotate(-90 ${cx} ${cy})`,
    });
    const titulo = elSvg('title', {});
    titulo.textContent = `${c.nome}: ${formatarCentavos(c.total)}`;
    arco.append(titulo);
    svg.append(arco);
    acumulado += fatia;

    const li = document.createElement('li');
    li.innerHTML = '<span class="bolinha"></span><span class="nome"></span><span class="pct"></span>';
    li.querySelector('.bolinha').style.background = c.cor;
    li.querySelector('.nome').textContent = c.nome;
    li.querySelector('.pct').textContent = `${((c.total / total) * 100).toFixed(0)}%`;
    legenda.append(li);
  }

  const rotulo = elSvg('text', { x: cx, y: cy - 8, 'text-anchor': 'middle', class: 'rotulo-centro' });
  rotulo.textContent = 'Total gasto';
  const valor = elSvg('text', { x: cx, y: cy + 12, 'text-anchor': 'middle', class: 'total-centro' });
  valor.textContent = formatarCentavos(total);
  svg.append(rotulo, valor);
}

function renderCategorias(gastos, totalGastos, entradas, totalEntradas) {
  const lista = $('#lista-categorias');
  lista.replaceChildren();
  $('#sem-categorias').hidden = gastos.length + entradas.length > 0;

  const grupo = (titulo, cats, total, classe) => {
    if (!cats.length) return;
    const cab = document.createElement('li');
    cab.className = 'grupo';
    cab.textContent = titulo;
    lista.append(cab);
    for (const c of cats) {
      const li = document.createElement('li');
      li.innerHTML = '<div class="linha"><span></span><strong></strong></div><div class="barra"><span></span></div>';
      li.querySelector('.linha span').textContent = c.nome;
      const forte = li.querySelector('.linha strong');
      forte.textContent = formatarCentavos(c.total);
      forte.className = classe;
      const barra = li.querySelector('.barra span');
      barra.style.width = `${(c.total / total) * 100}%`;
      barra.style.background = c.cor;
      lista.append(li);
    }
  };

  grupo('Gastos', gastos, totalGastos, 'negativo');
  grupo('Entradas', entradas, totalEntradas, 'positivo');
}

function renderLancamentos(doMes) {
  const lista = $('#lista-lancamentos');
  lista.replaceChildren();
  $('#sem-lancamentos').hidden = doMes.length > 0;

  for (const l of doMes) {
    const li = document.createElement('li');
    li.innerHTML = `
      <div class="info"><span class="desc"></span><span class="meta"></span></div>
      <span class="quantia"></span>
      <button type="button" class="btn-excluir">✕</button>`;
    li.querySelector('.desc').textContent = l.descricao;
    li.querySelector('.meta').textContent = `${formatoDia.format(dataLocal(l.data))} · ${l.categoria}`;
    const quantia = li.querySelector('.quantia');
    quantia.textContent = (l.tipo === 'gasto' ? '− ' : '+ ') + formatarCentavos(l.valor);
    quantia.classList.add(l.tipo === 'gasto' ? 'negativo' : 'positivo');
    const btn = li.querySelector('.btn-excluir');
    btn.setAttribute('aria-label', `Excluir ${l.descricao}`);
    btn.addEventListener('click', () => excluir(l));
    lista.append(li);
  }
}

function excluir(l) {
  if (!confirm(`Excluir "${l.descricao}" (${formatarCentavos(l.valor)})?`)) return;
  lancamentos = lancamentos.filter((x) => x.id !== l.id);
  salvar();
  render();
}

// ---------- Backup ----------

$('#exportar').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(lancamentos, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `minhas-financas-${hojeISO()}.json`;
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
});

$('#importar').addEventListener('change', async (e) => {
  const arquivo = e.target.files[0];
  e.target.value = '';
  if (!arquivo) return;
  try {
    const dados = JSON.parse(await arquivo.text());
    if (!Array.isArray(dados)) throw new Error();
    const novos = dados.filter(valido);
    if (!novos.length) throw new Error();
    const ids = new Set(lancamentos.map((l) => l.id));
    let adicionados = 0;
    for (const l of novos) {
      const id = typeof l.id === 'string' && !ids.has(l.id) ? l.id : gerarId();
      ids.add(id);
      lancamentos.push({ ...l, id });
      adicionados++;
    }
    salvar();
    render();
    alert(`${adicionados} lançamento(s) importado(s).`);
  } catch {
    alert('Arquivo de backup inválido.');
  }
});

// ---------- Início ----------

form.elements.data.value = hojeISO();
preencherCategorias('gasto');
render();
