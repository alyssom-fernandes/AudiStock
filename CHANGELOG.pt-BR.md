# Histórico de mudanças

Montado a partir do histórico de commits. Ainda não há tags nem versões
publicadas, então as entradas são agrupadas por data; as mais novas vêm
primeiro.

## Sem versão (branch `correcoes-avaliacao`)

- Percentuais com uma casa decimal em todo lugar (painel, relatório, PDF e CSV), por um formatador único, `fmtPct`.
- O cadastro de pessoas passa só pela Edge Function `criar-usuario`; o caminho do `signUp` pelo navegador foi retirado e o README diz que o cadastro aberto deve ficar desligado no Supabase.
- A política de segurança (CSP) libera o escopo `@supabase` do jsDelivr só para a versão fixada do `supabase-js` e as dependências exatas dela.
- PWA: service worker com cache versionado dos arquivos do site, manifest com ícones e um teste que reabre a página de contagem sem internet.
- `testes/capturas.py` gera de novo as capturas do README a partir da demonstração, e `docs/telas` foi regenerada.
- Seção de destaques técnicos no README; este histórico.

## 2026-10-15

- "Tentar de novo" volta à tela certa, a "% do saldo" bate com a ordem e a CSP ficou mais estreita.

## 2026-10-14

- Segurança: política de conteúdo (CSP), jsPDF 4.2.1 e fontes do próprio site.
- O relatório mostra a % do saldo; a demonstração ficou mais clara e sem saltos.
- Visual: laranja de sinalização, números de etiqueta, régua de divergência e barras finas no laranja vivo também no tema claro.
- README com o visual novo, a demonstração como link principal e metadados de compartilhamento.

## 2026-10-06

- Rodadas de revisão: fechamento atômico, fila sem internet, banco que pode ser reexecutado, janelas sem disputa de campos, CI atualizado e ajustes na demonstração.
- Correções da verificação: contagem sem internet, banco e acabamento.

## 2026-10-02

- Banco, permissões (RLS), testes automatizados e cadastro seguro.
- Licença MIT.
- Imagens do README com o visual atual.
- Correções da revisão: contagem, fila sem internet, relatórios e exportações.

## 2026-10-01

- Modo demonstração e registro de erros.
- Acabamento completo: novo visual, telas refeitas e exportações.

## 2026-05-20 e antes

- Primeiras versões do sistema, enviadas em 2026-05-08 e atualizadas em 2026-05-20.
