// Formatação de números, textos e mensagens de erro (js/ui.js).
import './ambiente.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { fmtQtd, fmtInt, plural, escapeHtml, normalizar, casasDaUnidade, mensagemErro, qtdHtml } = await import('../../js/ui.js');

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

test('mensagens de erro chegam em português, sem detalhe técnico', () => {
  assert.equal(mensagemErro(new Error('duplicate key value violates unique constraint "x"')), 'Já existe um registro com esses dados.');
  assert.equal(mensagemErro(new Error('TypeError: Failed to fetch')), 'Sem conexão com o servidor. Verifique a internet e tente de novo.');
  assert.equal(mensagemErro(new Error('new row violates row-level security policy for table "produtos"')), 'Você não tem permissão para esta ação.');
  assert.equal(mensagemErro(new Error('Já existe um usuário com este e-mail.')), 'Já existe um usuário com este e-mail.');
  const antes = globalThis.errosDoApp.length;
  assert.match(mensagemErro(new TypeError("Cannot read properties of null (reading 'x')")), /erro inesperado/);
  assert.equal(globalThis.errosDoApp.length, antes + 1, 'o erro técnico fica no registro de erros');
  globalThis.errosDoApp.length = antes;
});
