// ================================================================
//  AudiStock — js/telas/empresas.js
//  Cadastro de empresas: lista, busca, criar, editar, inativar.
// ================================================================

import { listarEmpresas, buscarEmpresa, criarEmpresa, atualizarEmpresa, alternarStatusEmpresa, contarProdutosPorEmpresa } from '../empresas.js';
import { escapeHtml, fmtInt, vazioHtml, erroCargaHtml, abrirModal, fmConfirm, showToast, normalizar, debounce,
         delegarAcoes, ICONS, mensagemErro } from '../ui.js';

const UFS = 'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ');

export async function render(el, { params }) {
  let lista = [], contagens = new Map(), busca = '', inativas = false;

  el.innerHTML = `
    <div class="toolbar">
      <label class="campo-busca">${ICONS.busca}<span class="sr-only">Buscar empresa</span>
        <input class="form-input" type="search" id="empBusca" placeholder="Nome, CNPJ ou cidade" autocomplete="off"/></label>
      <label class="checagem"><input type="checkbox" id="empInativas"/> Mostrar inativas</label>
      <span class="espaco"></span>
      <button type="button" class="btn btn-primary" data-acao="nova">${ICONS.mais}Nova empresa</button>
    </div>
    <div class="card" id="empCard"><div class="carregando-bloco"><span class="skel"></span><span class="skel" style="width:70%"></span></div></div>`;
  const $ = s => el.querySelector(s);
  const card = $('#empCard');

  const desenhar = () => {
    const t = normalizar(busca), dig = busca.replace(/\D/g, '');
    const base = lista.filter(e => inativas || e.ativo);
    const visiveis = base.filter(e => !t || normalizar(e.nome).includes(t) || normalizar(e.cidade).includes(t) || (dig && (e.cnpj ?? '').replace(/\D/g, '').includes(dig)));
    if (!lista.length) {
      card.innerHTML = vazioHtml({ titulo: 'Nenhuma empresa cadastrada', texto: 'Cadastre a primeira para criar produtos e iniciar auditorias.', acoes: '<button type="button" class="btn btn-primary" data-acao="nova">Cadastrar empresa</button>' });
      return;
    }
    if (!visiveis.length) {
      card.innerHTML = t
        ? vazioHtml({ titulo: `Nenhuma empresa para “${escapeHtml(busca)}”`, acoes: '<button type="button" class="btn btn-secondary btn-sm" data-acao="limpar">Limpar busca</button>', compacto: true })
        : vazioHtml({ titulo: 'Todas as empresas estão inativas', texto: 'Marque “Mostrar inativas” para vê-las.', compacto: true });
      return;
    }
    card.innerHTML = `<div class="tabela-wrap"><table class="tabela-resp">
      <thead><tr><th scope="col">Empresa</th><th scope="col">CNPJ</th><th scope="col">Cidade</th><th scope="col" class="num">Produtos ativos</th><th scope="col"><span class="sr-only">Ações</span></th></tr></thead>
      <tbody>${visiveis.map(e => `<tr class="${e.ativo ? '' : 'inativa'}">
        <td class="cel-titulo"><span class="forte">${escapeHtml(e.nome)}</span>${e.ativo ? '' : ' <span class="badge">Inativa</span>'}</td>
        <td data-label="CNPJ" class="codigo">${escapeHtml(e.cnpj || '—')}</td>
        <td data-label="Cidade">${e.cidade ? `${escapeHtml(e.cidade)}${e.estado ? ` / ${escapeHtml(e.estado)}` : ''}` : '—'}</td>
        <td data-label="Produtos ativos" class="num">${contagens.has(e.id) ? fmtInt(contagens.get(e.id)) : '…'}</td>
        <td class="cel-acoes"><div class="acoes-linha">
          <button type="button" class="btn btn-ghost btn-sm" data-acao="editar" data-id="${escapeHtml(e.id)}">Editar</button>
          <button type="button" class="btn btn-ghost btn-sm" data-acao="status" data-id="${escapeHtml(e.id)}">${e.ativo ? 'Inativar' : 'Reativar'}</button>
        </div></td>
      </tr>`).join('')}</tbody>
    </table></div>`;
  };

  const carregar = async () => {
    try {
      lista = await listarEmpresas({ apenasAtivas: false });
      desenhar();
      const n = await Promise.all(lista.map(e => contarProdutosPorEmpresa(e.id)));
      contagens = new Map(lista.map((e, i) => [e.id, n[i]]));
      desenhar();
    } catch (err) { console.error(err); card.innerHTML = erroCargaHtml("irPara('empresas')"); }
  };

  $('#empBusca').addEventListener('input', debounce(e => { busca = e.target.value; desenhar(); }, 200));
  $('#empInativas').addEventListener('change', e => { inativas = e.target.checked; desenhar(); });
  delegarAcoes(el, {
    nova: () => abrirEmpresa(null, carregar),
    editar: ({ id }) => abrirEmpresa(id, carregar),
    limpar: () => { busca = ''; $('#empBusca').value = ''; desenhar(); },
    status: async ({ id }) => {
      const e = lista.find(x => x.id === id); if (!e) return;
      const ok = await fmConfirm(e.ativo
        ? { titulo: `Inativar ${e.nome}?`, msg: 'Ela deixa de aparecer ao criar auditorias e cadastrar produtos. O histórico é mantido e você pode reativá-la depois.', confirmTxt: 'Inativar', tipo: 'perigo' }
        : { titulo: `Reativar ${e.nome}?`, msg: 'Ela volta a aparecer ao criar auditorias e cadastrar produtos.', confirmTxt: 'Reativar' });
      if (!ok) return;
      try { await alternarStatusEmpresa(id); showToast(`${e.nome} ${e.ativo ? 'inativada' : 'reativada'}.`, 'success'); await carregar(); }
      catch (err) { showToast(mensagemErro(err, 'status da empresa'), 'error'); }
    },
  });

  await carregar();
  if (params.get('nova') === '1') abrirEmpresa(null, carregar);
}

async function abrirEmpresa(id, aoSalvar) {
  let e = {};
  if (id) {
    try { e = await buscarEmpresa(id); }
    catch (err) { showToast(mensagemErro(err, 'abrir empresa'), 'error'); return; }
  }
  abrirModal({
    titulo: id ? 'Editar empresa' : 'Nova empresa',
    corpo: `
      <div class="form-group"><label class="form-label" for="empNome">Nome</label>
        <input class="form-input" id="empNome" maxlength="120" value="${escapeHtml(e.nome ?? '')}" required/></div>
      <div class="form-group"><label class="form-label" for="empCnpj">CNPJ <span class="opcional">(opcional)</span></label>
        <input class="form-input" id="empCnpj" inputmode="numeric" placeholder="00.000.000/0000-00" maxlength="18" value="${escapeHtml(e.cnpj ?? '')}"/></div>
      <div class="grade-2" style="grid-template-columns:1fr 96px">
        <div class="form-group"><label class="form-label" for="empCidade">Cidade</label>
          <input class="form-input" id="empCidade" maxlength="80" value="${escapeHtml(e.cidade ?? '')}"/></div>
        <div class="form-group"><label class="form-label" for="empEstado">UF</label>
          <select class="form-input" id="empEstado"><option value="">—</option>${UFS.map(u => `<option ${u === e.estado ? 'selected' : ''}>${u}</option>`).join('')}</select></div>
      </div>
      <div class="form-group"><label class="form-label" for="empEndereco">Endereço <span class="opcional">(opcional)</span></label>
        <input class="form-input" id="empEndereco" maxlength="200" value="${escapeHtml(e.endereco ?? '')}"/></div>
      <div class="form-group"><label class="form-label" for="empObs">Observações <span class="opcional">(opcional)</span></label>
        <textarea class="form-input" id="empObs" rows="2" maxlength="500">${escapeHtml(e.observacoes ?? '')}</textarea></div>`,
    acoes: [
      { texto: 'Cancelar', classe: 'btn-secondary', acao: m => m.fechar() },
      { texto: id ? 'Salvar alterações' : 'Cadastrar empresa', classe: 'btn-primary', tipo: 'submit' },
    ],
    aoEnviar: async m => {
      const nome = m.$('#empNome');
      if (!nome.value.trim()) { nome.setAttribute('aria-invalid', 'true'); nome.focus(); showToast('Informe o nome da empresa.', 'warning'); return; }
      const campos = { nome: nome.value, cnpj: m.$('#empCnpj').value, estado: m.$('#empEstado').value, cidade: m.$('#empCidade').value, endereco: m.$('#empEndereco').value, observacoes: m.$('#empObs').value };
      m.ocupado(true, 'Salvando…');
      try {
        if (id) await atualizarEmpresa(id, campos); else await criarEmpresa(campos);
        m.fechar();
        showToast(id ? 'Empresa atualizada.' : `${campos.nome.trim()} cadastrada.`, 'success');
        await aoSalvar();
      } catch (err) { m.ocupado(false); showToast(mensagemErro(err, 'salvar empresa'), 'error'); }
    },
  }).$('#empCnpj').addEventListener('input', ev => { ev.target.value = mascaraCnpj(ev.target.value); });
}

function mascaraCnpj(v) {
  const d = v.replace(/\D/g, '').slice(0, 14);
  return d.replace(/^(\d{2})(\d)/, '$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1/$2').replace(/(\d{4})(\d)/, '$1-$2');
}
