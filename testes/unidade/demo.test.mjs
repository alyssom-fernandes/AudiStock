// A demonstração imita o banco (supabase/schema.sql) onde o app depende
// disso: sem essa fidelidade, um teste feito nela passa com o código errado.
import './ambiente.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { default: supabase } = await import('../../js/supabaseClient.js');
const banco = () => JSON.parse(sessionStorage.getItem('audistock-demo-db')).tabelas;
const empresa = nome => banco().empresas.find(e => e.nome === nome);

test('código de barras só não se repete entre produtos ativos (índice parcial)', async () => {
  const emp = empresa('Ferragens Horizonte');
  const velho = banco().produtos.find(p => p.empresa_id === emp.id && p.ativo && p.codigo_barras);
  await supabase.from('produtos').update({ ativo: false }).eq('id', velho.id);
  // O substituto ativo pode usar o mesmo código de barras
  const { error } = await supabase.from('produtos').insert([{ empresa_id: emp.id, codigo_produto: 'SUBST-1', nome_produto: 'Substituto', codigo_barras: velho.codigo_barras, ativo: true }]);
  assert.equal(error, null);
  // Reativar o antigo, com o código de barras agora em uso, é recusado
  const { error: e2 } = await supabase.from('produtos').update({ ativo: true }).eq('id', velho.id);
  assert.match(e2.message, /produtos_barras_unico_idx/);
});

test('upsert em lote: coluna ausente numa linha vai como vazio, como no PostgREST', async () => {
  const emp = empresa('Ferragens Horizonte');
  const p = banco().produtos.find(x => x.empresa_id === emp.id && x.ativo && x.unidade_medida && x.codigo_barras);
  await supabase.from('produtos').upsert([
    { empresa_id: emp.id, codigo_produto: p.codigo_produto, nome_produto: 'Com só código e nome' },
    { empresa_id: emp.id, codigo_produto: 'LOTE-1', nome_produto: 'Outro', unidade_medida: 'UN' },
  ], { onConflict: 'empresa_id,codigo_produto' });
  assert.equal(banco().produtos.find(x => x.id === p.id).unidade_medida, null, 'é por isso que a importação agrupa as linhas pelos campos que têm');
});

test('auditoria nova: número que nunca volta, horários do banco e uma em andamento por empresa', async () => {
  const emp = empresa('Distribuidora Aurora — Filial Norte');
  const { data: a1 } = await supabase.from('auditorias').insert([{ empresa_id: emp.id, status: 'em_andamento', data_inicio: '1999-01-01T00:00:00Z', cancelado_em: '1999-01-02T00:00:00Z' }]).select().single();
  assert.notEqual(a1.data_inicio, '1999-01-01T00:00:00Z');
  assert.equal(a1.cancelado_em, null);
  const outra = await supabase.from('auditorias').insert([{ empresa_id: emp.id, status: 'em_andamento' }]).select().single();
  assert.match(outra.error.message, /auditorias_uma_em_andamento_idx/);
  // O supremo exclui a auditoria; a próxima não reaproveita o número
  await supabase.from('auditorias').delete().eq('id', a1.id);
  const { data: a2 } = await supabase.from('auditorias').insert([{ empresa_id: emp.id, status: 'em_andamento' }]).select().single();
  assert.notEqual(a2.numero_auditoria, a1.numero_auditoria);
  // A inserção recusada (segunda em andamento) não gastou número, como no banco
  assert.equal(Number(a2.numero_auditoria.slice(-4)), Number(a1.numero_auditoria.slice(-4)) + 1);
});

test('correção de contagem diz por que foi recusada', async () => {
  const r = await supabase.rpc('corrigir_contagem', { p_item_id: crypto.randomUUID(), p_quantidade: 1 });
  assert.match(r.error.message, /Item não encontrado/);
});

test('relatório de auditoria encerrada guarda o nome do encerramento', async () => {
  const fin = banco().auditorias.find(a => a.status === 'finalizada');
  const item = banco().auditoria_itens.find(i => i.auditoria_id === fin.id);
  const antes = (await supabase.from('vw_relatorio_divergencias').select('*').eq('item_id', item.id).single()).data.nome_produto;
  await supabase.from('produtos').update({ nome_produto: 'Renomeado depois' }).eq('id', item.produto_id);
  const depois = (await supabase.from('vw_relatorio_divergencias').select('*').eq('item_id', item.id).single()).data.nome_produto;
  assert.equal(depois, antes);
});

test('nenhum erro registrado pelo app', () => assert.deepEqual(globalThis.errosDoApp, []));
