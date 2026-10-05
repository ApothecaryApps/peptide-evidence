# Peptide Evidence (working title)

Privacy-first registry for user-reported peptide outcomes, plus independent lot-potency reports.

v0.1 runs entirely in the browser (`localStorage`) so the core loop works before a shared database is connected.

## What works now

- Generate or return with a user number (`PE-`, `MD-`, `LAB-`, `ADM-`)
- Log a protocol (peptide, diagnosis, dose, measurements, labs, side effects, rating)
- See only your own entries
- See anonymized registry totals (no user IDs)
- Lot board: lab, vendor, peptide/blend, method, pass/fail + %, notes, submitter
- Labs or participants can file; user-paid COAs stay caveated until documents are checked
- Public outbound library (Holyfield Rumble/site, Bachmeyer, Froese, Mars, PubMed) — no Skool copies

## Run locally

```bash
npm install
npm run dev
```

## Deploy

Push this folder to GitHub and import the repo in Vercel. No environment variables required for v0.1.

## Next

1. Connect Supabase with real row-level security (not `using (true)`).
2. Split public aggregate views from private protocol rows.
3. Lab verification workflow (partner lab vs open submission).
4. Document-check workflow for user-paid COAs.
5. Lock the product name.

See `schema.sql` for the intended cloud tables.
