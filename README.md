# AudiStock

**AudiStock** is a web-based inventory audit management system built with vanilla JavaScript and Supabase. It allows businesses to run physical stock counts, track divergences between counted and system quantities, generate divergence reports, and manage multiple companies, products, and auditor users — all from a clean, dark-themed interface.

---

## Features

- **Multi-company support** — manage products and audits across multiple business units
- **Audit lifecycle** — create, run, pause, finalize, and cancel audits
- **Blind or visible mode** — hide or show system stock quantities during counting
- **Three counting input modes** — manual entry, barcode scanner (USB/Bluetooth), and camera (native Barcode Detection API)
- **Offline support** — counts are queued in IndexedDB and synced automatically when back online
- **Real-time collaboration** — multiple auditors can count simultaneously via Supabase Realtime (Presence + Broadcast)
- **Divergence reports** — filter by surpluses, shortages, or all items; export to CSV or PDF
- **Role-based access control** — four roles: `supremo`, `administrador`, `auditor`, `visualizador`
- **Excel import** — bulk-import products via `.xlsx` file using SheetJS
- **Edit history** — every count correction is logged with user, timestamp, and optional reason
- **Light / dark theme** — toggle with one click, preference saved in localStorage

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla JS (ES6 modules), HTML, CSS |
| Backend / Database | [Supabase](https://supabase.com) (PostgreSQL + Auth + Realtime) |
| Offline queue | IndexedDB |
| PDF export | jsPDF + jsPDF-AutoTable |
| Excel import | SheetJS (XLSX) |
| Fonts | Syne, DM Sans, JetBrains Mono |

No build step, no bundler, no framework — just files served over HTTP.

---

## File Structure

```
audistock/
├── index.html          ← redirects to login or dashboard
├── login.html          ← authentication page
├── app.html            ← main SPA shell (dashboard, audits, reports, settings...)
├── contagem.html       ← counting screen (?id=audit_id)
├── relatorios.html     ← divergence report (?id=audit_id)
│
├── style.css           ← complete design system
│
├── auth.js             ← login / logout / requireAuth / role helpers
├── ui.js               ← layout, sidebar, toasts, modals, formatters
├── supabaseClient.js   ← configure your credentials here
├── auditorias.js       ← audit lifecycle (create, finalize, cancel, progress)
├── contagem.js         ← count registration, conflict resolution, edit history
├── produtos.js         ← product search and management
├── empresas.js         ← company CRUD
├── relatorios.js       ← divergence views and CSV export
└── offline.js          ← IndexedDB queue and auto-sync
```

---

## Getting Started

### 1. Configure Supabase credentials

Open `supabaseClient.js` and replace the placeholder values:

```js
const SUPABASE_URL      = 'https://YOUR_PROJECT_ID.supabase.co';
const SUPABASE_ANON_KEY = 'YOUR_ANON_PUBLIC_KEY';
```

Find these values at: **Supabase Dashboard → Project Settings → API**

---

### 2. Run the SQL schema

In the Supabase dashboard, go to **SQL Editor** and run the contents of `audistock-schema.sql`.

This creates:
- All tables (`empresas`, `usuarios`, `produtos`, `auditorias`, `auditoria_itens`, etc.)
- Views: `vw_relatorio_divergencias` and `vw_produtos_nao_auditados`
- Function: `gerar_numero_auditoria()` — generates sequential audit numbers (AUD-YYYY-NNNN)
- Full-text search indexes

---

### 3. Configure Row Level Security (RLS)

In **Supabase Dashboard → Authentication → Policies**, add the following policies:

```sql
ALTER TABLE empresas            ENABLE ROW LEVEL SECURITY;
ALTER TABLE usuarios            ENABLE ROW LEVEL SECURITY;
ALTER TABLE produtos            ENABLE ROW LEVEL SECURITY;
ALTER TABLE auditorias          ENABLE ROW LEVEL SECURITY;
ALTER TABLE auditoria_itens     ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated can read"
  ON empresas FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated can read"
  ON produtos FOR SELECT TO authenticated USING (ativo = true);

CREATE POLICY "authenticated can read"
  ON auditorias FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated can insert items"
  ON auditoria_itens FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "authenticated can read items"
  ON auditoria_itens FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated can update items"
  ON auditoria_itens FOR UPDATE TO authenticated USING (true);
```

---

### 4. Create the first user (Supremo)

In **Supabase Dashboard → Authentication → Users → Add User**, create a user with your email and password.

Then in the **SQL Editor**, insert the profile:

```sql
INSERT INTO usuarios (id, nome, email, role, ativo)
VALUES (
  '<UUID from Auth Users tab>',
  'Your Name',
  'your@email.com',
  'supremo',
  true
);
```

---

### 5. Serve the files

> **Do not open HTML files directly** (`file://`). ES6 modules require an HTTP server.

```bash
# Node (recommended)
npx serve .

# Python
python3 -m http.server 8080
```

Then open `http://localhost:3000` in your browser.

---

## User Roles

| Role | Permissions |
|---|---|
| `supremo` | Full access — manage all users, companies, products, audits, and system settings |
| `administrador` | Create and manage audits, companies, products, and lower-level users |
| `auditor` | Run counting sessions |
| `visualizador` | Read-only access to reports and audit history |

---

## Page Flow

```
login.html
  └─→ app.html (dashboard)

app.html?tela=auditorias
  └─→ contagem.html?id=<id>     (start or continue counting)

contagem.html?id=<id>
  └─→ relatorios.html?id=<id>   (after finalizing)

app.html?tela=relatorios
  └─→ relatorios.html?id=<id>   (view any finalized audit report)
```

---

## Common Issues

| Error | Solution |
|---|---|
| `Failed to fetch` | Check `SUPABASE_URL` in `supabaseClient.js` |
| `Invalid API key` | Check `SUPABASE_ANON_KEY` |
| `permission denied for table` | Set up RLS policies (step 3) |
| `CORS error` | Add your domain in Supabase → Auth → URL Configuration |
| `relation does not exist` | Run the SQL schema (step 2) |
| ES6 modules not loading | Serve with HTTP — do not use `file://` |
| Supabase project paused | Free tier pauses after 7 days of inactivity — reactivate at supabase.com/dashboard |
