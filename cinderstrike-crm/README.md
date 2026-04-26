# Cinderstrike CRM

Simple internal CRM for Albany small-business cybersecurity outreach.

## What it includes

- Companies dashboard
- Leads dashboard
- Outreach templates
- Send log
- Resend-ready environment config
- Seed data for initial Albany target categories

## Current status

This first pass is intentionally simple:
- local JSON-backed data in `data/crm.json`
- API send flow wired to Resend
- Resend webhook route included
- optional middleware/API protection via `CRM_ADMIN_KEY`
- small batch send API limited to 10 leads per request

## Next recommended steps

1. Add stronger auth before deployment (current API supports simple admin key auth)
2. Add edit/delete flows for companies, leads, templates
3. Configure Resend webhook route for delivered/bounced/failed events
4. Add batch queue and follow-up workflow
5. Add reply tracking / unsubscribe handling

## Run locally

```bash
npm install
npm run dev
```

## Environment

Copy `.env.example` to `.env.local` and fill in:

- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`
