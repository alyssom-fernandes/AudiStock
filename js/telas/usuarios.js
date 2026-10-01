// ================================================================
//  AudiStock — js/telas/usuarios.js
//  Usuários e perfis de acesso. O supremo gerencia todos; o
//  administrador, só auditores e visualizadores da sua empresa.
// ================================================================

import supabase from '../supabaseClient.js';
import { isSupremo } from '../auth.js';
import { listarEmpresas } from '../empresas.js';
import { escapeHtml, fmtDateTime, badgeRole, vazioHtml, erroCargaHtml, abrirModal, fmConfirm, showToast, normalizar,
         debounce, delegarAcoes, ICONS, NOMES_PAPEL, mensagemErro } from '../ui.js';

const DESCRICAO_PAPEL = {
  supremo: 'Acesso total, inclusive excluir auditorias e gerenciar administradores.',
  administrador: 'Cadastra empresas, produtos e usuários; cria e cancela auditorias.',
  auditor: 'Registra contagens nas auditorias em andamento.',
  visualizador: 'Só consulta auditorias e relatórios.',
};

export async function render(el, { perfil }) {
  let lista = [], empresas = [], busca = '', papel = '', inativos = false;
  const papeis = isSupremo() ? ['supremo', 'administrador', 'auditor', 'visualizador'] : ['auditor', 'visualizador'];

  el.innerHTML = `
    <div class="toolbar">
      <label class="campo-busca">${ICONS.busca}<span class="sr-only">Buscar usuário</span>
        <input class="form-input" type="search" id="usrBusca" placeholder="Nome ou e-mail" autocomplete="off"/></label>
      <label class="sr-only" for="usrPapel">Perfil</label>
      <select class="form-input" id="usrPapel" style="width:190px"><option value="">Todos os perfis</option>${papeis.map(r => `<option value="${r}">${NOMES_PAPEL[r]}</option>`).join('')}</select>
      <label class="checagem"><input type="checkbox" id="usrInativos"/> Mostrar inativos</label>
      <span class="espaco"></span>
      <button type="button" class="btn btn-primary" data-acao="novo">${ICONS.mais}Novo usuário</button>
    </div>
    <div class="card" id="usrCard"><div class="carregando-bloco"><span class="skel"></span><span class="skel" style="width:70%"></span></div></div>`;
  const $ = s => el.querySelector(s);
  const card = $('#usrCard');
  const nomeEmpresa = id => empresas.find(e => e.id === id)?.nome;

  const desenhar = () => {
    const t = normalizar(busca);
    const visiveis = lista.filter(u => (inativos || u.ativo) && (!papel || u.role === papel)
      && (!t || normalizar(u.nome).includes(t) || normalizar(u.email).includes(t)));
    if (!visiveis.length) {
      card.innerHTML = vazioHtml({ titulo: t || papel ? 'Nenhum usuário com esses filtros' : 'Nenhum usuário ativo', acoes: '<button type="button" class="btn btn-secondary btn-sm" data-acao="limpar">Limpar filtros</button>', compacto: true });
      return;
    }
    const sozinho = lista.length === 1 && lista[0].id === perfil.id;
    card.innerHTML = `<div class="tabela-wrap"><table class="tabela-resp">
      <thead><tr><th scope="col">Nome</th><th scope="col">E-mail</th><th scope="col">Perfil</th><th scope="col">Empresa</th><th scope="col">Último acesso</th><th scope="col"><span class="sr-only">Ações</span></th></tr></thead>
      <tbody>${visiveis.map(u => {
        const eu = u.id === perfil.id;
        const pode = !eu && (isSupremo() || ['auditor', 'visualizador'].includes(u.role));
        return `<tr class="${u.ativo ? '' : 'inativa'}">
          <td class="cel-titulo"><span class="forte">${escapeHtml(u.nome)}</span>${eu ? ' <span class="badge">Você</span>' : ''}${u.ativo ? '' : ' <span class="badge">Inativo</span>'}</td>
          <td data-label="E-mail">${escapeHtml(u.email)}</td>
          <td data-label="Perfil">${badgeRole(u.role)}</td>
          <td data-label="Empresa">${u.empresa_id ? escapeHtml(nomeEmpresa(u.empresa_id) ?? '—') : '<span class="muted">Todas</span>'}</td>
          <td data-label="Último acesso" class="nowrap">${fmtDateTime(u.ultimo_acesso)}</td>
          <td class="cel-acoes"><div class="acoes-linha">${pode
            ? `<button type="button" class="btn btn-ghost btn-sm" data-acao="editar" data-id="${escapeHtml(u.id)}">Editar</button>
               <button type="button" class="btn btn-ghost btn-sm" data-acao="status" data-id="${escapeHtml(u.id)}">${u.ativo ? 'Inativar' : 'Reativar'}</button>`
            : eu ? '<a class="btn btn-ghost btn-sm" href="app.html?tela=config">Meu perfil</a>' : ''}</div></td>
        </tr>`;
      }).join('')}</tbody>
    </table></div>
    ${sozinho ? `<div class="tabela-rodape"><span>Você é o único usuário. Cadastre auditores para que a equipe registre as contagens.</span></div>` : ''}`;
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
  delegarAcoes(el, {
    limpar: () => { busca = ''; papel = ''; $('#usrBusca').value = ''; $('#usrPapel').value = ''; desenhar(); },
    novo: () => abrirUsuario(null, { papeis, empresas, perfil, aoSalvar: carregar }),
    editar: ({ id }) => abrirUsuario(lista.find(u => u.id === id), { papeis, empresas, perfil, aoSalvar: carregar }),
    status: async ({ id }) => {
      const u = lista.find(x => x.id === id); if (!u) return;
      const ok = await fmConfirm(u.ativo
        ? { titulo: `Inativar ${u.nome}?`, msg: 'A pessoa não consegue mais entrar no sistema. As contagens dela ficam no histórico, e você pode reativá-la depois.', confirmTxt: 'Inativar', tipo: 'perigo' }
        : { titulo: `Reativar ${u.nome}?`, msg: 'A pessoa volta a entrar no sistema com o mesmo perfil.', confirmTxt: 'Reativar' });
      if (!ok) return;
      try {
        const { error } = await supabase.from('usuarios').update({ ativo: !u.ativo }).eq('id', id);
        if (error) throw new Error(error.message);
        showToast(`${u.nome} ${u.ativo ? 'inativado' : 'reativado'}.`, 'success');
        await carregar();
      } catch (err) { showToast(mensagemErro(err, 'status do usuário'), 'error'); }
    },
  });
  await carregar();
}

function abrirUsuario(u, { papeis, empresas, aoSalvar }) {
  const editando = !!u;
  const empresasOpc = empresas.filter(e => e.ativo || e.id === u?.empresa_id);
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
        <span class="form-hint" id="usrSenhaDica">Pelo menos 6 caracteres. A pessoa pode trocá-la depois.</span></div>`}
      <div class="grade-2">
        <div class="form-group"><label class="form-label" for="usrRole">Perfil</label>
          <select class="form-input" id="usrRole">${papeis.map(r => `<option value="${r}" ${r === (u?.role ?? 'auditor') ? 'selected' : ''}>${NOMES_PAPEL[r]}</option>`).join('')}</select></div>
        <div class="form-group"><label class="form-label" for="usrEmpresa">Empresa</label>
          <select class="form-input" id="usrEmpresa"><option value="">Todas</option>${empresasOpc.map(e => `<option value="${escapeHtml(e.id)}" ${e.id === u?.empresa_id ? 'selected' : ''}>${escapeHtml(e.nome)}</option>`).join('')}</select></div>
      </div>
      <p class="form-hint" id="usrPapelDica" aria-live="polite"></p>`,
    acoes: [
      { texto: 'Cancelar', classe: 'btn-secondary', acao: mm => mm.fechar() },
      { texto: editando ? 'Salvar alterações' : 'Cadastrar usuário', classe: 'btn-primary', tipo: 'submit' },
    ],
    aoEnviar: async mm => {
      const nome = mm.$('#usrNome'), email = mm.$('#usrEmail'), senha = mm.$('#usrSenha');
      const role = mm.$('#usrRole').value, empresa_id = mm.$('#usrEmpresa').value || null;
      [nome, email, senha].forEach(c => c?.removeAttribute('aria-invalid'));
      const invalido = (c, msg) => { c.setAttribute('aria-invalid', 'true'); c.focus(); showToast(msg, 'warning'); };
      if (!nome.value.trim()) return invalido(nome, 'Informe o nome.');
      if (!editando && !/^\S+@\S+\.\S+$/.test(email.value.trim())) return invalido(email, 'Informe um e-mail válido.');
      if (!editando && senha.value.length < 6) return invalido(senha, 'A senha precisa ter pelo menos 6 caracteres.');
      mm.ocupado(true, 'Salvando…');
      try {
        if (editando) {
          const { error } = await supabase.from('usuarios').update({ nome: nome.value.trim(), role, empresa_id }).eq('id', u.id);
          if (error) throw new Error(error.message);
        } else {
          const emailNorm = email.value.trim().toLowerCase();
          const { data: auth, error: eAuth } = await supabase.auth.signUp({ email: emailNorm, password: senha.value });
          if (eAuth) throw new Error(/registered/i.test(eAuth.message) ? 'Já existe um usuário com este e-mail.' : eAuth.message);
          const { error } = await supabase.from('usuarios').insert([{ id: auth.user.id, nome: nome.value.trim(), email: emailNorm, role, empresa_id, senha_hash: 'auth-supabase', ativo: true }]);
          if (error) throw new Error(error.message);
        }
        mm.fechar();
        showToast(editando ? `${nome.value.trim()} atualizado.` : `${nome.value.trim()} cadastrado como ${NOMES_PAPEL[role].toLowerCase()}.`, 'success');
        await aoSalvar();
      } catch (err) { mm.ocupado(false); showToast(mensagemErro(err, 'salvar usuário'), 'error'); }
    },
  });
  const dica = () => { m.$('#usrPapelDica').textContent = DESCRICAO_PAPEL[m.$('#usrRole').value] ?? ''; };
  m.$('#usrRole').addEventListener('change', dica);
  dica();
}
