// ================================================================
//  AudiStock — js/telas/config.js
//  Meu perfil, demonstração (reiniciar os dados) e o registro de
//  erros deste navegador (js/erros.js).
// ================================================================

import supabase from '../supabaseClient.js';
import { listarEmpresas } from '../empresas.js';
import { demoAtivo } from '../demo.js';
import { escapeHtml, fmtDateTime, badgeRole, fmConfirm, showToast, renderUserCard, mensagemErro } from '../ui.js';

export async function render(el, { perfil }) {
  let nomeEmpresa = 'Todas';
  if (perfil.empresa_id) {
    try { nomeEmpresa = (await listarEmpresas()).find(e => e.id === perfil.empresa_id)?.nome ?? '—'; } catch (_) { nomeEmpresa = '—'; }
  }

  el.innerHTML = `
    <div class="config-grade">
      <div>
        <section class="card" aria-labelledby="tPerfil">
          <div class="card-header"><h2 class="card-title" id="tPerfil">Meu perfil</h2></div>
          <form class="card-body" id="formPerfil" novalidate>
            <div class="form-group"><label class="form-label" for="cfgNome">Nome</label>
              <input class="form-input" id="cfgNome" maxlength="120" value="${escapeHtml(perfil?.nome ?? '')}"/></div>
            <div class="form-group"><label class="form-label" for="cfgEmail">E-mail</label>
              <input class="form-input" id="cfgEmail" value="${escapeHtml(perfil?.email ?? '')}" readonly aria-describedby="cfgEmailDica"/>
              <span class="form-hint" id="cfgEmailDica">O e-mail é o seu login e não pode ser alterado aqui.</span></div>
            <dl class="dados" style="margin:4px 0 20px">
              <dt>Perfil</dt><dd>${badgeRole(perfil?.role)}</dd>
              <dt>Empresa</dt><dd>${escapeHtml(nomeEmpresa)}</dd>
            </dl>
            <button type="submit" class="btn btn-primary" id="cfgSalvar">Salvar nome</button>
          </form>
        </section>
        ${demoAtivo() ? `<section class="card" aria-labelledby="tDemo" style="margin-top:20px">
          <div class="card-header"><h2 class="card-title" id="tDemo">Demonstração</h2></div>
          <div class="card-body">
            <p class="muted" style="margin-bottom:14px">Os dados são fictícios e ficam só nesta aba. Para começar de novo com as empresas, produtos e auditorias originais:</p>
            <a class="btn btn-secondary" href="app.html?demo=1">Restaurar dados da demonstração</a>
          </div>
        </section>` : ''}
      </div>
      <section class="card" aria-labelledby="tErros">
        <div class="card-header"><div><h2 class="card-title" id="tErros">Registro de erros</h2><div class="card-sub">Falhas inesperadas ocorridas neste navegador. Útil para o suporte.</div></div>
          <button type="button" class="btn btn-ghost btn-sm" id="cfgLimpar">Limpar</button></div>
        <div class="card-body" id="cfgErros"></div>
      </section>
    </div>`;
  const $ = s => el.querySelector(s);

  $('#formPerfil').addEventListener('submit', async e => {
    e.preventDefault();
    const campo = $('#cfgNome'), nome = campo.value.trim();
    if (!nome) { campo.setAttribute('aria-invalid', 'true'); campo.focus(); showToast('Informe o seu nome.', 'warning'); return; }
    campo.removeAttribute('aria-invalid');
    const btn = $('#cfgSalvar'); btn.disabled = true;
    try {
      const { error } = await supabase.from('usuarios').update({ nome }).eq('id', perfil.id);
      if (error) throw new Error(error.message);
      perfil.nome = nome;
      renderUserCard(perfil);
      showToast('Nome atualizado.', 'success');
    } catch (err) { showToast(mensagemErro(err, 'salvar nome'), 'error'); }
    finally { btn.disabled = false; }
  });

  const desenharErros = () => {
    if (!el.isConnected) { document.removeEventListener('audistock:erros', desenharErros); return; }
    const alvo = $('#cfgErros'); if (!alvo) return;
    const erros = window.errosRegistrados?.() ?? [];
    $('#cfgLimpar').hidden = !erros.length;
    alvo.innerHTML = !erros.length
      ? `<p class="muted">Nenhum erro registrado. Se algo falhar, os detalhes aparecem aqui.</p>`
      : erros.map(x => `<div class="registro-erro">
          <div class="registro-erro-cab"><span>${fmtDateTime(x.ts)}</span><span>${escapeHtml(x.pagina)}${x.demo ? ' · demonstração' : ''}</span></div>
          <div class="registro-erro-msg">${escapeHtml(x.msg)}</div>
          ${x.detalhe ? `<details><summary>Detalhes técnicos</summary><pre>${escapeHtml(x.detalhe)}</pre></details>` : ''}
        </div>`).join('');
  };
  desenharErros();
  document.addEventListener('audistock:erros', desenharErros);

  $('#cfgLimpar').addEventListener('click', async () => {
    if (await fmConfirm({ titulo: 'Limpar o registro de erros?', msg: 'Os detalhes das falhas deste navegador serão apagados.', confirmTxt: 'Limpar' })) {
      window.errosLimpar?.();
      showToast('Registro de erros limpo.', 'success');
    }
  });
}
