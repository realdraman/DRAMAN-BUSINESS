# DRAMAN Loan Services Management System

Starter implementation for the DRAMAN Loan Services Management System blueprint.

## What Is Included

- Admin and staff sign-in with unique staff IDs, hashed passwords, and admin-issued invitations
- Admin-only team access screen for issuing single-use, role-specific invitations
- Configurable 24-hour sign-in sessions and batch invitation codes (up to 50 at a time)
- Role-aware notifications and administrator-downloadable system backup snapshots
- Remembered light/dark appearance preference
- Dashboard with financial cards, repayment charts, recent transactions, due payments, and low-stock alerts
- Customer registration and customer profile table
- Loan issuance form with automatic interest, fee, installment, and balance preview
- Payment recording form with automatic balance update
- Inventory, reports, agreements, and settings screens
- Editable business, loan, security, and staff-menu settings; work-in-progress customer, loan, payment, and product forms resume when switching screens in the same browser tab
- Local API server with in-memory demo data
- PostgreSQL schema and seed data for the production database

## Run Locally

The app runs directly on Node.js and does not require installing packages.

```powershell
node server.js
```

Then open:

```text
http://localhost:4173
```

## Deploy on Vercel

`vercel.json` includes the HTML, JSX, CSS, and logo files in the server function bundle so the root route can serve them. Redeploy after changing this configuration. This prototype keeps application data in memory; Vercel may run requests in separate or recycled instances, so use persistent storage before relying on deployed data.

## Demo Accounts

| Account type | Email | Staff ID | Password |
| --- | --- | --- | --- |
| Administrator | admin@draman.co.ke | Not required | admin123 |
| Loan Officer | officer@draman.co.ke | LOAN-001 | admin123 |
| Cashier | cashier@draman.co.ke | CASH-001 | admin123 |
| Inventory Manager | inventory@draman.co.ke | INV-001 | admin123 |

Admins can sign in with `admin@draman.co.ke` and `admin123`, then open **Team Access** to issue one or more single-use invitations. New accounts need an invitation, a unique staff ID by default, and a password that meets the configured minimum length. Invitations are role-specific and expire after 24 hours. Sign-in sessions also expire after 24 hours by default; administrators can adjust that timeout in **Security Settings**. Admin accounts can only be created with an invitation issued by an existing admin.

This starter app keeps business data, accounts, invitations, and settings in memory. Sign-in tokens are stored as hashes in the operating system's temporary `draman-loan-services` folder so a local server restart does not invalidate an unexpired session; set `DRAMAN_DATA_DIR` to a persistent location if needed. Expired sessions still require signing in again. Newly registered accounts, invitations, and settings are lost when the server restarts; use persistent storage and a production identity provider before deploying it. **System backup** downloads a JSON snapshot of the current in-memory data. Backup schedule settings are saved as preferences and do not run automated backups in this prototype. SMS confirmations open the device's messaging app with a prepared message; a configured SMS gateway is needed for automatic delivery.

The notification menu shows role-appropriate pending approvals, overdue loans, low-stock alerts, and recent activity. System backups require an administrator account and download the current snapshot to the browser's downloads folder.

## Production Path

When npm is available, the next step is to split this prototype into a standard stack:

- `client/`: Vite React app with Tailwind CSS, Chart.js, Axios, and lucide-react
- `server/`: Express.js API with JWT, bcrypt, pg, and multer
- `database/`: PostgreSQL migrations and seed scripts

The database foundation is already in [database/schema.sql](database/schema.sql).
