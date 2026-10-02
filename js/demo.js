// ================================================================
//  AudiStock — js/demo.js
//  Modo demonstração: um Supabase de mentira, em memória, com
//  empresas, produtos, auditorias e usuários fictícios.
//
//  Entra com ?demo=1 em qualquer página (ou pelo botão do login) e
//  sai pelo "Sair". Nada sai do navegador: o banco fica no
//  sessionStorage da aba e some quando ela é fechada.
//
//  O cliente imita só o pedaço da API do supabase-js que o sistema
//  usa (from/select/filtros/ordem/insert/update/delete/upsert, rpc e
//  auth). Qualquer método fora disso fica registrado em
//  errosRegistrados(), para a falta não passar despercebida.
// ================================================================

const CHAVE_MODO  = 'audistock-demo';      // 'completo' | 'vazio'
const CHAVE_BANCO = 'audistock-demo-db';
const VERSAO_BANCO = 2;
export const ID_USUARIO_DEMO = '6f1c2a90-4b7e-4d21-9c3a-0d5e8f7a1b2c';

// ─────────────────────────────────────────────────────────────
//  Entrada e saída
// ─────────────────────────────────────────────────────────────
_lerPedidoDaUrl();

export function demoAtivo() {
  try { return !!sessionStorage.getItem(CHAVE_MODO); } catch (_) { return false; }
}

export function sairDemo() {
  try { sessionStorage.removeItem(CHAVE_MODO); sessionStorage.removeItem(CHAVE_BANCO); } catch (_) {}
}

// ?demo=1 entra (banco novo), ?demo=vazio entra sem cadastros, ?demo=0 sai.
// O parâmetro sai da barra de endereço para não ser copiado adiante.
function _lerPedidoDaUrl() {
  const params = new URLSearchParams(location.search);
  if (!params.has('demo')) return;
  const pedido = params.get('demo');
  try {
    if (pedido === '0') sairDemo();
    else {
      sessionStorage.setItem(CHAVE_MODO, pedido === 'vazio' ? 'vazio' : 'completo');
      sessionStorage.removeItem(CHAVE_BANCO);
    }
  } catch (_) {}
  params.delete('demo');
  const resto = params.toString();
  history.replaceState(history.state, '', location.pathname + (resto ? '?' + resto : '') + location.hash);
}

// ─────────────────────────────────────────────────────────────
//  Cliente
// ─────────────────────────────────────────────────────────────
export function criarClienteDemo() {
  const banco = _carregarBanco();
  const usuarioAuth = () => {
    const u = banco.tabelas.usuarios.find(x => x.id === ID_USUARIO_DEMO);
    return { id: ID_USUARIO_DEMO, email: u?.email ?? 'demo@audistock.example' };
  };

  return {
    from: tabela => _comGuarda(new Consulta(banco, tabela), `from('${tabela}')`),

    rpc: async (nome, args = {}) => {
      await _espera();
      if (nome === 'gerar_numero_auditoria') {
        const ano = new Date().getFullYear();
        const prefixo = `AUD-${ano}-`;
        const maior = banco.tabelas.auditorias
          .filter(a => a.numero_auditoria?.startsWith(prefixo))
          .reduce((m, a) => Math.max(m, Number(a.numero_auditoria.slice(prefixo.length)) || 0), 0);
        return { data: prefixo + String(maior + 1).padStart(4, '0'), error: null };
      }
      return _falhaNaoSuportada(`rpc('${nome}')`);
    },

    auth: {
      async getSession() { return { data: { session: { user: usuarioAuth(), access_token: 'demo' } }, error: null }; },
      async getUser() { return { data: { user: usuarioAuth() }, error: null }; },
      async signInWithPassword() { await _espera(); return { data: { user: usuarioAuth(), session: { user: usuarioAuth() } }, error: null }; },
      async signOut() { sairDemo(); return { error: null }; },
      async signUp({ email }) {
        await _espera();
        if (banco.tabelas.usuarios.some(u => u.email === String(email).toLowerCase())) {
          return { data: { user: null }, error: { message: 'User already registered' } };
        }
        return { data: { user: { id: _uuidAleatorio(), email } }, error: null };
      },
      async updateUser({ password } = {}) {
        await _espera();
        if (password != null && String(password).length < 6) return { data: { user: null }, error: { message: 'Password should be at least 6 characters.' } };
        return { data: { user: usuarioAuth() }, error: null };
      },
      onAuthStateChange() { return { data: { subscription: { unsubscribe() {} } } }; },
    },

    channel: () => _comGuarda({}, 'channel()'),
  };
}

// Embrulha o objeto para que um método que o demo não conhece vire
// registro de erro, e não um "x is not a function" engolido num catch.
function _comGuarda(alvo, origem) {
  return new Proxy(alvo, {
    get(obj, prop) {
      if (typeof prop !== 'string' || prop in obj) return Reflect.get(obj, prop);
      _registrar(`Demo: método não suportado ${origem}.${prop}()`);
      return () => _comGuarda(obj, origem);
    },
  });
}

function _registrar(msg) { try { window.__registrarErro?.('demo', msg, ''); } catch (_) {} console.warn('[demo]', msg); }
function _falhaNaoSuportada(o) { _registrar(`Demo: operação não suportada ${o}`); return { data: null, error: { message: `Operação não suportada no modo demonstração: ${o}` } }; }
// Um respiro de rede, para os estados de carregamento aparecerem como na vida real.
function _espera() { return new Promise(r => setTimeout(r, 60 + Math.random() * 90)); }

// ─────────────────────────────────────────────────────────────
//  Consulta encadeável (imita o PostgrestQueryBuilder)
// ─────────────────────────────────────────────────────────────
const RESTRICOES_UNICAS = {
  produtos:        [['empresa_id', 'codigo_produto']],
  auditorias:      [['numero_auditoria']],
  auditoria_itens: [['auditoria_id', 'produto_id']],
  usuarios:        [['email']],
};

class Consulta {
  constructor(banco, tabela) {
    this.banco = banco; this.tabela = tabela;
    this.op = 'select'; this.colunas = '*'; this.contar = null; this.soCabecalho = false;
    this.filtros = []; this.ordens = []; this.de = null; this.ate = null; this.limite = null;
    this.unico = null; this.carga = null; this.retorno = null; this.opcoesUpsert = {};
  }

  select(colunas = '*', { count = null, head = false } = {}) {
    if (this.op === 'select') { this.colunas = colunas; this.contar = count; this.soCabecalho = head; }
    else this.retorno = colunas;
    return this;
  }
  insert(linhas)            { this.op = 'insert'; this.carga = [].concat(linhas); return this; }
  upsert(linhas, opcoes={}) { this.op = 'upsert'; this.carga = [].concat(linhas); this.opcoesUpsert = opcoes; return this; }
  update(campos)            { this.op = 'update'; this.carga = campos; return this; }
  delete()                  { this.op = 'delete'; return this; }

  eq(c, v)    { return this._filtro(l => _igual(l[c], v)); }
  neq(c, v)   { return this._filtro(l => l[c] != null && !_igual(l[c], v)); }
  gt(c, v)    { return this._filtro(l => l[c] != null && _comparar(l[c], v) > 0); }
  gte(c, v)   { return this._filtro(l => l[c] != null && _comparar(l[c], v) >= 0); }
  lt(c, v)    { return this._filtro(l => l[c] != null && _comparar(l[c], v) < 0); }
  lte(c, v)   { return this._filtro(l => l[c] != null && _comparar(l[c], v) <= 0); }
  in(c, vs)   { return this._filtro(l => vs.some(v => _igual(l[c], v))); }
  is(c, v)    { return this._filtro(l => (v === null ? l[c] == null : l[c] === v)); }
  ilike(c, p) { const re = _padraoLike(p, 'i'); return this._filtro(l => l[c] != null && re.test(String(l[c]))); }
  like(c, p)  { const re = _padraoLike(p, '');  return this._filtro(l => l[c] != null && re.test(String(l[c]))); }
  match(obj)  { Object.entries(obj).forEach(([c, v]) => this.eq(c, v)); return this; }
  // or('col.op.valor,col.op.valor') — só os operadores usados pelo sistema
  or(expr) {
    const partes = String(expr).split(',').map(p => {
      const [, col, op, valor] = p.trim().match(/^([\w]+)\.(\w+)\.([\s\S]*)$/) ?? [];
      if (!col) { _registrar(`Demo: or() com termo não entendido: ${p}`); return () => false; }
      const ops = {
        eq: l => _igual(l[col], valor), neq: l => !_igual(l[col], valor),
        ilike: l => l[col] != null && _padraoLike(valor, 'i').test(String(l[col])),
        like:  l => l[col] != null && _padraoLike(valor, '').test(String(l[col])),
        gt: l => _comparar(l[col], valor) > 0, lt: l => _comparar(l[col], valor) < 0,
      };
      if (!ops[op]) { _registrar(`Demo: operador não suportado em or(): ${op}`); return () => false; }
      return ops[op];
    });
    return this._filtro(l => partes.some(f => f(l)));
  }

  order(c, { ascending = true } = {}) { this.ordens.push({ c, asc: ascending }); return this; }
  range(de, ate) { this.de = de; this.ate = ate; return this; }
  limit(n)       { this.limite = n; return this; }
  single()       { this.unico = 'single'; return this; }
  maybeSingle()  { this.unico = 'maybe'; return this; }

  then(ok, falha) { return this._executar().then(ok, falha); }

  _filtro(f) { this.filtros.push(f); return this; }

  async _executar() {
    await _espera();
    try {
      if (!(this.tabela in this.banco.tabelas) && !(this.tabela in VISOES)) {
        _registrar(`Demo: tabela desconhecida "${this.tabela}"`);
        return _erro(`relation "public.${this.tabela}" does not exist`, '42P01');
      }
      switch (this.op) {
        case 'select': return this._select();
        case 'insert': return this._insert(this.carga);
        case 'upsert': return this._upsert();
        case 'update': return this._update();
        case 'delete': return this._delete();
      }
    } catch (e) {
      _registrar(`Demo: falha em ${this.op} ${this.tabela}: ${e.message}`);
      return _erro(e.message);
    }
  }

  _linhas() { return VISOES[this.tabela] ? VISOES[this.tabela](this.banco) : this.banco.tabelas[this.tabela]; }
  _filtradas() { return this._linhas().filter(l => this.filtros.every(f => f(l))); }

  _select() {
    let linhas = this._filtradas();
    const total = linhas.length;
    linhas = _ordenar(linhas, this.ordens);
    if (this.de != null) linhas = linhas.slice(this.de, this.ate + 1);
    if (this.limite != null) linhas = linhas.slice(0, this.limite);
    linhas = linhas.slice(0, MAX_LINHAS);   // como o max-rows do Supabase real
    const data = this.soCabecalho ? null : linhas.map(l => _projetar(this.banco, this.tabela, l, this.colunas));
    return this._resposta(data, this.contar ? total : null);
  }

  _insert(cargas) {
    const tabela = this.banco.tabelas[this.tabela];
    const novas = cargas.map(c => _completar(this.tabela, { ...c }));
    for (const n of novas) {
      const conflito = _violaUnica(this.tabela, tabela.concat(novas.filter(x => x !== n)), n);
      if (conflito) return _erro(`duplicate key value violates unique constraint "${this.tabela}_${conflito.join('_')}_key"`, '23505');
    }
    tabela.push(...novas);
    _salvar(this.banco);
    return this._resposta(this.retorno ? novas.map(l => _projetar(this.banco, this.tabela, l, this.retorno)) : null);
  }

  _upsert() {
    const tabela = this.banco.tabelas[this.tabela];
    const chaves = String(this.opcoesUpsert.onConflict ?? 'id').split(',').map(s => s.trim());
    const afetadas = [], novas = [];
    for (const c of this.carga) {
      const existente = tabela.find(l => chaves.every(k => _igual(l[k], c[k])));
      if (existente) {
        if (this.opcoesUpsert.ignoreDuplicates) continue;
        Object.assign(existente, c); _recalcular(this.tabela, existente); afetadas.push(existente);
      } else novas.push(c);
    }
    if (novas.length) {
      const r = this._insert(novas);
      if (r.error) return r;
    } else _salvar(this.banco);
    return this._resposta(this.retorno ? afetadas.map(l => _projetar(this.banco, this.tabela, l, this.retorno)) : null);
  }

  _update() {
    const alvo = this._filtradas();
    for (const l of alvo) {
      const depois = { ...l, ...this.carga };
      const conflito = _violaUnica(this.tabela, this.banco.tabelas[this.tabela].filter(x => x !== l), depois);
      if (conflito) return _erro(`duplicate key value violates unique constraint "${this.tabela}_${conflito.join('_')}_key"`, '23505');
    }
    alvo.forEach(l => { Object.assign(l, this.carga); _recalcular(this.tabela, l); });
    _salvar(this.banco);
    return this._resposta(this.retorno ? alvo.map(l => _projetar(this.banco, this.tabela, l, this.retorno)) : null);
  }

  _delete() {
    const alvo = new Set(this._filtradas());
    const t = this.banco.tabelas;
    t[this.tabela] = t[this.tabela].filter(l => !alvo.has(l));
    // ON DELETE CASCADE do schema: auditoria → itens → histórico
    if (this.tabela === 'auditorias') {
      const ids = new Set([...alvo].map(a => a.id));
      const itens = new Set(t.auditoria_itens.filter(i => ids.has(i.auditoria_id)).map(i => i.id));
      t.auditoria_itens = t.auditoria_itens.filter(i => !itens.has(i.id));
      t.auditoria_itens_historico = t.auditoria_itens_historico.filter(h => !itens.has(h.auditoria_item_id));
    }
    _salvar(this.banco);
    return this._resposta(this.retorno ? [...alvo].map(l => _projetar(this.banco, this.tabela, l, this.retorno)) : null);
  }

  _resposta(data, count = null) {
    if (this.unico && Array.isArray(data)) {
      if (data.length === 1) data = data[0];
      else if (data.length === 0 && this.unico === 'maybe') data = null;
      else return _erro('JSON object requested, multiple (or no) rows returned', 'PGRST116');
    }
    return { data: data == null ? data : structuredClone(data), error: null, count, status: 200 };
  }
}

// O Supabase entrega no máximo 1.000 linhas por consulta; o demo faz o mesmo,
// para que uma tela que esqueça de paginar falhe aqui também.
const MAX_LINHAS = 1000;

function _erro(message, code = 'DEMO') { return { data: null, error: { message, code }, count: null, status: 400 }; }

function _igual(a, b) {
  if (a == null || b == null) return false;
  if (typeof a === 'boolean' || typeof b === 'boolean') return String(a) === String(b);
  return String(a) === String(b);
}
function _comparar(a, b) {
  const na = Number(a), nb = Number(b);
  if (!isNaN(na) && !isNaN(nb) && a !== '' && b !== '') return na - nb;
  return String(a).localeCompare(String(b), 'pt-BR');
}
function _padraoLike(p, flags) {
  const re = String(p).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.');
  return new RegExp(`^${re}$`, flags);
}
// Postgres: crescente com nulos no fim, decrescente com nulos no começo.
function _ordenar(linhas, ordens) {
  if (!ordens.length) return linhas.slice();
  return linhas.slice().sort((x, y) => {
    for (const { c, asc } of ordens) {
      const a = x[c], b = y[c];
      if (a == null && b == null) continue;
      if (a == null) return asc ? 1 : -1;
      if (b == null) return asc ? -1 : 1;
      const r = _comparar(a, b);
      if (r) return asc ? r : -r;
    }
    return 0;
  });
}

// select('a, b, empresas(nome), usuarios!fk(nome)')
function _dividirColunas(txt) {
  const partes = []; let nivel = 0, atual = '';
  for (const ch of String(txt)) {
    if (ch === '(') nivel++;
    if (ch === ')') nivel--;
    if (ch === ',' && nivel === 0) { partes.push(atual.trim()); atual = ''; continue; }
    atual += ch;
  }
  if (atual.trim()) partes.push(atual.trim());
  return partes.filter(Boolean);
}

const RELACOES = {
  auditorias:                { empresas: 'empresa_id', usuarios: 'criado_por' },
  auditoria_itens:           { produtos: 'produto_id', usuarios: 'registrado_por', auditorias: 'auditoria_id' },
  auditoria_itens_historico: { usuarios: 'usuario_id' },
  produtos:                  { empresas: 'empresa_id' },
  usuarios:                  { empresas: 'empresa_id' },
};

function _projetar(banco, tabela, linha, colunas) {
  const campos = _dividirColunas(colunas || '*');
  const saida = campos.includes('*') ? { ...linha } : {};
  for (const c of campos) {
    if (c === '*') continue;
    const m = c.match(/^(?:(\w+):)?(\w+)(?:!(\w+))?\s*\(([\s\S]*)\)$/);
    if (m) {
      const [, apelido, rel, dica, sub] = m;
      const fkDaDica = dica?.match(new RegExp(`^${tabela}_(\\w+)_fkey$`))?.[1];
      const fk = fkDaDica ?? RELACOES[tabela]?.[rel];
      if (!fk || !banco.tabelas[rel]) { _registrar(`Demo: relação não mapeada ${tabela} → ${c}`); saida[apelido ?? rel] = null; continue; }
      const alvo = banco.tabelas[rel].find(r => r.id === linha[fk]);
      saida[apelido ?? rel] = alvo ? _projetar(banco, rel, alvo, sub) : null;
    } else saida[c] = linha[c] ?? null;
  }
  return saida;
}

function _completar(tabela, l) {
  const agora = new Date().toISOString();
  l.id ??= _uuidAleatorio();
  if (['empresas', 'produtos', 'usuarios'].includes(tabela)) { l.ativo ??= true; l.criado_em ??= agora; }
  if (tabela === 'auditoria_itens') { l.data_registro ??= agora; l.estoque_sistema ??= null; }
  if (tabela === 'auditoria_itens_historico') l.criado_em ??= agora;
  if (tabela === 'auditorias') l.criado_em ??= agora;
  _recalcular(tabela, l);
  return l;
}
// Coluna gerada do schema: diferenca = contado − sistema
function _recalcular(tabela, l) {
  if (tabela !== 'auditoria_itens') return;
  l.diferenca = l.estoque_sistema == null || l.quantidade_contada == null
    ? null : _arred(Number(l.quantidade_contada) - Number(l.estoque_sistema));
}
function _violaUnica(tabela, outras, linha) {
  for (const cols of RESTRICOES_UNICAS[tabela] ?? []) {
    if (cols.every(c => linha[c] != null) && outras.some(o => cols.every(c => _igual(o[c], linha[c])))) return cols;
  }
  return null;
}
const _arred = n => Math.round(n * 1000) / 1000;

// ─────────────────────────────────────────────────────────────
//  Visões (vw_relatorio_divergencias, vw_produtos_nao_auditados)
// ─────────────────────────────────────────────────────────────
const VISOES = {
  vw_relatorio_divergencias(banco) {
    const prod = new Map(banco.tabelas.produtos.map(p => [p.id, p]));
    return banco.tabelas.auditoria_itens.map(i => {
      const p = prod.get(i.produto_id) ?? {};
      const d = i.diferenca;
      return {
        auditoria_id: i.auditoria_id, item_id: i.id, produto_id: i.produto_id,
        codigo_produto: p.codigo_produto, nome_produto: p.nome_produto, unidade_medida: p.unidade_medida,
        quantidade_contada: i.quantidade_contada, estoque_sistema: i.estoque_sistema, diferenca: d,
        status_divergencia: d > 0 ? 'sobra' : d < 0 ? 'falta' : 'ok',
        data_registro: i.data_registro,
      };
    });
  },
  vw_produtos_nao_auditados(banco) {
    const contados = new Set(banco.tabelas.auditoria_itens.map(i => i.auditoria_id + '|' + i.produto_id));
    return banco.tabelas.auditorias.flatMap(a => banco.tabelas.produtos
      .filter(p => p.empresa_id === a.empresa_id && p.ativo && !contados.has(a.id + '|' + p.id))
      .map(p => ({ auditoria_id: a.id, produto_id: p.id, codigo_produto: p.codigo_produto, nome_produto: p.nome_produto, unidade_medida: p.unidade_medida })));
  },
};

// ─────────────────────────────────────────────────────────────
//  Banco: carga, gravação e semente
// ─────────────────────────────────────────────────────────────
function _carregarBanco() {
  try {
    const salvo = JSON.parse(sessionStorage.getItem(CHAVE_BANCO) || 'null');
    if (salvo?.versao === VERSAO_BANCO) return salvo;
  } catch (_) {}
  const banco = _semear(sessionStorage.getItem(CHAVE_MODO) ?? 'completo');
  _salvar(banco);
  return banco;
}
function _salvar(banco) {
  try { sessionStorage.setItem(CHAVE_BANCO, JSON.stringify(banco)); }
  catch (e) { _registrar('Demo: não foi possível gravar o banco na sessão: ' + e.message); }
}
function _uuidAleatorio() { return crypto.randomUUID?.() ?? _uuid(Math.random); }

// Gerador com semente fixa: a demonstração é sempre a mesma.
function _mulberry32(a) {
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
function _uuid(rnd) {
  const h = n => Array.from({ length: n }, () => Math.floor(rnd() * 16).toString(16)).join('');
  return `${h(8)}-${h(4)}-4${h(3)}-${'89ab'[Math.floor(rnd() * 4)]}${h(3)}-${h(12)}`;
}
// EAN-13 com prefixo 2 (uso interno, nunca colide com produto real)
function _ean13(rnd) {
  const d = '2' + Array.from({ length: 11 }, () => Math.floor(rnd() * 10)).join('');
  const soma = [...d].reduce((s, c, i) => s + Number(c) * (i % 2 ? 3 : 1), 0);
  return d + ((10 - soma % 10) % 10);
}

// nome | unidade — a unidade decide a escala das quantidades
const CATALOGO_AURORA = `Arroz Branco Tipo 1 1kg|PCT;Arroz Branco Tipo 1 5kg|PCT;Arroz Parboilizado 5kg|PCT;Arroz Integral 1kg|PCT;Feijão Carioca 1kg|PCT;Feijão Preto 1kg|PCT;Feijão Fradinho 500g|PCT;Lentilha 500g|PCT;Grão-de-bico 500g|PCT;Milho de Pipoca 500g|PCT;Canjica Branca 500g|PCT;Açúcar Refinado 1kg|PCT;Açúcar Cristal 5kg|PCT;Açúcar Mascavo 500g|PCT;Café Torrado e Moído 250g|UN;Café Torrado e Moído 500g|UN;Café em Grãos 1kg|UN;Óleo de Soja 900ml|UN;Óleo de Girassol 900ml|UN;Azeite Extra Virgem 500ml|UN;Leite UHT Integral 1L|CX;Leite UHT Desnatado 1L|CX;Leite em Pó Integral 400g|UN;Macarrão Espaguete 500g|PCT;Macarrão Parafuso 500g|PCT;Macarrão Penne 500g|PCT;Massa para Lasanha 500g|PCT;Macarrão Instantâneo 85g|CX;Farinha de Trigo 1kg|PCT;Farinha de Trigo 5kg|PCT;Farinha de Mandioca 500g|PCT;Fubá Mimoso 1kg|PCT;Amido de Milho 500g|UN;Polvilho Doce 500g|PCT;Polvilho Azedo 500g|PCT;Goma de Tapioca 500g|PCT;Sal Refinado 1kg|PCT;Sal Grosso 1kg|PCT;Molho de Tomate Tradicional 340g|UN;Extrato de Tomate 190g|UN;Biscoito Cream Cracker 400g|PCT;Biscoito Maisena 400g|PCT;Biscoito Recheado Chocolate 140g|PCT;Rosquinha de Coco 400g|PCT;Achocolatado em Pó 400g|UN;Chocolate em Pó 50% 200g|UN;Milho Verde em Conserva 170g|UN;Ervilha em Conserva 170g|UN;Seleta de Legumes 170g|UN;Sardinha em Óleo 125g|UN;Atum Sólido em Óleo 170g|UN;Creme de Leite 200g|UN;Leite Condensado 395g|UN;Margarina com Sal 500g|UN;Manteiga com Sal 200g|UN;Queijo Muçarela Fatiado|KG;Queijo Prato Fatiado|KG;Presunto Cozido Fatiado|KG;Mortadela Fatiada|KG;Peito de Peru Defumado|KG;Fermento Químico em Pó 100g|UN;Gelatina Sabor Morango 25g|CX;Aveia em Flocos Finos 200g|UN;Granola Tradicional 800g|PCT;Cereal Matinal de Milho 300g|UN;Mel Silvestre 280g|UN;Geleia de Morango 230g|UN;Ketchup Tradicional 380g|UN;Maionese 500g|UN;Mostarda Amarela 200g|UN;Vinagre de Álcool 750ml|UN;Vinagre de Maçã 750ml|UN;Alho Triturado 200g|UN;Tempero Completo 300g|UN;Colorau em Pó 80g|UN;Pimenta-do-reino Moída 30g|UN;Orégano Desidratado 10g|UN;Caldo de Galinha em Tablete|CX;Goiabada Cascão 300g|UN;Doce de Leite Pastoso 400g|UN;Paçoca de Amendoim|CX;Água Mineral sem Gás 500ml|FD;Água Mineral com Gás 500ml|FD;Água Mineral sem Gás 1,5L|FD;Refrigerante de Cola 2L|FD;Refrigerante de Guaraná 2L|FD;Refrigerante de Laranja 2L|FD;Suco Integral de Uva 1L|UN;Néctar de Pêssego 1L|UN;Detergente Líquido Neutro 500ml|CX;Sabão em Pó 1,6kg|UN;Sabão em Barra 5x200g|PCT;Amaciante de Roupas 2L|UN;Água Sanitária 2L|UN;Desinfetante Lavanda 2L|UN;Limpador Multiuso 500ml|UN;Esponja Dupla Face|PCT;Saco de Lixo 50L|PCT;Saco de Lixo 100L|PCT;Papel Toalha 2 Rolos|PCT;Papel Higiênico Folha Dupla 12 Rolos|PCT;Guardanapo de Papel 50un|PCT;Lã de Aço 8un|PCT;Pano de Chão Alvejado|UN;Rodo de Plástico 40cm|UN;Vassoura de Pelo|UN;Shampoo 350ml|UN;Condicionador 350ml|UN;Sabonete em Barra 85g|UN;Creme Dental 90g|UN;Escova Dental Média|UN;Desodorante Aerossol 150ml|UN;Fio Dental 50m|UN;Absorvente com Abas 8un|PCT;Fralda Infantil Tamanho M|PCT;Algodão em Bolas 50g|PCT;Hastes Flexíveis 75un|CX;Copo Descartável 200ml 100un|PCT;Prato Descartável Raso 10un|PCT;Filme PVC 28cm x 15m|UN;Papel Alumínio 30cm x 4m|UN;Filtro de Papel 103|CX;Pilha Alcalina AA 4un|PCT;Pilha Alcalina AAA 4un|PCT;Lâmpada LED Bulbo 9W|UN;Fósforo Longo 10 Caixas|PCT;Vela Branca nº 7|PCT;Carvão Vegetal 3kg|SC;Ração para Cães Adultos 10,1kg|SC;Ração para Gatos 1kg|PCT;Areia Higiênica para Gatos 4kg|PCT`;
const CATALOGO_SERRA = `Água Mineral sem Gás 500ml|FD;Água Mineral com Gás 500ml|FD;Água Mineral sem Gás 1,5L|FD;Água de Coco 1L|UN;Refrigerante de Cola 350ml Lata|FD;Refrigerante de Cola 2L|FD;Refrigerante de Guaraná 350ml Lata|FD;Refrigerante de Guaraná 2L|FD;Refrigerante Limão 2L|FD;Refrigerante de Laranja 2L|FD;Água Tônica 350ml Lata|FD;Cerveja Pilsen 350ml Lata|FD;Cerveja Pilsen 600ml Garrafa|CX;Cerveja Puro Malte 350ml Lata|FD;Cerveja sem Álcool 350ml Lata|FD;Chope de Vinho 1L|UN;Vinho Tinto Seco 750ml|CX;Vinho Branco Seco 750ml|CX;Espumante Brut 750ml|CX;Suco Integral de Uva 1L|UN;Suco Integral de Laranja 1L|UN;Néctar de Pêssego 1L|UN;Néctar de Manga 1L|UN;Chá Gelado de Limão 1,5L|FD;Isotônico Laranja 500ml|FD;Energético 250ml Lata|FD;Bebida Láctea Morango 900g|UN;Leite UHT Integral 1L|CX;Gelo em Cubos 5kg|SC;Carvão Vegetal 5kg|SC;Copo Descartável 300ml 100un|PCT;Arroz Branco Tipo 1 5kg|PCT;Feijão Carioca 1kg|PCT;Açúcar Refinado 1kg|PCT;Café Torrado e Moído 500g|UN;Óleo de Soja 900ml|UN;Macarrão Espaguete 500g|PCT;Farinha de Trigo 1kg|PCT;Sal Refinado 1kg|PCT;Molho de Tomate Tradicional 340g|UN;Biscoito Cream Cracker 400g|PCT;Batata Palha 120g|UN;Amendoim Torrado Salgado 500g|PCT;Salgadinho de Milho 140g|PCT;Azeitona Verde 200g|UN;Palmito em Conserva 300g|UN;Queijo Coalho em Espeto|KG;Linguiça Toscana|KG;Picanha Bovina Resfriada|KG;Fraldinha Bovina Resfriada|KG;Coxinha da Asa Congelada|KG;Pão de Alho 300g|UN;Farofa Pronta 500g|PCT;Vinagrete Pronto 300g|UN;Guardanapo de Papel 50un|PCT;Saco de Gelo 2kg|PCT;Detergente Líquido Neutro 500ml|CX;Saco de Lixo 100L|PCT;Papel Toalha 2 Rolos|PCT;Limpador Multiuso 500ml|UN;Esponja Dupla Face|PCT;Pilha Alcalina AA 4un|PCT;Isqueiro Comum|CX;Fósforo Longo 10 Caixas|PCT`;
const CATALOGO_HORIZONTE = `Parafuso Sextavado 1/4" x 2"|CT;Parafuso Phillips 4,2 x 32mm|CT;Bucha de Nylon 6mm|CT;Bucha de Nylon 8mm|CT;Prego com Cabeça 17x27|KG;Arruela Lisa 1/4"|CT;Porca Sextavada 1/4"|CT;Fita Isolante 19mm x 20m|UN;Fita Crepe 18mm x 50m|UN;Fita Veda Rosca 18mm x 25m|UN;Cabo Flexível 2,5mm Rolo 100m|RL;Cabo Flexível 4,0mm Rolo 100m|RL;Disjuntor Unipolar 20A|UN;Disjuntor Bipolar 40A|UN;Tomada 2P+T 10A|UN;Tomada 2P+T 20A|UN;Interruptor Simples|UN;Plugue Macho 10A|UN;Lâmpada LED Bulbo 12W|UN;Lâmpada LED Tubular 18W|UN;Refletor LED 50W|UN;Tinta Acrílica Branco Neve 18L|GL;Tinta Acrílica Branco Neve 3,6L|GL;Massa Corrida 25kg|BD;Selador Acrílico 18L|GL;Rolo de Lã 23cm|UN;Pincel Cerda Gris 2"|UN;Bandeja para Pintura|UN;Lixa d'Água 220|UN;Lixa para Madeira 100|UN;Cimento CP II 50kg|SC;Argamassa AC-I 20kg|SC;Rejunte Flexível Cinza 1kg|UN;Cal Hidratada 20kg|SC;Areia Média Ensacada 20kg|SC;Tubo PVC Soldável 25mm 6m|BR;Joelho PVC 90° 25mm|UN;Registro de Gaveta 3/4"|UN;Torneira de Jardim 1/2"|UN;Mangueira de Jardim 20m|UN;Martelo Unha 27mm|UN;Chave de Fenda 1/4" x 6"|UN;Alicate Universal 8"|UN;Trena 5m|UN;Nível de Alumínio 40cm|UN;Luva de Látex Tamanho M|PR;Cadeado 30mm|UN;Corrente Galvanizada 5mm|M`;
const CATALOGO_VALE = `Granola Artesanal 500g|PCT;Castanha-do-pará 200g|PCT;Castanha de Caju 200g|PCT;Damasco Seco 200g|PCT;Uva-passa Escura 200g|PCT;Mix de Nuts 200g|PCT;Chia em Grãos 200g|PCT;Linhaça Dourada 200g|PCT;Quinoa em Grãos 200g|PCT;Farinha de Amêndoas 200g|PCT;Açúcar de Coco 250g|PCT;Mel Orgânico 500g|UN;Azeite Extra Virgem 250ml|UN;Café Especial em Grãos 250g|UN;Chá Verde 20 Sachês|CX;Pasta de Amendoim 450g|UN;Biscoito de Arroz 150g|PCT;Barra de Cereal 12un|CX;Cacau em Pó 100% 200g|UN;Coco Ralado sem Açúcar 100g|PCT`;

function _semear(cenario) {
  const rnd = _mulberry32(20261001);
  const id = () => _uuid(rnd);
  const entre = (a, b) => a + Math.floor(rnd() * (b - a + 1));
  const hoje = new Date(); hoje.setSeconds(0, 0);
  const em = (dias, h, m) => { const d = new Date(hoje); d.setDate(d.getDate() - dias); d.setHours(h, m, 0, 0); return d; };

  const t = { empresas: [], usuarios: [], produtos: [], auditorias: [], auditoria_itens: [], auditoria_itens_historico: [], auditoria_exclusoes_log: [], importacoes_produtos: [] };
  const banco = { versao: VERSAO_BANCO, cenario, tabelas: t };

  const usuario = (nome, email, role, empresa_id = null, ativo = true, uid = id()) => {
    const u = { id: uid, nome, email, role, empresa_id, ativo, senha_hash: 'auth-supabase', criado_em: em(200, 9, 0).toISOString(), ultimo_acesso: em(entre(0, 6), entre(7, 18), entre(0, 59)).toISOString() };
    t.usuarios.push(u); return u;
  };
  const eu = usuario('Helena Duarte', 'helena.duarte@audistock.example', 'supremo', null, true, ID_USUARIO_DEMO);
  if (cenario === 'vazio') return banco;

  const empresa = (nome, cnpj, cidade, estado, endereco, ativo = true) => {
    const e = { id: id(), nome, cnpj, cidade, estado, endereco, observacoes: null, ativo, criado_em: em(entre(180, 400), 10, 0).toISOString() };
    t.empresas.push(e); return e;
  };
  const aurora    = empresa('Distribuidora Aurora',        '12.418.337/0001-00', 'Cuiabá',     'MT', 'Av. das Torres, 1820 — Distrito Industrial');
  const serra     = empresa('Atacado Serra Azul',          '27.904.115/0001-67', 'Goiânia',    'GO', 'Rod. GO-060, km 4,5');
  const horizonte = empresa('Ferragens Horizonte',         '08.553.761/0001-82', 'Campo Grande','MS', 'Rua Rui Barbosa, 2245 — Centro');
  empresa('Distribuidora Aurora — Filial Norte', '12.418.337/0002-83', 'Sinop', 'MT', 'Av. dos Tarumãs, 640');  // nova, ainda sem produtos
  const vale      = empresa('Empório Vale Verde',          '33.120.884/0001-77', 'Rondonópolis','MT', 'Rua Fernando Corrêa, 512', false);

  const rafael = usuario('Rafael Antunes', 'rafael.antunes@audistock.example', 'administrador');
  const bianca = usuario('Bianca Moreira', 'bianca.moreira@audistock.example', 'auditor', aurora.id);
  const joana  = usuario('Joana Ribeiro',  'joana.ribeiro@audistock.example',  'auditor', aurora.id);
  const tiago  = usuario('Tiago Ferraz',   'tiago.ferraz@audistock.example',   'auditor', horizonte.id);
  const caio   = usuario('Caio Mendes',    'caio.mendes@audistock.example',    'auditor', serra.id, false);
  usuario('Lúcia Prado', 'lucia.prado@audistock.example', 'visualizador');
  usuario('Otávio Lins', 'otavio.lins@audistock.example', 'auditor', serra.id);

  // Códigos crescentes com saltos de 1 a 3, como num cadastro que já teve exclusões
  const produtos = (emp, catalogo, prefixo, inicio, digitos) => {
    let n = inicio;
    return catalogo.split(';').map(linha => {
      const [nome, unidade] = linha.split('|');
      n += entre(1, 3);
      const p = { id: id(), empresa_id: emp.id, codigo_produto: prefixo + String(n).padStart(digitos, '0'), nome_produto: nome, unidade_medida: unidade, codigo_barras: rnd() < 0.9 ? _ean13(rnd) : null, observacoes: null, ativo: true, criado_em: emp.criado_em };
      t.produtos.push(p); return p;
    });
  };
  const pAurora    = produtos(aurora, CATALOGO_AURORA, '10', 1000, 4);
  const pSerra     = produtos(serra, CATALOGO_SERRA, 'SA-', 0, 4);
  const pHorizonte = produtos(horizonte, CATALOGO_HORIZONTE, 'FH', 0, 5);
  const pVale      = produtos(vale, CATALOGO_VALE, 'VV', 0, 4);
  pAurora.filter((_, i) => i % 41 === 40).forEach(p => { p.ativo = false; });
  pVale.forEach(p => { p.ativo = false; });

  // Escala de estoque por unidade: [mínimo, máximo, casas decimais]
  const ESCALA = { UN: [8, 220, 0], PCT: [6, 140, 0], CX: [2, 48, 0], FD: [3, 40, 0], KG: [4, 60, 3], SC: [4, 60, 0], CT: [3, 30, 0], RL: [1, 14, 0], GL: [2, 24, 0], BD: [2, 18, 0], BR: [6, 80, 0], PR: [10, 120, 0], M: [20, 300, 1] };
  const saldo = un => { const [a, b, c] = ESCALA[un] ?? ESCALA.UN; return c ? _arred(a + rnd() * (b - a)) : entre(a, b); };
  const desvio = (un, base) => {
    const [, , c] = ESCALA[un] ?? ESCALA.UN;
    const r = rnd();
    if (r < 0.74) return 0;
    const mag = c ? _arred(0.15 + rnd() * Math.max(0.5, base * 0.08)) : entre(1, Math.max(1, Math.round(base * 0.12)));
    return r < 0.88 ? -mag : mag;
  };

  let seq = 0;
  const auditoria = ({ emp, lista, criador, contadores, dias, hora, status, cega = true, cobertura = 1, obs = null, duracaoDias = 1, cancelamento = null }) => {
    seq++;
    const inicio = em(dias, hora, entre(0, 50));
    const a = {
      id: id(), numero_auditoria: `AUD-${hoje.getFullYear()}-${String(seq).padStart(4, '0')}`, empresa_id: emp.id, criado_por: criador.id,
      auditoria_cega: cega, status, data_inicio: inicio.toISOString(), data_fim: null, observacoes: obs,
      cancelado_por: null, cancelado_em: null, motivo_cancelamento: null, criado_em: inicio.toISOString(),
    };
    const ativos = lista.filter(p => p.ativo);
    const qtd = Math.round(ativos.length * cobertura);
    const ordem = ativos.slice().sort(() => rnd() - 0.5).slice(0, qtd);
    let relogio = inicio.getTime();
    for (const p of ordem) {
      relogio += entre(40, 260) * 1000;
      const sistema = saldo(p.unidade_medida);
      const contado = Math.max(0, _arred(sistema + desvio(p.unidade_medida, sistema)));
      const item = {
        id: id(), auditoria_id: a.id, produto_id: p.id, quantidade_contada: contado,
        estoque_sistema: status === 'finalizada' ? sistema : null,
        registrado_por: contadores[entre(0, contadores.length - 1)].id,
        data_registro: new Date(relogio).toISOString(), atualizado_em: null,
      };
      _recalcular('auditoria_itens', item);
      t.auditoria_itens.push(item);
    }
    if (status === 'finalizada') a.data_fim = new Date(Math.max(relogio, inicio.getTime()) + duracaoDias * 3600e3 * 2).toISOString();
    if (status === 'cancelada') Object.assign(a, { cancelado_por: criador.id, cancelado_em: new Date(relogio + 3600e3).toISOString(), motivo_cancelamento: cancelamento });
    t.auditorias.push(a);
    return a;
  };

  auditoria({ emp: horizonte, lista: pHorizonte, criador: rafael, contadores: [tiago], dias: 152, hora: 8, status: 'finalizada', cobertura: 0.96, obs: 'Inventário semestral' });
  auditoria({ emp: aurora, lista: pAurora, criador: rafael, contadores: [bianca, joana], dias: 121, hora: 7, status: 'finalizada', cobertura: 0.97, obs: 'Fechamento do 2º trimestre' });
  auditoria({ emp: serra, lista: pSerra, criador: rafael, contadores: [caio], dias: 88, hora: 9, status: 'cancelada', cobertura: 0.3, cancelamento: 'Inventário remarcado pela gerência' });
  auditoria({ emp: aurora, lista: pAurora, criador: eu, contadores: [bianca, joana], dias: 58, hora: 7, status: 'finalizada', cobertura: 0.98, obs: 'Auditoria mensal' });
  auditoria({ emp: horizonte, lista: pHorizonte, criador: rafael, contadores: [tiago], dias: 31, hora: 8, status: 'finalizada', cobertura: 1, obs: 'Conferência pós-reforma do depósito', cega: false });
  auditoria({ emp: serra, lista: pSerra, criador: eu, contadores: [caio], dias: 3, hora: 7, status: 'finalizada', cobertura: 0.95, obs: 'Inventário mensal de bebidas' });
  const andamento = auditoria({ emp: aurora, lista: pAurora, criador: eu, contadores: [bianca, joana], dias: 1, hora: 8, status: 'em_andamento', cobertura: 0.58, obs: 'Auditoria mensal' });
  auditoria({ emp: horizonte, lista: pHorizonte, criador: rafael, contadores: [tiago], dias: 0, hora: 7, status: 'em_andamento', cobertura: 0.19, cega: false });

  // Algumas correções registradas na auditoria em andamento
  const motivos = ['Recontagem do corredor 3', 'Caixa fechada contada como unidade', 'Correção de leitura do coletor', null, 'Produto achado no depósito'];
  t.auditoria_itens.filter(i => i.auditoria_id === andamento.id).slice(4, 9).forEach((item, k) => {
    const anterior = Math.max(0, _arred(item.quantidade_contada + (k % 2 ? 2 : -3)));
    const quando = new Date(new Date(item.data_registro).getTime() + entre(20, 90) * 60e3).toISOString();
    t.auditoria_itens_historico.push({ id: id(), auditoria_item_id: item.id, usuario_id: item.registrado_por, quantidade_anterior: anterior, quantidade_nova: item.quantidade_contada, motivo: motivos[k], criado_em: quando });
    item.atualizado_em = quando;
  });

  return banco;
}
