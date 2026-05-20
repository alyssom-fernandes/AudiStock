# AudiStock

**AudiStock** é um sistema web de gerenciamento de auditoria de estoque construído com JavaScript puro e Supabase. Permite que empresas realizem contagens físicas de estoque, rastreiem divergências entre quantidades contadas e do sistema, gerem relatórios de divergências e gerenciem múltiplas empresas, produtos e usuários auditores — tudo em uma interface limpa com tema escuro.

---

## ✨ Funcionalidades

- **Suporte multi-empresa** — gerencie produtos e auditorias de múltiplas unidades de negócio
- **Ciclo de vida da auditoria** — criar, executar, pausar, finalizar e cancelar auditorias
- **Modo cego ou visível** — oculte ou exiba as quantidades do sistema durante a contagem
- **Três modos de entrada** — digitação manual, leitor de código de barras (USB/Bluetooth) e câmera (Barcode Detection API nativa)
- **Suporte offline** — contagens são enfileiradas no IndexedDB e sincronizadas automaticamente ao voltar online
- **Colaboração em tempo real** — múltiplos auditores podem contar simultaneamente via Supabase Realtime (Presence + Broadcast)
- **Relatórios de divergências** — filtre por sobras, faltas ou todos os itens; exporte para CSV ou PDF
- **Controle de acesso por perfil** — quatro perfis: `supremo`, `administrador`, `auditor`, `visualizador`
- **Importação via Excel** — importe produtos em massa por arquivo `.xlsx` usando SheetJS
- **Histórico de edições** — cada correção de contagem é registrada com usuário, data/hora e motivo opcional
- **Tema claro / escuro** — alternância com um clique, preferência salva no localStorage

---

## 🛠 Tecnologias

| Camada | Tecnologia |
|---|---|
| Frontend | JavaScript puro (módulos ES6), HTML, CSS |
| Backend / Banco de dados | [Supabase](https://supabase.com) (PostgreSQL + Auth + Realtime) |
| Fila offline | IndexedDB |
| Exportação PDF | jsPDF + jsPDF-AutoTable |
| Importação Excel | SheetJS (XLSX) |
| Fontes | Syne, DM Sans, JetBrains Mono |

Sem etapa de build, sem bundler, sem framework — apenas arquivos servidos via HTTP.

---

## 📁 Estrutura de arquivos

```
audistock/
├── index.html          ← redireciona para login ou dashboard
├── login.html          ← página de autenticação
├── app.html            ← shell principal (dashboard, auditorias, relatórios, configurações...)
├── contagem.html       ← tela de contagem (?id=auditoria_id)
├── relatorios.html     ← relatório de divergências (?id=auditoria_id)
│
├── style.css           ← design system completo
│
├── auth.js             ← login / logout / requireAuth / helpers de perfil
├── ui.js               ← layout, sidebar, toasts, modais, formatadores
├── supabaseClient.js   ← ⚙️ configure suas credenciais aqui
├── auditorias.js       ← ciclo de vida da auditoria (criar, finalizar, cancelar, progresso)
├── contagem.js         ← registro de contagem, resolução de conflitos, histórico de edições
├── produtos.js         ← busca e gerenciamento de produtos
├── empresas.js         ← CRUD de empresas
├── relatorios.js       ← views de divergências e exportação CSV
└── offline.js          ← fila IndexedDB e sincronização automática
```

---

## 🚀 Como começar

### 1. Configure as credenciais do Supabase

Abra `supabaseClient.js` e substitua os valores:

```js
const SUPABASE_URL      = 'https://SEU_PROJECT_ID.supabase.co';
const SUPABASE_ANON_KEY = 'SUA_ANON_PUBLIC_KEY';
```

Encontre esses valores em: **Supabase Dashboard → Project Settings → API**

---

### 2. Execute o schema SQL

No Supabase, vá em **SQL Editor** e execute o conteúdo de `audistock-schema.sql`.

Isso cria:
- Todas as tabelas (`empresas`, `usuarios`, `produtos`, `auditorias`, `auditoria_itens`, etc.)
- Views: `vw_relatorio_divergencias` e `vw_produtos_nao_auditados`
- Função: `gerar_numero_auditoria()` — gera números sequenciais de auditoria (AUD-YYYY-NNNN)
- Índices de busca full-text

---

### 3. Configure Row Level Security (RLS)

No **Supabase Dashboard → Authentication → Policies**, adicione as seguintes políticas:

```sql
ALTER TABLE empresas            ENABLE ROW LEVEL SECURITY;
ALTER TABLE usuarios            ENABLE ROW LEVEL SECURITY;
ALTER TABLE produtos            ENABLE ROW LEVEL SECURITY;
ALTER TABLE auditorias          ENABLE ROW LEVEL SECURITY;
ALTER TABLE auditoria_itens     ENABLE ROW LEVEL SECURITY;

CREATE POLICY "autenticados podem ler"
  ON empresas FOR SELECT TO authenticated USING (true);

CREATE POLICY "autenticados podem ler"
  ON produtos FOR SELECT TO authenticated USING (ativo = true);

CREATE POLICY "autenticados podem ler"
  ON auditorias FOR SELECT TO authenticated USING (true);

CREATE POLICY "autenticados podem inserir itens"
  ON auditoria_itens FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "autenticados podem ler itens"
  ON auditoria_itens FOR SELECT TO authenticated USING (true);

CREATE POLICY "autenticados podem atualizar itens"
  ON auditoria_itens FOR UPDATE TO authenticated USING (true);
```

---

### 4. Crie o primeiro usuário (Supremo)

No **Supabase Dashboard → Authentication → Users → Add User**, crie um usuário com seu e-mail e senha.

Depois no **SQL Editor**, insira o perfil:

```sql
INSERT INTO usuarios (id, nome, email, role, ativo)
VALUES (
  '<UUID da aba Auth Users>',
  'Seu Nome',
  'seu@email.com',
  'supremo',
  true
);
```

---

### 5. Sirva os arquivos

> ⚠️ **Não abra os arquivos HTML diretamente** (`file://`). Módulos ES6 requerem um servidor HTTP.

```bash
# Node (recomendado)
npx serve .

# Python
python3 -m http.server 8080
```

Acesse `http://localhost:3000` no navegador.

---

## 👥 Perfis de usuário

| Perfil | Permissões |
|---|---|
| `supremo` | Acesso total — gerencia usuários, empresas, produtos, auditorias e configurações do sistema |
| `administrador` | Cria e gerencia auditorias, empresas, produtos e usuários de nível inferior |
| `auditor` | Executa sessões de contagem |
| `visualizador` | Acesso somente leitura a relatórios e histórico de auditorias |

---

## 🔗 Fluxo entre páginas

```
login.html
  └─→ app.html (dashboard)

app.html?tela=auditorias
  └─→ contagem.html?id=<id>     (iniciar ou continuar contagem)

contagem.html?id=<id>
  └─→ relatorios.html?id=<id>   (após finalizar)

app.html?tela=relatorios
  └─→ relatorios.html?id=<id>   (ver qualquer relatório finalizado)
```

---

## 🐛 Erros comuns

| Erro | Solução |
|---|---|
| `Failed to fetch` | Verifique `SUPABASE_URL` em `supabaseClient.js` |
| `Invalid API key` | Verifique `SUPABASE_ANON_KEY` |
| `permission denied for table` | Configure as políticas RLS (passo 3) |
| `CORS error` | Adicione seu domínio em Supabase → Auth → URL Configuration |
| `relation does not exist` | Execute o schema SQL (passo 2) |
| Módulos ES6 não carregam | Sirva com HTTP — não use `file://` |
| Projeto Supabase pausado | O plano gratuito pausa após 7 dias sem atividade — reative em supabase.com/dashboard |
