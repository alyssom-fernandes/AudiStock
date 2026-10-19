# Changelog

Built from the commit history. There are no tags or releases yet, so entries
are grouped by date; the newest come first.

## Unreleased (branch `correcoes-avaliacao`)

- Percentages use one decimal everywhere (dashboard, report, PDF and CSV) through a single formatter, `fmtPct`.
- Users are created only through the `criar-usuario` Edge Function; the browser `signUp` path was removed and the README says open sign-ups must stay off in Supabase.
- The Content Security Policy allows the `@supabase` scope on jsDelivr only for the pinned `supabase-js` version and its exact dependencies.
- PWA: service worker with a versioned cache of the site's files, web manifest with icons, and a test that reopens the counting page offline.
- `testes/capturas.py` regenerates the README screenshots from the demo, and `docs/telas` was regenerated.
- Technical highlights section in the README; this changelog.

## 2026-10-15

- "Tentar de novo" returns to the right screen, the "% of balance" matches the sort order, and the CSP was narrowed.

## 2026-10-14

- Security: Content Security Policy, jsPDF 4.2.1 and fonts served by the site itself.
- The report shows the percentage of the balance; the demo became clearer and stopped jumping.
- Visual refresh: signal orange, label-style numbers, discrepancy ruler, thin bars in the bright orange in the light theme too.
- README with the new look, the demo as the main link and sharing metadata.

## 2026-10-06

- Review rounds: atomic closing, offline queue, re-runnable database, windows without field contention, updated CI and demo fixes.
- Offline counting, database and polish fixes from the verification.

## 2026-10-02

- Database, permissions (RLS), automated tests and safe user creation.
- MIT license.
- README images with the current look.
- Review fixes for counting, offline queue, reports and exports.

## 2026-10-01

- Demo mode and error log.
- Complete polish: new look, rebuilt screens and exports.

## 2026-05-20 and before

- First versions of the system, uploaded on 2026-05-08 and updated on 2026-05-20.
