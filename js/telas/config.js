// ================================================================
//  AudiStock — js/telas/config.js
//  Meu perfil (nome e senha), demonstração (restaurar os dados) e o
//  registro de erros deste navegador (js/erros.js).
// ================================================================

import supabase from '../supabaseClient.js';
import { listarEmpresas } from '../empresas.js';
import { demoAtivo } from '../demo.js';
import { escapeHtml, fmtDateTime, badgeRole, fmConfirm, showToast, renderUserCard, mensagemErro, marcarInvalido, limparInvalido } from '../ui.js';

const TIPO_ERRO = { erro: 'Erro', promessa: 'Erro assíncrono', recurso: 'Arquivo não carregado', tratado: 'Tratado na tela', tela: 'Tela não abriu', demo: 'Demonstração' };

export async function render(el, { perfil }) {
  let nomeEmpresa = 'Todas';
  if (perfil.empresa_id) {
    try { nomeEmpresa = (await listarEmpresas()).find(e => e.id === perfil.empresa_id)?.nome ?? '—'; } catch (_) { nomeEmpresa = '—'; }
  }

  el.innerHTML = `
    <div class="config-grade">
      <div class="config-coluna">
        <section class="card" aria-labelledby="tPerfil">
          <div class="card-header"><div><h2 class="card-title" id="tPerfil">Meu perfil</h2><div class="card-sub">Como você aparece para a equipe.</div></div></div>
          <form class="card-body" id="formPerfil" novalidate>
            <div class="form-group"><label class="form-label" for="cfgNome">Nome</label>
              <input class="form-input" id="cfgNome" maxlength="120" autocomplete="name" value="${escapeHtml(perfil?.nome ?? '')}"/></div>
            <div class="form-group"><label class="form-label" for="cfgEmail">E-mail</label>
              <input class="form-input" id="cfgEmail" value="${escapeHtml(perfil?.email ?? '')}" readonly aria-describedby="cfgEmailDica"/>
              <span class="form-hint" id="cfgEmailDica">O e-mail é o seu login e não pode ser alterado aqui.</span></div>
            <dl class="dados dados-perfil">
              <dt>Perfil</dt><dd>${badgeRole(perfil?.role)}</dd>
              <dt>Empresa</dt><dd>${escapeHtml(nomeEmpresa)}</dd>
            </dl>
            <button type="submit" class="btn btn-primary" id="cfgSalvar">Salvar nome</button>
          </form>
        </section>
        ${demoAtivo() ? `<section class="card" aria-labelledby="tDemo">
          <div class="card-header"><h2 class="card-title" id="tDemo">Demonstração</h2></div>
          <div class="card-body">
            <p class="muted card-texto">Os dados são fictícios e ficam só nesta aba. Para começar de novo com as empresas, produtos e auditorias originais:</p>
            <button type="button" class="btn btn-secondary" id="cfgRestaurar">Restaurar dados da demonstração</button>
          </div>
        </section>` : ''}
      </div>
      <div class="config-coluna">
        <section class="card" aria-labelledby="tSenha">
          <div class="card-header"><h2 class="card-title" id="tSenha">Alterar senha</h2></div>
          <form class="card-body" id="formSenha" novalidate>
            <div class="form-group"><label class="form-label" for="cfgSenha">Nova senha</label>
              <input class="form-input" id="cfgSenha" type="password" autocomplete="new-password" aria-describedby="cfgSenhaDica"/>
              <span class="form-hint" id="cfgSenhaDica">Pelo menos 6 caracteres.</span></div>
            <div class="form-group"><label class="form-label" for="cfgSenha2">Repita a nova senha</label>
              <input class="form-input" id="cfgSenha2" type="password" autocomplete="new-password"/></div>
            <button type="submit" class="btn btn-secondary" id="cfgSalvarSenha">Alterar senha</button>
          </form>
        </section>
        <section class="card" aria-labelledby="tErros">
          <div class="card-header"><div><h2 class="card-title" id="tErros">Registro de erros</h2><div class="card-sub">Falhas inesperadas ocorridas neste navegador. Útil para o suporte.</div></div>
            <button type="button" class="btn btn-ghost btn-sm" id="cfgLimpar">Limpar</button></div>
          <div class="card-body" id="cfgErros"></div>
        </section>
      </div>
    </div>`;
  const $ = s => el.querySelector(s);

  $('#formPerfil').addEventListener('submit', async e => {
    e.preventDefault();
    const campo = $('#cfgNome'), nome = campo.value.trim();
    if (!nome) { marcarInvalido(campo, 'Informe o seu nome.'); campo.focus(); return; }
    limparInvalido(campo);
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

  $('#formSenha').addEventListener('submit', async e => {
    e.preventDefault();
    const s1 = $('#cfgSenha'), s2 = $('#cfgSenha2');
    limparInvalido(s1); limparInvalido(s2);
    if (s1.value.length < 6) { marcarInvalido(s1, 'A senha precisa ter pelo menos 6 caracteres.'); s1.focus(); return; }
    if (s2.value !== s1.value) { marcarInvalido(s2, 'As duas senhas não são iguais.'); s2.focus(); return; }
    const btn = $('#cfgSalvarSenha'); btn.disabled = true;
    try {
      const { error } = await supabase.auth.updateUser({ password: s1.value });
      if (error) throw new Error(/should be different|same/i.test(error.message) ? 'A nova senha precisa ser diferente da atual.' : error.message);
      s1.value = ''; s2.value = '';
      showToast(demoAtivo() ? 'Senha alterada (na demonstração, qualquer senha continua entrando).' : 'Senha alterada. Use a nova no próximo acesso.', 'success', 5000);
    } catch (err) { showToast(mensagemErro(err, 'alterar senha'), 'error'); }
    finally { btn.disabled = false; }
  });

  $('#cfgRestaurar')?.addEventListener('click', async () => {
    const ok = await fmConfirm({ titulo: 'Restaurar a demonstração?', msg: 'Tudo o que você cadastrou ou contou nesta aba será apagado, e os dados originais voltarão.', confirmTxt: 'Restaurar', tipo: 'perigo' });
    if (ok) location.href = 'app.html?demo=1';
  });

  // "Uncaught TypeError: x" → "x", com o tipo num selo discreto
  const limparMsg = m => String(m ?? '').replace(/^Uncaught\s+(\(in promise\)\s+)?/, '').replace(/^(Type|Reference|Syntax|Range)?Error:\s*/, '');
  const desenharErros = () => {
    if (!el.isConnected) { document.removeEventListener('audistock:erros', desenharErros); return; }
    const alvo = $('#cfgErros'); if (!alvo) return;
    const erros = window.errosRegistrados?.() ?? [];
    $('#cfgLimpar').hidden = !erros.length;
    alvo.innerHTML = !erros.length
      ? `<p class="muted">Nenhum erro registrado. Se algo falhar, os detalhes aparecem aqui.</p>`
      : erros.map(x => `<div class="registro-erro">
          <div class="registro-erro-cab"><span class="nowrap">${fmtDateTime(x.ts)}</span><span>${escapeHtml(x.pagina)}</span>${x.usuario && x.usuario !== '—' ? `<span>${escapeHtml(x.usuario)}</span>` : ''}${x.demo ? '<span>demonstração</span>' : ''}</div>
          <div class="registro-erro-msg"><span class="badge badge-neutro">${TIPO_ERRO[x.tipo] ?? 'Erro'}</span> ${escapeHtml(limparMsg(x.msg))}</div>
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
