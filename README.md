# DRAMAN Loan Services Management System

Starter implementation for the DRAMAN Loan Services Management System blueprint.

## What Is Included

- Email sign-in with private, persistent account records and hashed passwords
- Self-service account requests, administrator approval, password reset, and account email/password changes
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
- Local API server with private, file-backed business and account data
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

`vercel.json` includes the HTML, JSX, CSS, and logo files in the server function bundle so the root route can serve them. The Node request handler is exported for Vercel and starts a listener only for local runs. Redeploy after changing this configuration. Local data files are excluded from Git and Vercel bundles. Vercel writes private data to `/tmp/private-data`; this filesystem is temporary and not shared across instances, so use a managed database and external file storage before relying on deployed data.

## First Run and Private Data

On first run, the app creates a random administrator password and saves it in `first-admin-credentials.txt` inside the private data directory. Sign in with the listed email and password, then change the email and password using **My account**. The one-time credentials file is removed after the administrator signs in. To provision a chosen first-run email and password, place an `admin-credentials.json` file in the private data directory with `email` and `password` fields before starting the app; the app hashes the password and removes that file after provisioning. `DRAMAN_ADMIN_EMAIL` and `DRAMAN_ADMIN_PASSWORD` environment variables are also supported. Existing account stores are never overwritten by these bootstrap settings.

By default, private data is stored outside the project: `%LOCALAPPDATA%\DRAMAN Loan Services` on Windows, `~/Library/Application Support/DRAMAN Loan Services` on macOS, or `${XDG_DATA_HOME:-~/.local/share}/draman-loan-services` on Linux. On Vercel, data is written to `/tmp/private-data`. Override either path with `DRAMAN_DATA_DIR`. Account credentials (salted password hashes), invitations, password-reset tokens, and business/customer records are stored there with private filesystem permissions. `.gitignore` and `.vercelignore` also exclude local credential/data files from publication. Passwords must meet the configured 10-character minimum when users change or reset them; the first-run bootstrap uses the provided password as-is.

Anyone may request an account with a personal email address. Uninvited requests remain pending until an administrator assigns a role and approves them; invitation codes still activate the role they were issued for. Sign-in uses email and password only. Sessions expire after 24 hours by default and survive a local server restart. Forgot-password links expire after one hour and can only be used once.

For local development without an email provider, password-reset instructions are written to the private `password-reset-outbox` directory. For email delivery, set `RESEND_API_KEY`, `DRAMAN_EMAIL_FROM`, and `DRAMAN_PUBLIC_URL` in the server environment. Keep these values out of source control. **System backup** downloads a JSON snapshot of the app data without password hashes or active bearer sessions. Backup schedule settings are saved as preferences and do not run automated backups in this prototype. SMS confirmations open the device's messaging app with a prepared message; a configured SMS gateway is needed for automatic delivery.

The notification menu shows role-appropriate pending approvals, overdue loans, low-stock alerts, and recent activity. System backups require an administrator account and download the current snapshot to the browser's downloads folder.

## Production Path

When npm is available, the next step is to split this prototype into a standard stack:

- `client/`: Vite React app with Tailwind CSS, Chart.js, Axios, and lucide-react
- `server/`: Express.js API with JWT, bcrypt, pg, and multer
- `database/`: PostgreSQL migrations and seed scripts

The database foundation is already in [database/schema.sql](database/schema.sql).
