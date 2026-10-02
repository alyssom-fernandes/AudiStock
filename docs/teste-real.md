# Teste real com o Supabase

O modo demonstração e os testes automáticos cobrem o comportamento do
sistema, mas três coisas só se confirmam no seu projeto do Supabase: o
login de verdade, as permissões (RLS) e o cadastro de usuários. Este
roteiro leva uns 20 minutos.

## 1. Banco

1. No painel do Supabase, abra **SQL Editor**.
2. Se o projeto é novo, rode [`supabase/schema.sql`](../supabase/schema.sql)
   inteiro. Se o banco já existe, compare antes:

   ```bash
   supabase db dump --schema-only > meu-esquema.sql
   ```

   e aplique só o que faltar. O mais importante, se o banco for antigo:
   - a função `registrar_contagem`: sem ela o app funciona, mas leituras
     simultâneas do mesmo produto podem se perder;
   - os gatilhos `proteger_usuarios`, `proteger_auditorias` e
     `proteger_itens`;
   - as políticas de RLS.

## 2. Permissões

Rode [`supabase/testes/permissoes.sql`](../supabase/testes/permissoes.sql)
no SQL Editor. Ele cria empresas, usuários e auditorias de teste, entra
como cada perfil, confere 28 regras e **apaga tudo o que criou**. O
resultado é uma tabela: todas as linhas devem dizer `ok`.

Se aparecer `FALHOU`, a coluna `detalhe` diz o que aconteceu (por exemplo,
"1 linha alterada" onde deveria ser 0).

## 3. Cadastro de usuários

1. Instale a CLI do Supabase e entre na sua conta (`supabase login`).
2. Ligue a pasta ao projeto: `supabase link --project-ref <id do projeto>`.
3. Publique a função:

   ```bash
   supabase functions deploy criar-usuario
   ```

4. Com a função publicada, desligue o cadastro aberto em
   **Authentication › Providers › Email › Allow new users to sign up**.
   Sem a função, o app usa o cadastro pelo navegador num cliente à parte,
   que não troca a sessão de quem cadastra, mas exige essa opção ligada.

## 4. Pelo navegador

Entre com um usuário **supremo** e confira:

- [ ] Cadastre uma empresa, um administrador dessa empresa e um auditor.
      A sua sessão continua a mesma depois de cada cadastro.
- [ ] Importe a planilha de exemplo (Produtos › Importar planilha ›
      Baixar modelo) e confira a contagem de criados e atualizados.
- [ ] Inicie uma auditoria e abra a contagem num **celular** e num
      computador ao mesmo tempo. Registre o mesmo produto nos dois; o
      total tem que ser a soma.
- [ ] No celular, ligue o modo avião, registre dois produtos, feche a
      aba, desligue o modo avião e abra a contagem de novo. As duas
      contagens sobem sozinhas e somem os selos "Na fila".
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
- [ ] **Administrador de uma empresa**: só enxerga a própria empresa e só
      cadastra auditores e visualizadores dela.
- [ ] Desative o auditor e tente entrar com ele: o login avisa que a
      conta está desativada.
