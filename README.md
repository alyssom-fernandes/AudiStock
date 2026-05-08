# AudiStock — Guia de Configuração

## ⚡ Início rápido

### 1. Configure as credenciais do Supabase

Abra `js/supabaseClient.js` e substitua:

```js
const SUPABASE_URL      = 'https://SEU_PROJECT_ID.supabase.co';
const SUPABASE_ANON_KEY = 'SUA_ANON_PUBLIC_KEY';
```

Encontre esses valores em:
**Supabase Dashboard → Project Settings → API**

---

### 2. Execute o schema SQL

No Supabase, vá em **SQL Editor** e cole o conteúdo de `audistock-schema.sql`.

Isso cria:
- Todas as tabelas
- Views `vw_relatorio_divergencias` e `vw_produtos_nao_auditados`
- Função `gerar_numero_auditoria()`
- Índices de busca full-text

---

### 3. Configure Row Level Security (RLS)

No Supabase Dashboard → Authentication → Policies, adicione estas políticas básicas:

```sql
-- Habilitar RLS em todas as tabelas
ALTER TABLE empresas            ENABLE ROW LEVEL SECURITY;
ALTER TABLE usuarios            ENABLE ROW LEVEL SECURITY;
ALTER TABLE produtos            ENABLE ROW LEVEL SECURITY;
ALTER TABLE auditorias          ENABLE ROW LEVEL SECURITY;
ALTER TABLE auditoria_itens     ENABLE ROW LEVEL SECURITY;

-- Política: usuário autenticado pode ler tudo
-- (ajuste conforme sua necessidade de isolamento por empresa)

CREATE POLICY "autenticados podem ler"
  ON empresas FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "autenticados podem ler"
  ON produtos FOR SELECT
  TO authenticated USING (ativo = true);

CREATE POLICY "autenticados podem ler"
  ON auditorias FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "autenticados podem inserir itens"
  ON auditoria_itens FOR INSERT
  TO authenticated WITH CHECK (true);

CREATE POLICY "autenticados podem ler itens"
  ON auditoria_itens FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "autenticados podem atualizar itens"
  ON auditoria_itens FOR UPDATE
  TO authenticated USING (true);
```

---

### 4. Crie o primeiro usuário (Supremo)

No **Supabase Dashboard → Authentication → Users → Add User**:

```
Email: alyssom1919@gmail.com
Password: (sua senha)
```

Depois no **SQL Editor**:

```sql
INSERT INTO usuarios (id, nome, email, role, ativo)
VALUES (
  '<UUID do usuário criado no Auth>',
  'Alyssom',
  'alyssom1919@gmail.com',
  'supremo',
  true
);
```

> Para encontrar o UUID: Authentication → Users → copie o UUID da coluna ID.

---

### 5. Sirva os arquivos

**Opção A — Firebase Hosting (recomendado):**

```bash
npm install -g firebase-tools
firebase login
firebase init hosting
# Pasta pública: audistock/
firebase deploy
```

**Opção B — Servidor local simples:**

```bash
# Python
cd audistock/
python3 -m http.server 8080

# Node
npx serve .
```

Acesse: `http://localhost:8080`

> ⚠️ **Não abra o HTML diretamente como arquivo** (file://).
> Os módulos ES6 requerem um servidor HTTP.

---

## 📁 Estrutura de arquivos

```
audistock/
├── index.html          ← redireciona login/dashboard
├── login.html          ← autenticação
├── dashboard.html      ← visão geral
├── auditorias.html     ← lista + criar auditoria
├── contagem.html       ← tela do auditor (?id=auditoria_id)
├── relatorios.html     ← divergências (?id=auditoria_id)
│
├── css/
│   └── style.css       ← design system completo
│
└── js/
    ├── supabaseClient.js   ← ⚙️ configure aqui
    ├── auth.js             ← login / logout / requireAuth
    ├── ui.js               ← toasts / loading / formatadores
    ├── _layout.js          ← sidebar + topbar
    ├── empresas.js         ← CRUD empresas
    ├── produtos.js         ← busca + importação
    ├── auditorias.js       ← ciclo de vida auditoria
    ├── contagem.js         ← registrar / editar contagens
    ├── relatorios.js       ← views + exportação CSV
    └── offline.js          ← IndexedDB + sync automático
```

---

## 🔗 Como as páginas se comunicam

```
login.html
  └─→ dashboard.html          (após login bem-sucedido)

auditorias.html
  └─→ contagem.html?id=<id>   (ao clicar "Continuar" ou criar nova)

contagem.html?id=<id>
  └─→ relatorios.html?id=<id> (ao clicar "Finalizar")

relatorios.html?id=<id>
  └─→ contagem.html?id=<id>   (se status = em_andamento)
```

---

## 🔧 Próximas páginas a implementar

| Página | Módulo JS principal |
|--------|---------------------|
| `empresas.html` | `empresas.js` |
| `produtos.html` | `produtos.js` |
| `usuarios.html` | auth.js + supabase direto |
| `config.html`   | supabase direto |

Padrão a seguir:
1. `requireAuth()` no topo
2. `initLayout('Título')`
3. Chamar os módulos js/
4. Renderizar HTML no `#pageBody`

---

## 🌐 Configuração do Supabase para produção

### Storage (para importação de Excel)
```
Dashboard → Storage → New bucket → "importacoes"
Tornar privado
```

### Realtime (opcional — atualizações em tempo real)
```sql
-- Habilita realtime na tabela de itens
ALTER PUBLICATION supabase_realtime ADD TABLE auditoria_itens;
```

Então no JS:
```js
supabase
  .channel('itens-auditoria')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'auditoria_itens' },
    payload => console.log(payload))
  .subscribe();
```

---

## 🐛 Erros comuns

| Erro | Solução |
|------|---------|
| `Failed to fetch` | Verifique SUPABASE_URL em supabaseClient.js |
| `Invalid API key` | Verifique SUPABASE_ANON_KEY |
| `permission denied for table` | Configure as políticas RLS (passo 3) |
| `CORS error` | Adicione seu domínio em Supabase → Auth → URL Configuration |
| `relation does not exist` | Execute o schema SQL (passo 2) |
| Módulos ES6 não carregam | Sirva com HTTP, não file:// |
