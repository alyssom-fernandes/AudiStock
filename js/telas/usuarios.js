// ================================================================
//  AudiStock — js/telas/usuarios.js
//  Usuários e perfis de acesso. O supremo gerencia todos; o
//  administrador, só auditores e visualizadores da sua empresa.
// ================================================================

import supabase from '../supabaseClient.js';
import { isSupremo } from '../auth.js';
import { criarUsuario } from '../usuarios.js';
import { listarEmpresas } from '../empresas.js';
import { escapeHtml, fmtDateTime, badgeRole, vazioHtml, erroCargaHtml, abrirModal, fmConfirm, showToast, normalizar,
         debounce, delegarAcoes, marcarInvalido, ICONS, NOMES_PAPEL, mensagemErro } from '../ui.js';

const PLURAL_PAPEL = { supremo: 'supremos', administrador: 'administradores', auditor: 'auditores', visualizador: 'visualizadores' };
const DESCRICAO_PAPEL = {
  supremo: 'Acesso total, inclusive excluir auditorias e gerenciar administradores.',
  administrador: 'Cadastra empresas, produtos e usuários; cria e cancela auditorias.',
  auditor: 'Registra as contagens e faz o fechamento das auditorias em andamento.',
  visualizador: 'Só consulta auditorias e relatórios.',
};

export async function render(el, { perfil }) {
  let lista = [], empresas = [], busca = '', papel = '', inativos = false;
  const papeis = isSupremo() ? ['supremo', 'administrador', 'auditor', 'visualizador'] : ['auditor', 'visualizador'];

  el.innerHTML = `
    <div class="toolbar" id="usrToolbar">
      <label class="campo-busca">${ICONS.busca}<span class="sr-only">Buscar usuário</span>
        <input class="form-input" type="search" id="usrBusca" placeholder="Nome, e-mail ou empresa" autocomplete="off"/></label>
      <label class="sr-only" for="usrPapel">Perfil</label>
      <select class="form-input" id="usrPapel" style="width:190px"><option value="">Todos os perfis</option>${papeis.map(r => `<option value="${r}">${NOMES_PAPEL[r]}</option>`).join('')}</select>
      <label class="checagem"><input type="checkbox" id="usrInativos"/> Mostrar inativos</label>
      <span class="espaco"></span>
      <button type="button" class="btn btn-primary" data-acao="novo">${ICONS.mais}Novo usuário</button>
    </div>
    <div class="card" id="usrCard"><div class="carregando-bloco"><span class="skel"></span><span class="skel" style="width:70%"></span></div></div>`;
  const $ = s => el.querySelector(s);
  const card = $('#usrCard');
  const nomeEmpresa = id => id ? empresas.find(e => e.id === id)?.nome ?? '—' : 'Todas as empresas';

  const desenhar = () => {
    const t = normalizar(busca);
    const outros = lista.filter(u => u.id !== perfil.id);
    $('#usrToolbar').hidden = !outros.length && !isSupremo();
    const visiveis = lista.filter(u => (inativos || u.ativo) && (!papel || u.role === papel)
      && (!t || normalizar(u.nome).includes(t) || normalizar(u.email).includes(t) || normalizar(nomeEmpresa(u.empresa_id)).includes(t)));

    if (!lista.length) {
      card.innerHTML = vazioHtml({ titulo: 'Nenhum auditor cadastrado', texto: 'Cadastre quem vai registrar as contagens nas auditorias.', acoes: '<button type="button" class="btn btn-primary" data-acao="novo">Cadastrar usuário</button>' });
      return;
    }
    if (!visiveis.length) {
      card.innerHTML = t || papel
        ? vazioHtml({ titulo: t ? `Nada encontrado para “${busca.trim()}”${papel ? ` entre ${PLURAL_PAPEL[papel]}` : ''}` : `Nenhum usuário com o perfil ${NOMES_PAPEL[papel]}`, acoes: '<button type="button" class="btn btn-secondary btn-sm" data-acao="limpar">Limpar filtros</button>', compacto: true })
        : vazioHtml({ titulo: 'Todos os usuários estão inativos', texto: 'Marque “Mostrar inativos” para vê-los.', compacto: true });
      return;
    }
    card.innerHTML = `<div class="tabela-wrap"><table class="tabela-lista tabela-fixa">
      <colgroup><col style="width:22%"><col><col style="width:130px"><col style="width:19%"><col style="width:150px"><col style="width:170px"></colgroup>
      <thead><tr><th scope="col">Nome</th><th scope="col">E-mail</th><th scope="col">Perfil</th><th scope="col">Empresa</th><th scope="col">Último acesso</th><th scope="col"><span class="sr-only">Ações</span></th></tr></thead>
      <tbody>${visiveis.map(u => {
        const eu = u.id === perfil.id;
        const pode = !eu && (isSupremo() || ['auditor', 'visualizador'].includes(u.role));
        return `<tr class="${u.ativo ? '' : 'inativa'}">
          <td class="l-titulo"><span class="forte">${escapeHtml(u.nome)}</span>${eu ? ' <span class="badge badge-neutro">Você</span>' : ''}${u.ativo ? '' : ' <span class="badge badge-neutro">Inativo</span>'}
            <span class="sub so-celular-bloco">${escapeHtml(u.email)} · ${escapeHtml(nomeEmpresa(u.empresa_id))}</span></td>
          <td class="so-desktop">${escapeHtml(u.email)}</td>
          <td>${badgeRole(u.role)}</td>
          <td class="so-desktop">${u.empresa_id ? escapeHtml(nomeEmpresa(u.empresa_id)) : '<span class="muted">Todas</span>'}</td>
          <td class="nowrap so-desktop">${fmtDateTime(u.ultimo_acesso)}</td>
          <td class="l-linha"><div class="acoes-linha">${pode
            ? `<button type="button" class="btn btn-ghost btn-sm" data-acao="editar" data-id="${escapeHtml(u.id)}" aria-label="Editar ${escapeHtml(u.nome)}">Editar</button>
               <button type="button" class="btn btn-ghost btn-sm" data-acao="status" data-id="${escapeHtml(u.id)}">${u.ativo ? 'Inativar' : 'Reativar'}</button>`
            : eu ? '<a class="btn btn-ghost btn-sm" href="app.html?tela=config">Meu perfil</a>' : ''}</div></td>
        </tr>`;
      }).join('')}</tbody>
    </table></div>
    ${!outros.length ? `<div class="tabela-rodape"><span>Você é o único usuário. Cadastre auditores para que a equipe registre as contagens.</span></div>` : ''}`;
  };

  const carregar = async () => {
    try {
      let q = supabase.from('usuarios').select('id, nome, email, role, empresa_id, ativo, ultimo_acesso').order('nome');
      if (!isSupremo()) {
        q = q.in('role', ['auditor', 'visualizador']);
        if (perfil.empresa_id) q = q.eq('empresa_id', perfil.empresa_id);
      }
      const [{ data, error }, emps] = await Promise.all([q, listarEmpresas({ apenasAtivas: false })]);
      if (error) throw new Error(error.message);
      lista = data; empresas = emps;
      desenhar();
    } catch (err) { console.error(err); card.innerHTML = erroCargaHtml("irPara('usuarios')"); }
  };

  $('#usrBusca').addEventListener('input', debounce(e => { busca = e.target.value; desenhar(); }, 200));
  $('#usrPapel').addEventListener('change', e => { papel = e.target.value; desenhar(); });
  $('#usrInativos').addEventListener('change', e => { inativos = e.target.checked; desenhar(); });
  const contexto = () => ({ papeis, empresas, perfil, aoSalvar: carregar });
  delegarAcoes(el, {
    limpar: () => { busca = ''; papel = ''; $('#usrBusca').value = ''; $('#usrPapel').value = ''; desenhar(); },
    novo: () => abrirUsuario(null, contexto()),
    editar: ({ id }) => abrirUsuario(lista.find(u => u.id === id), contexto()),
    status: async ({ id }) => {
      const u = lista.find(x => x.id === id); if (!u) return;
      const ok = await fmConfirm(u.ativo
        ? { titulo: `Inativar ${u.nome}?`, msg: 'A pessoa não consegue mais entrar no sistema. As contagens dela ficam no histórico, e dá para reativar depois.', confirmTxt: 'Inativar', tipo: 'perigo' }
        : { titulo: `Reativar ${u.nome}?`, msg: 'A pessoa volta a entrar no sistema com o mesmo perfil.', confirmTxt: 'Reativar' });
      if (!ok) return;
      try {
        const { error } = await supabase.from('usuarios').update({ ativo: !u.ativo }).eq('id', id);
        if (error) throw new Error(error.message);
        showToast(`Acesso de ${u.nome} ${u.ativo ? 'desativado' : 'reativado'}.`, 'success');
        await carregar();
      } catch (err) { showToast(mensagemErro(err, 'status do usuário'), 'error'); }
    },
  });
  await carregar();
}

function abrirUsuario(u, { papeis, empresas, perfil, aoSalvar }) {
  const editando = !!u;
  // O administrador de uma empresa só cadastra gente da própria empresa
  const fixa = !isSupremo() && perfil.empresa_id ? empresas.find(e => e.id === perfil.empresa_id) : null;
  const empresasOpc = fixa ? [fixa] : empresas.filter(e => e.ativo || e.id === u?.empresa_id);
  const m = abrirModal({
    titulo: editando ? 'Editar usuário' : 'Novo usuário',
    corpo: `
      <div class="form-group"><label class="form-label" for="usrNome">Nome</label>
        <input class="form-input" id="usrNome" maxlength="120" autocomplete="off" value="${escapeHtml(u?.nome ?? '')}" required/></div>
      <div class="form-group"><label class="form-label" for="usrEmail">E-mail</label>
        <input class="form-input" id="usrEmail" type="email" autocomplete="off" value="${escapeHtml(u?.email ?? '')}" ${editando ? 'readonly aria-describedby="usrEmailDica"' : 'required'}/>
        ${editando ? '<span class="form-hint" id="usrEmailDica">O e-mail é o login e não pode ser alterado.</span>' : ''}</div>
      ${editando ? '' : `<div class="form-group"><label class="form-label" for="usrSenha">Senha inicial</label>
        <input class="form-input" id="usrSenha" type="password" autocomplete="new-password" minlength="6" aria-describedby="usrSenhaDica" required/>
        <span class="form-hint" id="usrSenhaDica">Pelo menos 6 caracteres. Combine a senha com a pessoa; depois ela pode trocá-la em Configurações.</span></div>`}
      <div class="grade-2">
        <div class="form-group"><label class="form-label" for="usrRole">Perfil</label>
          <select class="form-input" id="usrRole">${papeis.map(r => `<option value="${r}" ${r === (u?.role ?? 'auditor') ? 'selected' : ''}>${NOMES_PAPEL[r]}</option>`).join('')}</select></div>
        <div class="form-group"><label class="form-label" for="usrEmpresa">Empresa</label>
          <select class="form-input" id="usrEmpresa" ${fixa ? 'disabled' : ''}>${fixa ? '' : '<option value="">Todas as empresas</option>'}${empresasOpc.map(e => `<option value="${escapeHtml(e.id)}" ${e.id === (u?.empresa_id ?? fixa?.id) ? 'selected' : ''}>${escapeHtml(e.nome)}</option>`).join('')}</select></div>
      </div>
      <p class="form-hint" id="usrPapelDica" aria-live="polite"></p>`,
    acoes: [
      { texto: 'Cancelar', classe: 'btn-secondary', acao: mm => mm.fechar() },
      { texto: editando ? 'Salvar alterações' : 'Cadastrar usuário', classe: 'btn-primary', tipo: 'submit' },
    ],
    aoEnviar: async mm => {
      const nome = mm.$('#usrNome'), email = mm.$('#usrEmail'), senha = mm.$('#usrSenha');
      const role = mm.$('#usrRole').value, empresa_id = (fixa?.id ?? mm.$('#usrEmpresa').value) || null;
      const invalido = (c, msg) => { marcarInvalido(c, msg); c.focus(); };
      if (!nome.value.trim()) return invalido(nome, 'Informe o nome.');
      if (!editando && !/^\S+@\S+\.\S+$/.test(email.value.trim())) return invalido(email, 'Informe um e-mail válido.');
      if (!editando && senha.value.length < 6) return invalido(senha, 'A senha precisa ter pelo menos 6 caracteres.');
      mm.ocupado(true, 'Salvando…');
      try {
        if (editando) {
          const { error } = await supabase.from('usuarios').update({ nome: nome.value.trim(), role, empresa_id }).eq('id', u.id);
          if (error) throw new Error(error.message);
        } else {
          await criarUsuario({ nome: nome.value, email: email.value, senha: senha.value, role, empresa_id });
        }
        mm.fechar();
        showToast(editando ? `Dados de ${nome.value.trim()} atualizados.` : `Cadastro de ${nome.value.trim()} criado (${NOMES_PAPEL[role].toLowerCase()}).`, 'success');
        await aoSalvar();
      } catch (err) {
        mm.ocupado(false);
        const msg = mensagemErro(err, 'salvar usuário');
        if (!editando && /e-mail/i.test(msg)) invalido(email, msg); else showToast(msg, 'error');
      }
    },
  });
  const dica = () => { m.$('#usrPapelDica').textContent = DESCRICAO_PAPEL[m.$('#usrRole').value] ?? ''; };
  m.$('#usrRole').addEventListener('change', dica);
  dica();
}
