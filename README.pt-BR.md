# AudiStock

![AudiStock: o relatório de divergências no computador e a contagem no celular](docs/telas/capa.png)

O AudiStock organiza a auditoria de estoque. A equipe conta o que está na
prateleira pelo celular, com leitor de código de barras ou digitando; no
fechamento, informa o saldo que consta no sistema (ERP), e o AudiStock
mostra, item a item, o que sobrou e o que faltou. O relatório sai em PDF,
em planilha Excel, em CSV ou impresso.

JavaScript puro, sem framework e sem etapa de build, com o Supabase
(PostgreSQL e autenticação) por trás.

**[Abrir o AudiStock](https://alyssom-fernandes.github.io/AudiStock/)** · **[Ver a demonstração](https://alyssom-fernandes.github.io/AudiStock/app.html?demo=1)**,
com empresas, produtos e auditorias fictícias, em que nada é gravado.

![JavaScript](https://img.shields.io/badge/JavaScript-sem_framework-f7df1e?style=flat-square&logo=javascript&logoColor=black)
![Sem build](https://img.shields.io/badge/etapa_de_build-nenhuma-success?style=flat-square)
![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL_e_Auth-3ecf8e?style=flat-square&logo=supabase&logoColor=white)
![Tema](https://img.shields.io/badge/tema-claro_e_escuro-c2410c?style=flat-square)
![Licença](https://img.shields.io/badge/licen%C3%A7a-MIT-blue?style=flat-square)
[![Testes](https://github.com/alyssom-fernandes/AudiStock/actions/workflows/testes.yml/badge.svg)](https://github.com/alyssom-fernandes/AudiStock/actions/workflows/testes.yml)

Este README também está em [inglês](README.md).

## Em 30 segundos

1. Abra a [demonstração](https://alyssom-fernandes.github.io/AudiStock/app.html?demo=1).
2. Em **Auditorias**, abra a contagem em andamento da Distribuidora
   Aurora: digite "arroz", escolha o produto, informe a quantidade e
   tecle Enter.
3. Em **Relatórios**, abra o do Atacado Serra Azul, filtre as faltas e
   baixe a planilha ou o PDF.

## Telas

Capturadas do modo demonstração.

| Dashboard, tema escuro | Dashboard, tema claro |
|---|---|
| ![Dashboard no tema escuro](docs/telas/dashboard-escuro.png) | ![Dashboard no tema claro](docs/telas/dashboard-claro.png) |
| **Contagem** | **Relatório de divergências** |
| ![Contagem com a lista de itens contados](docs/telas/contagem.png) | ![Relatório com indicadores, filtros e itens](docs/telas/relatorio.png) |

| Relatório em PDF | No celular |
|---|---|
| <img src="docs/telas/pdf.png" alt="Primeira página do relatório em PDF" width="520"> | <img src="docs/telas/celular.png" alt="Contagem no celular" width="260"> |

## O que ele faz

### Contagem

- Uma auditoria por empresa por vez, com número sequencial por ano
  (AUD-2026-0007), tipo de contagem e observações. Na contagem **cega**,
  quem conta não vê saldo nenhum; na **visível**, vê o último saldo do
  sistema de cada produto, o da auditoria finalizada anterior.
- Três formas de registrar: **teclado**, com busca por código, nome ou
  código de barras e sugestões navegáveis pelas setas; **leitor** USB ou
  Bluetooth, em que cada leitura soma uma unidade e o campo já fica pronto
  para a próxima; e **câmera** do celular, onde o navegador oferece leitura
  de código de barras.
- Produto já contado: o sistema pergunta se soma ou substitui e mostra o
  resultado de cada opção. Somar é o padrão, porque o mesmo produto
  costuma estar em mais de um lugar.
- Correções ficam no histórico da auditoria, com o valor anterior, quem
  corrigiu, quando e por quê.
- Sem internet, as contagens ficam guardadas no aparelho (IndexedDB), e o
  cadastro de produtos fica na página da contagem: a busca e o leitor
  continuam funcionando. Com a contagem ou o fechamento abertos, elas são
  enviadas assim que há conexão: ao abrir a página, quando a rede volta e
  a cada 30 segundos. Cada uma leva uma identificação, então um envio
  repetido conta uma vez só, e cada uma pertence a quem registrou: sair
  com contagens não enviadas mostra um aviso. O fechamento espera as suas
  contagens ainda no aparelho; as de outra pessoa e as recusadas pelo
  servidor ficam de fora, com aviso.

### Fechamento e relatório

- No fechamento, o saldo do sistema é digitado ao lado do contado, com a
  diferença calculada na hora. A auditoria só é finalizada depois disso,
  com aviso se algum saldo ficou em branco. Também dá para cancelar uma
  auditoria, com o motivo registrado.
- O relatório mostra itens contados, sem divergência, com falta, com
  sobra, sem saldo do sistema e os produtos que ninguém contou. Em
  auditoria em andamento ou cancelada, ele mostra só a contagem: sem
  saldo do sistema, não há divergência para calcular.
- Filtros por divergência, falta ou sobra, e ordem pela maior
  divergência (pelo tamanho, seja falta ou sobra), por nome ou por código.
- Toda quantidade vem com a unidade. Unidades fracionadas (kg, L, m)
  sempre com três casas: "1,288 kg" nunca é lido como mil e duzentos.
- **Excel** com números de verdade (não texto), diferença e situação por
  fórmula, filtro, cabeçalho fixo, datas no horário local e uma aba com
  os não contados.
- **PDF** para arquivar e assinar: identificação da auditoria, resumo,
  tabela com faltas e sobras destacadas, produtos não contados, "Página X
  de Y" e linhas de assinatura, que nunca ficam sozinhas numa folha.
- **CSV** pronto para o Excel brasileiro: ponto e vírgula, vírgula
  decimal, acentos certos e, em cada linha, a auditoria e a empresa.
- **Impressão** com folha própria em A4, sempre no tema claro, com o mesmo
  desenho do PDF.

### Cadastros e acesso

- Empresas, produtos e usuários. Produtos entram por planilha `.xlsx`,
  com um modelo para baixar e uma prévia que aponta a linha da planilha
  de cada problema (sem código ou nome, código repetido, código de barras
  que já é de outro produto). Só as colunas da planilha são gravadas, e
  uma célula vazia nunca apaga a unidade nem o código de barras. Os
  produtos também podem ser copiados do cadastro de outra empresa.
- Quatro perfis: **supremo** (tudo, inclusive excluir auditorias),
  **administrador** (cadastros, criar e cancelar auditorias),
  **auditor** (registra contagens e faz o fechamento) e **visualizador**
  (só consulta). Cada pessoa troca a própria senha em Configurações.
- As permissões valem no banco, não só na tela: políticas de RLS por
  perfil e por empresa, e ninguém altera o próprio perfil de acesso.
- O cadastro de pessoas passa por uma Edge Function com a chave de
  serviço, que nunca vai para o navegador.

### Interface

- Tema claro e escuro, que segue o do aparelho até alguém escolher.
- No celular, as tabelas viram cartões e os formulários abrem como folhas
  na parte de baixo da tela.
- Pelo teclado: janelas prendem o foco e fecham com Esc; em ação
  perigosa, o foco começa em "Cancelar". Depois de salvar, o foco volta
  ao botão da linha, e a troca de tela leva o foco ao título novo.
- Falhas não tratadas ficam registradas no navegador e aparecem em
  **Configurações**, com um atalho no aviso de erro. No console,
  `errosRegistrados()` lista as 30 mais recentes deste navegador, de todas
  as páginas.

## Modo demonstração

`?demo=1` em qualquer página (ou o botão **Explorar a demonstração** no
login) troca o Supabase por `js/demo.js`, um banco de mentira que imita a
parte do `supabase-js` usada pelo sistema: filtros, junções, as duas views
do relatório e a geração do número da auditoria. São 5 empresas, 263
produtos, 8 auditorias em todas as situações e 8 usuários fictícios, sempre
os mesmos. Os dados ficam só na aba aberta; **Configurações › Restaurar
dados da demonstração** volta ao começo, e `?demo=vazio` abre uma base sem
cadastros. Uma chamada que o banco de mentira não conhece vira registro em
`errosRegistrados()`, em vez de falhar em silêncio.

## Como é feito

| Parte | Tecnologia |
|---|---|
| Interface | HTML, CSS e JavaScript em módulos ES, sem framework e sem build |
| Dados e login | Supabase (PostgreSQL, Auth) |
| Contagem sem internet | IndexedDB |
| PDF | jsPDF e jsPDF-AutoTable |
| Excel | ExcelJS, para gerar os relatórios e ler a planilha de produtos |
| Fontes | IBM Plex Sans e IBM Plex Mono (Google Fonts); IBM Plex Sans embutida no PDF |
| Testes | `node:test`, PGlite (Postgres em WebAssembly) e Playwright |

As bibliotecas de PDF e de planilha só são baixadas quando alguém exporta
ou importa, e o navegador confere cada uma pelo hash (SRI) antes de rodar.

## Banco e permissões

[`supabase/schema.sql`](supabase/schema.sql) cria tudo o que o app usa:
tabelas, as duas visões do relatório, a numeração AUD-AAAA-NNNN (sem
número repetido, mesmo com duas pessoas criando ao mesmo tempo) e a função
`registrar_contagem`, que soma a contagem numa só transação. Antes dela,
20 leituras simultâneas do mesmo produto registravam 2. Hoje o app manda
toda leitura para essa função: um teste dispara 20 de uma vez no banco da
demonstração e confere que registram 20, e a prova com dois aparelhos de
verdade está no roteiro do teste real. Quando dois aparelhos contam um
produto pela primeira vez, o segundo recebe a pergunta somar ou
substituir, em vez de apagar o primeiro. O fechamento também é uma função
só (`finalizar_auditoria`): grava os saldos e encerra junto, e recusa se
alguém contou um produto que a tela de fechamento ainda não mostrava, ou
recontou um que ela mostrava (a diferença revisada é a que vai para o
relatório).

O `schema.sql` pode ser rodado de novo num banco criado por uma versão
anterior deste repositório: ele cria o que falta, atualiza funções,
gatilhos e permissões e não apaga dados.

As permissões ficam no banco: cada perfil só vê a sua empresa, o auditor
conta e finaliza mas não cancela, só o supremo exclui, e gatilhos impedem
que alguém promova a si mesmo ou altere uma contagem já finalizada.
[`supabase/testes/permissoes.sql`](supabase/testes/permissoes.sql) entra
como cada perfil e confere 54 dessas regras; dá para rodar no SQL Editor
de qualquer projeto, e ele apaga o que criou.

## Testes

```bash
npm install
npm test            # unidade (Node) e banco (PGlite): 70 testes
npm run test:e2e    # ponta a ponta no navegador (Playwright): 39 execuções
```

- **Unidade:** o código real de `js/` rodando no Node sobre o banco do
  modo demonstração: soma das leituras, envio repetido que conta uma vez,
  histórico, leitura das quantidades ("1.234" é mil duzentos e trinta e
  quatro), importação em lotes que não apaga as colunas ausentes, CSV,
  números do relatório, fechamento, a fila sem internet (num IndexedDB
  em memória), regras de cadastro.
- **Banco:** `schema.sql` e `permissoes.sql` num Postgres de verdade
  (PGlite), sem instalar nada, inclusive rodando o esquema de novo sobre
  um banco da versão anterior.
- **Ponta a ponta:** contagem pelo teclado e pelo leitor, contagem sem
  internet que sobe ao reabrir a página, fechamento (inclusive com um
  produto contado ou recontado em outro aparelho no meio, e finalizado
  por outra pessoa), exportações (o PDF
  precisa sair com a fonte embutida, e todo script de CDN, com o hash),
  importação de planilha, cadastros, foco depois de salvar, tabelas em
  largura de tablet, teclado e celular: 34 execuções em tela de
  computador (um teste só de celular é pulado nela) e 5 no celular. Cada
  teste termina conferindo que `errosRegistrados()` está vazio.

Os testes de ponta a ponta usam o Google Chrome instalado. Sem ele, rode
uma vez `npx playwright install chromium` e depois, no PowerShell:

```powershell
$env:PW_CHANNEL='chromium'; npm run test:e2e
```

No bash, `PW_CHANNEL=chromium npm run test:e2e`. Com `msedge` no lugar de
`chromium`, os testes usam o Edge.

Tudo roda no GitHub Actions a cada push na `main` e em cada pull request. O roteiro para o teste com o
Supabase de verdade está em [`docs/teste-real.md`](docs/teste-real.md).

## Limitações conhecidas

- Duas pessoas podem contar a mesma auditoria ao mesmo tempo, mas uma só
  vê os registros da outra ao recarregar a página: não há atualização em
  tempo real.
- A leitura pela câmera depende do `BarcodeDetector`, que existe no Chrome
  e no Edge para Android, macOS e ChromeOS. No Windows e no iPhone, use o
  leitor ou o teclado.
- `supabase/schema.sql` foi reconstruído a partir do que o código usa e
  validado num Postgres local. Rode o arquivo inteiro e depois o
  `permissoes.sql`; num banco criado fora deste repositório, confira
  antes em `pg_policies` se há políticas com outros nomes, que o arquivo
  não remove.
- A concorrência entre aparelhos (duas pessoas contando ou finalizando ao
  mesmo tempo) é garantida por travas do Postgres que os testes
  automáticos não exercitam, porque rodam numa conexão só; a prova é o
  roteiro com dois aparelhos em `docs/teste-real.md`.
- O número de página e a identificação no rodapé da folha impressa usam
  `@page` com caixas de margem, que o Chrome e o Edge suportam e o
  Firefox ainda não; lá a folha sai sem esse rodapé. O PDF não tem essa
  dependência.
- A biblioteca do Supabase vem de CDN por `import()`, que não aceita
  conferência por hash; a versão é fixa para não mudar sem aviso.
- A lista de Relatórios mostra as 200 auditorias finalizadas mais
  recentes; para as anteriores, filtre por empresa.
- A interface é só em português.

## Como usar a sua cópia

1. Crie um projeto no [Supabase](https://supabase.com) e rode
   `supabase/schema.sql` no SQL Editor.
2. Em `js/supabaseClient.js`, troque a URL e a chave pública pelas do seu
   projeto (Supabase › Project Settings › API).
3. Crie o primeiro usuário em Authentication › Users e insira o perfil
   dele na tabela `usuarios` com o papel `supremo`.
4. Publique a função de cadastro: `supabase functions deploy criar-usuario`.
5. Sirva os arquivos por HTTP (módulos ES não abrem direto do disco):

```bash
npm run servir
```

Para só ver o sistema funcionando, nada disso é preciso: abra
`app.html?demo=1`.

## Estrutura

```
index.html              redireciona para o login ou para o app
login.html              entrada, com o acesso à demonstração
app.html                casca do app; as telas vêm de js/telas/
contagem.html           registro da contagem (?id=)
estoque-sistema.html    fechamento: saldos do sistema (?id=)
relatorios.html         relatório de divergências (?id=)
404.html                página de endereço não encontrado
css/style.css           todo o visual, nos dois temas, e a folha de impressão
js/
  app.js                roteador do app.html
  telas/                uma tela por arquivo (dashboard, auditorias, contagem…)
  ui.js                 layout, modais, avisos, formatadores
  auth.js               login, sessão e perfis
  supabaseClient.js     conexão com o Supabase (ou com o demo)
  demo.js               banco de mentira do modo demonstração
  erros.js              registro de falhas não tratadas
  auditorias.js, contagem.js, produtos.js, empresas.js, relatorios.js
                        acesso aos dados
  usuarios.js           cadastro de pessoas (Edge Function ou cliente à parte)
  exportacao.js         PDF e Excel
  offline.js            fila de contagens sem internet
supabase/
  schema.sql            tabelas, visões, funções e permissões (RLS)
  testes/permissoes.sql confere as permissões entrando como cada perfil
  functions/criar-usuario/  Edge Function de cadastro e as regras dela
fontes/                 IBM Plex Sans para o PDF (licença OFL)
testes/                 unidade, banco e ponta a ponta
docs/                   imagens deste README e o roteiro do teste real
```

## Licença

[MIT](LICENSE). Feito por [Alyssom Fernandes](https://github.com/alyssom-fernandes), AFN Systems.
