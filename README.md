# AudiStock

![AudiStock: the discrepancy report on desktop and the counting screen on a phone](docs/telas/capa.png)

AudiStock runs physical inventory audits. The team counts what is on the
shelf from a phone, with a barcode scanner or by typing; at closing, they
enter the balance the ERP system shows, and AudiStock lists, item by item,
what is over and what is short. The report comes out as a PDF, an Excel
workbook, a CSV file or a printed sheet.

Plain JavaScript, no framework and no build step, backed by Supabase
(PostgreSQL and authentication). The interface is in Brazilian Portuguese.

**[Open AudiStock](https://alyssom-fernandes.github.io/AudiStock/)** · **[Try the demo](https://alyssom-fernandes.github.io/AudiStock/app.html?demo=1)**,
with fictional companies, products and audits, where nothing is saved.

![JavaScript](https://img.shields.io/badge/JavaScript-no_framework-f7df1e?style=flat-square&logo=javascript&logoColor=black)
![No build](https://img.shields.io/badge/build_step-none-success?style=flat-square)
![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL_and_Auth-3ecf8e?style=flat-square&logo=supabase&logoColor=white)
![Theme](https://img.shields.io/badge/theme-light_and_dark-c2410c?style=flat-square)
![License](https://img.shields.io/badge/license-MIT-blue?style=flat-square)
[![Tests](https://github.com/alyssom-fernandes/AudiStock/actions/workflows/testes.yml/badge.svg)](https://github.com/alyssom-fernandes/AudiStock/actions/workflows/testes.yml)

This README is also available in [Portuguese](README.pt-BR.md).

## In 30 seconds

1. Open the [demo](https://alyssom-fernandes.github.io/AudiStock/app.html?demo=1).
2. In **Auditorias**, open Distribuidora Aurora's count in progress: type
   "arroz", pick the product, enter the quantity and press Enter.
3. In **Relatórios**, open Atacado Serra Azul's report, filter the
   shortages ("Faltas") and download the spreadsheet or the PDF.

## Screens

Captured from the demo mode.

| Dashboard, dark theme | Dashboard, light theme |
|---|---|
| ![Dashboard in the dark theme](docs/telas/dashboard-escuro.png) | ![Dashboard in the light theme](docs/telas/dashboard-claro.png) |
| **Counting** | **Discrepancy report** |
| ![Counting screen with the list of counted items](docs/telas/contagem.png) | ![Report with indicators, filters and items](docs/telas/relatorio.png) |

| PDF report | On a phone |
|---|---|
| <img src="docs/telas/pdf.png" alt="First page of the PDF report" width="520"> | <img src="docs/telas/celular.png" alt="Counting on a phone" width="260"> |

## What it does

### Counting

- One audit per company at a time, with a yearly sequential number
  (AUD-2026-0007), a counting type and notes. In a **blind** count the
  counter sees no balance at all; in a **visible** one, they see each
  product's last system balance, taken from the previous finished audit.
- Three ways to record a count: **keyboard**, searching by code, name or
  barcode with arrow-key suggestions; a USB or Bluetooth **scanner**, where
  each scan adds one unit and the field is ready for the next one; and the
  phone **camera**, where the browser supports barcode detection.
- Product already counted: the app asks whether to add or replace, and
  shows the result of each option. Adding is the default, because the same
  product is often stored in more than one place.
- Corrections are kept in the audit history with the previous value, who
  changed it, when and why.
- Offline, counts are stored on the device (IndexedDB) and the product
  catalog stays on the counting page, so search and the scanner keep
  working. While the counting or closing page is open, counts are sent as
  soon as there is a connection: when the page opens, when the network
  comes back and every 30 seconds. Each one carries an id, so a count sent
  twice is applied once, and each one belongs to the person who recorded
  it: signing out warns about counts not yet sent. An audit cannot be
  finished with counts still on the device.

### Closing and report

- At closing, the system balance is typed next to the counted quantity,
  with the difference computed on the spot. Only then is the audit
  finished, with a warning if any balance was left blank. Audits can also
  be cancelled, with the reason recorded.
- The report shows counted items, items without discrepancy, shortages,
  overages, items without a system balance and the products nobody
  counted. For an audit in progress or cancelled, it shows only the count:
  without system balances there is no discrepancy to compute.
- Filters for discrepancies, shortages or overages, sorted by the largest
  discrepancy (by size, shortage or overage), by name or by code.
- Every quantity carries its unit. Fractional units (kg, L, m) always use
  three decimals, so "1,288 kg" is never read as one thousand.
- **Excel** with real numbers (not text), difference and status computed
  by formula, filters, a frozen header, dates in local time and a sheet
  with uncounted products.
- **PDF** to file and sign: audit details, summary, a table with shortages
  and overages highlighted, uncounted products, "Page X of Y" and
  signature lines, which never end up alone on a page.
- **CSV** that opens correctly in Brazilian Excel: semicolons, decimal
  comma, proper accents and the audit and company on every row.
- **Printing** with its own A4 layout, always in the light theme, matching
  the PDF.

### Records and access

- Companies, products and users. Products are imported from an `.xlsx`
  sheet, with a template to download and a preview that points to the
  sheet row of each problem (missing code or name, repeated code, a barcode
  already used by another product). Only the columns in the sheet are
  written, so an empty cell never erases a unit or a barcode. Products can
  also be copied from another company's catalog.
- Four roles: **supremo** (everything, including deleting audits),
  **administrador** (records, creating and cancelling audits),
  **auditor** (records counts and does the closing) and **visualizador**
  (read only). Everyone changes their own password under Configurações.
- Permissions are enforced by the database, not just the screens: RLS
  policies per role and per company, and nobody can change their own
  access level.
- New users are created through an Edge Function holding the service
  key, which never reaches the browser.

### Interface

- Light and dark themes, following the device until someone picks one.
- On phones, tables become cards and forms open as bottom sheets.
- Keyboard friendly: dialogs trap focus and close with Esc; in dangerous
  actions, focus starts on "Cancelar". After saving, focus goes back to
  the row's button, and moving between screens focuses the new title.
- Unhandled errors are logged in the browser and listed under
  **Configurações**, with a shortcut in the error notice. In the console,
  `errosRegistrados()` lists the 30 most recent in this browser, from
  every page.

## Demo mode

`?demo=1` on any page (or the **Explorar a demonstração** button on the
login page) swaps Supabase for `js/demo.js`, a fake database that mimics
the part of `supabase-js` the app uses: filters, joins, the two report
views and audit numbering. It holds 5 companies, 263 products, 8 audits in
every status and 8 fictional users, always the same. Data lives only in
the open tab; **Configurações › Restaurar dados da demonstração** starts
over, and `?demo=vazio` opens an empty database. A call the fake database
does not know is logged to `errosRegistrados()` instead of failing
silently.

## How it is built

| Part | Technology |
|---|---|
| Interface | HTML, CSS and JavaScript ES modules, no framework, no build |
| Data and login | Supabase (PostgreSQL, Auth) |
| Offline counting | IndexedDB |
| PDF | jsPDF and jsPDF-AutoTable |
| Excel | ExcelJS, to write the reports and to read the product sheet |
| Fonts | IBM Plex Sans and IBM Plex Mono (Google Fonts); IBM Plex Sans embedded in the PDF |
| Tests | `node:test`, PGlite (Postgres in WebAssembly) and Playwright |

The PDF and spreadsheet libraries are only downloaded when someone exports
or imports, and the browser checks each one against its hash (SRI) first.

## Database and permissions

[`supabase/schema.sql`](supabase/schema.sql) creates everything the app
uses: tables, the two report views, AUD-YYYY-NNNN numbering (never
repeated, even with two people creating audits at once) and the
`registrar_contagem` function, which adds up a count in a single
transaction. Before it, 20 simultaneous scans of the same product
recorded 2. The app now sends every scan to this function: a test fires
20 at once against the demo database and expects 20, and the check with
two real devices is in the real-world checklist. When two devices count
a product for the first time, the second one gets the add-or-replace
question instead of overwriting the first. Closing an audit is a single
function as well (`finalizar_auditoria`): it saves the system balances and
finishes the audit together, and refuses if someone counted a product the
closing screen was not showing yet.

`schema.sql` can be run again on an existing database: it creates what is
missing, updates functions, triggers and permissions, and deletes no data.

Permissions live in the database: each role only sees its company, an
auditor counts and finishes but cannot cancel, only the supremo deletes,
and triggers stop anyone from promoting themselves or changing a finished
count. [`supabase/testes/permissoes.sql`](supabase/testes/permissoes.sql)
signs in as each role and checks 48 of these rules; it runs in any
project's SQL Editor and deletes what it creates.

## Tests

```bash
npm install
npm test            # unit (Node) and database (PGlite): 56 tests
npm run test:e2e    # end to end in the browser (Playwright): 31 runs
```

- **Unit:** the real `js/` code running on Node against the demo
  database: scan totals, a repeated send applied once, history, quantity
  parsing ("1.234" is one thousand two hundred thirty-four), batched
  import that never erases missing columns, CSV, report numbers,
  closing, user-creation rules.
- **Database:** `schema.sql` and `permissoes.sql` on a real Postgres
  (PGlite), with nothing to install, including running the schema again
  over a database from the previous version.
- **End to end:** keyboard and scanner counting, offline counts that are
  sent when the page is reopened, closing (including a product counted
  on another device meanwhile), exports (the PDF must embed
  the font and every CDN script must carry its hash), spreadsheet import,
  records, focus after saving, tables at tablet widths, keyboard and
  phone: 26 runs at desktop size (one phone-only test is skipped there)
  and 5 on a phone. Every test ends by checking that `errosRegistrados()`
  is empty.

The end-to-end tests use the installed Google Chrome. Without it, run
`npx playwright install chromium` once and then, in PowerShell:

```powershell
$env:PW_CHANNEL='chromium'; npm run test:e2e
```

In bash, `PW_CHANNEL=chromium npm run test:e2e`. With `msedge` instead of
`chromium`, the tests use Edge.

Everything runs on GitHub Actions on every push to `main` and on pull
requests. The checklist for a
test against a real Supabase project is in
[`docs/teste-real.md`](docs/teste-real.md) (in Portuguese).

## Known limitations

- Two people can count the same audit at once, but each one only sees the
  other's records after reloading: there are no real-time updates.
- Camera scanning depends on `BarcodeDetector`, available in Chrome and
  Edge on Android, macOS and ChromeOS. On Windows and iPhone, use a scanner
  or the keyboard.
- `supabase/schema.sql` was rebuilt from what the code uses and validated
  on a local Postgres; for an existing project, compare before applying
  (`docs/teste-real.md` explains how).
- The page number and footer on the printed sheet use `@page` margin
  boxes, which Chrome and Edge support and Firefox does not yet; there the
  sheet prints without that footer. The PDF does not depend on it.
- The Supabase library comes from a CDN through `import()`, which cannot
  be checked by hash; its version is pinned so it never changes silently.
- The Relatórios list shows the 200 most recent finished audits; filter by
  company to reach older ones.
- The interface is Portuguese only.

## Running your own copy

1. Create a [Supabase](https://supabase.com) project and run
   `supabase/schema.sql` in the SQL Editor.
2. In `js/supabaseClient.js`, replace the URL and public key with your
   project's (Supabase › Project Settings › API).
3. Create the first user under Authentication › Users and insert their
   profile into the `usuarios` table with the `supremo` role.
4. Deploy the user-creation function: `supabase functions deploy criar-usuario`.
5. Serve the files over HTTP (ES modules do not load from `file://`):

```bash
npm run servir
```

To just see it working, none of this is needed: open `app.html?demo=1`.

## Structure

```
index.html              redirects to the login or the app
login.html              sign-in, with the demo entry point
app.html                app shell; screens live in js/telas/
contagem.html           counting (?id=)
estoque-sistema.html    closing: system balances (?id=)
relatorios.html         discrepancy report (?id=)
404.html                not-found page
css/style.css           all styling, both themes and the print sheet
js/
  app.js                router for app.html
  telas/                one screen per file (dashboard, audits, counting…)
  ui.js                 layout, dialogs, toasts, formatters
  auth.js               login, session and roles
  supabaseClient.js     Supabase connection (or the demo)
  demo.js               fake database for the demo mode
  erros.js              unhandled-error log
  auditorias.js, contagem.js, produtos.js, empresas.js, relatorios.js
                        data access
  usuarios.js           user creation (Edge Function or a separate client)
  exportacao.js         PDF and Excel
  offline.js            offline counting queue
supabase/
  schema.sql            tables, views, functions and permissions (RLS)
  testes/permissoes.sql checks the permissions by signing in as each role
  functions/criar-usuario/  user-creation Edge Function and its rules
fontes/                 IBM Plex Sans for the PDF (OFL license)
testes/                 unit, database and end-to-end tests
docs/                   README images and the real-world test checklist
```

## License

[MIT](LICENSE). Made by [Alyssom Fernandes](https://github.com/alyssom-fernandes), AFN Systems.
