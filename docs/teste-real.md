# Teste real com o Supabase

O modo demonstração e os testes automáticos cobrem o comportamento do
sistema, mas três coisas só se confirmam no seu projeto do Supabase: o
login de verdade, as permissões (RLS) e o cadastro de usuários. Este
roteiro leva uns 20 minutos.

## 0. Ferramentas

Instale a [CLI do Supabase](https://supabase.com/docs/guides/cli), entre
na sua conta e ligue esta pasta ao projeto:

```bash
supabase login
```

```bash
supabase link --project-ref <id do projeto>
```

O `link` cria a pasta `supabase/.temp/`, que fica fora do git.

## 1. Banco

1. No painel do Supabase, abra **SQL Editor**.
2. Rode [`supabase/schema.sql`](../supabase/schema.sql) inteiro, seja o
   projeto novo ou não. Ele pode ser rodado de novo num banco que já
   existe: cria as tabelas e colunas que faltam, troca funções, gatilhos,
   visões e políticas pela versão atual e não apaga dados. Se quiser uma
   cópia do banco antes, o comando abaixo baixa o esquema do projeto
   ligado no passo 0 (precisa do Docker aberto; o arquivo fica fora do
   git):

   ```bash
   supabase db dump -f meu-esquema.sql
   ```

3. Confira as mensagens (**NOTICE**) no fim da execução. Elas só aparecem
   num banco antigo com dados que impedem uma regra nova, por exemplo dois
   produtos ativos com o mesmo código de barras ou duas auditorias em
   andamento na mesma empresa. A mensagem diz qual regra ficou de fora;
   acerte os dados e rode o `schema.sql` de novo.

## 2. Permissões

Rode [`supabase/testes/permissoes.sql`](../supabase/testes/permissoes.sql)
no SQL Editor. Ele cria empresas, usuários e auditorias de teste, entra
como cada perfil, confere 48 regras e **apaga tudo o que criou**. O
resultado é uma tabela: todas as linhas devem dizer `ok`.

Se aparecer `FALHOU`, a coluna `detalhe` diz o que aconteceu (por exemplo,
"1 linha alterada" onde deveria ser 0).

## 3. Cadastro de usuários

1. Com a pasta ligada ao projeto (passo 0), publique a função:

   ```bash
   supabase functions deploy criar-usuario
   ```

2. Com a função publicada, desligue o cadastro aberto em
   **Authentication › Providers › Email › Allow new users to sign up**.
   Sem a função, o app usa o cadastro pelo navegador num cliente à parte,
   que não troca a sessão de quem cadastra, mas exige essa opção ligada.
   Com **Confirm email** também ligado, a pessoa é cadastrada, mas só
   entra depois de confirmar o e-mail, e o app avisa isso ao cadastrar.
3. Se o projeto tiver regras de senha mais rígidas que 6 caracteres
   (**Authentication › Policies**), o app mostra a regra que faltou.

## 4. Pelo navegador

Entre com um usuário **supremo** e confira:

- [ ] Cadastre uma empresa, um administrador dessa empresa e um auditor.
      A sua sessão continua a mesma depois de cada cadastro.
- [ ] Importe a planilha de exemplo (Produtos › Importar planilha ›
      Baixar modelo) e confira a contagem de criados e atualizados.
- [ ] Inicie uma auditoria e abra a contagem num **celular** e num
      computador ao mesmo tempo. Registre o mesmo produto nos dois; o
      total tem que ser a soma. Com um produto ainda não contado, escolha
      ele nos dois aparelhos e salve nos dois: o segundo tem que receber a
      pergunta somar ou substituir.
- [ ] Bipe o mesmo produto **ao mesmo tempo** nos dois aparelhos, várias
      vezes: o total no relatório é a soma de todas as leituras (é a
      prova da trava da função `registrar_contagem` no Postgres de
      verdade).
- [ ] No celular, ligue o modo avião, registre dois produtos (a busca
      continua funcionando), feche a aba, desligue o modo avião e abra a
      contagem de novo. As duas contagens sobem sozinhas e somem os selos
      "Na fila".
- [ ] Com uma contagem ainda na fila, clique em **Sair**: o app avisa que
      ela não foi enviada.
- [ ] Com o leitor de código de barras, bipe o mesmo produto várias vezes
      bem rápido. "Última leitura" mostra o total certo.
- [ ] No Chrome para Android, teste a aba **Câmera**.
- [ ] Faça o fechamento e baixe o Excel, o PDF e o CSV. Abra o Excel no
      Excel de verdade e confira datas, fórmulas e o filtro.
- [ ] Imprima o relatório pelo Chrome (Ctrl+P) e confira o rodapé com
      "Página X de Y".

Depois, saia e entre como cada perfil:

- [ ] **Auditor**: conta e finaliza, mas não vê Empresas, Produtos nem
      Usuários e não cancela auditoria.
- [ ] **Visualizador**: só consulta; a contagem diz que o perfil só
      acompanha.
- [ ] **Administrador de uma empresa**: só enxerga a própria empresa, só
      cadastra auditores e visualizadores dela, e não vê "Nova empresa"
      nem "Inativar" na tela de empresas.
- [ ] Desative o auditor e tente entrar com ele: o login avisa que a
      conta está desativada.
