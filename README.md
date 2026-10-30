# DRAMAN Loan Services Management System

Starter implementation for the DRAMAN Loan Services Management System blueprint.

## What Is Included

- Login screen with demo roles
- Dashboard with financial cards, repayment charts, recent transactions, due payments, and low-stock alerts
- Customer registration and customer profile table
- Loan issuance form with automatic interest, fee, installment, and balance preview
- Payment recording form with automatic balance update
- Inventory, reports, agreements, and settings screens
- Local API server with in-memory demo data
- PostgreSQL schema and seed data for the production database

## Run Locally

This workspace currently has Node available, but `npm` is not on PATH. The app is therefore built to run immediately without installing packages.

```powershell
node server.js
```

Then open:

```text
http://localhost:4173
```

## Demo Accounts

| Role | Email | Password |
| --- | --- | --- |
| Charles Muhoni (Super Admin) | admin@draman.co.ke | admin123 |
| Loan Officer | officer@draman.co.ke | admin123 |
| Cashier | cashier@draman.co.ke | admin123 |
| Inventory Manager | inventory@draman.co.ke | admin123 |

## Production Path

When npm is available, the next step is to split this prototype into a standard stack:

- `client/`: Vite React app with Tailwind CSS, Chart.js, Axios, and lucide-react
- `server/`: Express.js API with JWT, bcrypt, pg, and multer
- `database/`: PostgreSQL migrations and seed scripts

The database foundation is already in [database/schema.sql](database/schema.sql).
