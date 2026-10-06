// Formatação de números, textos e mensagens de erro (js/ui.js).
import './ambiente.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { fmtQtd, fmtInt, plural, escapeHtml, normalizar, casasDaUnidade, mensagemErro, qtdHtml, lerQuantidade, fmtEntrada } = await import('../../js/ui.js');

// mensagemErro escreve no console o que traduz; aqui isso só suja a saída
const calado = fn => { const [w, e] = [console.warn, console.error]; console.warn = console.error = () => {}; try { return fn(); } finally { [console.warn, console.error] = [w, e]; } };

test('unidades fracionadas sempre com três casas; inteiras sem casas', () => {
  assert.equal(fmtQtd(1.288, 'KG'), '1,288');
  assert.equal(fmtQtd(12, 'kg'), '12,000');
  assert.equal(fmtQtd(1500, 'UN'), '1.500');
  assert.equal(casasDaUnidade('L'), 3);
  assert.equal(casasDaUnidade('PCT'), 0);
  assert.equal(qtdHtml(null, 'UN'), '—');
});

test('plural e números em pt-BR', () => {
  assert.equal(plural(1, 'item', 'itens'), '1 item');
  assert.equal(plural(1200, 'item', 'itens'), '1.200 itens');
  assert.equal(fmtInt(0), '0');
});

test('texto vindo do usuário nunca vira HTML', () => {
  assert.equal(escapeHtml(`<b>"P&G"</b> d'água`), '&lt;b&gt;&quot;P&amp;G&quot;&lt;/b&gt; d&#39;água');
  assert.equal(normalizar('  Ação GOIÂNIA '), 'acao goiania');
});

test('quantidade digitada: vírgula decimal, ponto de milhar e unidade inteira', () => {
  assert.deepEqual(lerQuantidade('', 'UN'), { vazio: true });
  assert.deepEqual(lerQuantidade('1.234', 'UN'), { valor: 1234 });
  assert.deepEqual(lerQuantidade('1.234,5', 'KG'), { valor: 1234.5 });
  assert.deepEqual(lerQuantidade('2,75', 'kg'), { valor: 2.75 });
  assert.match(lerQuantidade('1.234', 'KG').erro, /1,234.*1234/, 'em quilo, "1.234" é ambíguo: a pessoa escolhe');
  assert.deepEqual(lerQuantidade('12.5', 'KG'), { valor: 12.5 });
  assert.match(lerQuantidade('0,1234', 'KG').erro, /3 casas/, 'não arredonda em silêncio');
  assert.match(lerQuantidade('7890000000001', 'PCT').erro, /grande demais/, 'código de barras lido no campo de quantidade');
  assert.deepEqual(lerQuantidade('1.000.000', 'KG'), { valor: 1000000 }, 'com dois pontos, só pode ser milhar');
  assert.match(lerQuantidade('1,5', 'UN').erro, /não aceita frações/);
  assert.match(lerQuantidade('1.2,5', 'KG').erro, /ponto só separa milhares/, 'erro de digitação não vira 12,5');
  assert.match(lerQuantidade('12.34,5', 'KG').erro, /ponto só separa milhares/);
  assert.deepEqual(lerQuantidade('12.345,5', 'KG'), { valor: 12345.5 });
  assert.ok(lerQuantidade('1e3', 'UN').erro, 'notação científica não vale');
  assert.ok(lerQuantidade('-2', 'UN').erro);
  assert.equal(fmtEntrada(1234.5, 'KG'), '1234,500');
  assert.equal(fmtEntrada(1500, 'UN'), '1500');
});

test('mensagens de erro chegam em português, sem detalhe técnico', () => calado(() => {
  assert.equal(mensagemErro(new Error('duplicate key value violates unique constraint "x"')), 'Já existe um registro com esses dados.');
  assert.equal(mensagemErro(new Error('TypeError: Failed to fetch')), 'Sem conexão com o servidor. Verifique a internet e tente de novo.');
  assert.equal(mensagemErro(new Error('new row violates row-level security policy for table "produtos"')), 'Você não tem permissão para esta ação.');
  assert.equal(mensagemErro(new Error('Já existe um usuário com este e-mail.')), 'Já existe um usuário com este e-mail.');
  const antes = globalThis.errosDoApp.length;
  assert.match(mensagemErro(new TypeError("Cannot read properties of null (reading 'x')")), /erro inesperado/);
  assert.equal(globalThis.errosDoApp.length, antes + 1, 'o erro técnico fica no registro de erros');
  globalThis.errosDoApp.length = antes;
}));
