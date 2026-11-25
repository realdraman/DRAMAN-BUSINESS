# DRAMAN Loan Services Management System

Starter implementation for the DRAMAN Loan Services Management System blueprint.

## What Is Included

- PostgreSQL-backed email sign-in, tenant staff accounts, invitation management, and account updates
- Single-use, role- and branch-bound invitations with active-now or approval-required signup
- Super Admin read-only access with reason-required support overrides and transactional audit records
- Signed session cookies and bcryptjs password hashes
- Organization and branch reads and creation, organization staff listing and approval
- Remembered light/dark appearance preference
- Dashboard with financial cards, repayment charts, recent transactions, due payments, and low-stock alerts
- Customer registration and customer profile table
- Loan issuance form with automatic interest, fee, installment, and balance preview
- Payment recording form with automatic balance update
- Inventory, reports, agreements, and settings screens
- Editable business, loan, security, and staff-menu settings; work-in-progress customer, loan, payment, and product forms resume when switching screens in the same browser tab
- PostgreSQL-backed customer, loan, payment, sales, inventory, branch, dashboard, backup, agreement, and settings routes
- Single-use password-reset tokens with bcrypt password updates and session invalidation
- PostgreSQL schema, startup-provisioned Super Admin, and operator-provisioned tenant administrator

## Run Locally

Install dependencies and configure `DATABASE_URL` and a stable `SESSION_SECRET` of at least 32 bytes. Set `SUPER_ADMIN_EMAIL` and `SUPER_ADMIN_PASSWORD` to provision an active Super Admin automatically when the server starts and no Super Admin exists. The bootstrap password must be 10 to 128 characters. Keep both values in the deployment secret store. Configure password-reset email delivery using an HTTPS `PASSWORD_RESET_EMAIL_WEBHOOK_URL`, its `PASSWORD_RESET_EMAIL_WEBHOOK_SECRET`, and the HTTPS public origin in `PUBLIC_APP_URL`. The webhook must accept a bearer-authenticated JSON request containing `to`, `subject`, `reset_url`, and `expires_in_minutes`, then deliver the link without logging it. Apply `schema.sql` and `seed.sql` using the secure provisioning steps below; the server does not run schema migrations automatically.

```powershell
npm start
```

Then open:

```text
http://localhost:4173
```

Run the authentication and tenant-isolation tests using the test-only mock PostgreSQL pool with:

```powershell
npm test
```

## Deploy on Vercel

`vercel.json` includes the HTML, JSX, CSS, and logo files in the server function bundle. Configure `DATABASE_URL` and `SESSION_SECRET` in Vercel. Configure `SUPER_ADMIN_EMAIL` and `SUPER_ADMIN_PASSWORD` there if the database does not already contain a Super Admin; the first server start creates an active account using bcryptjs and never changes an existing account's password. The connection pool is provided by `db.js`; application data and system backups use PostgreSQL, while the filesystem is used only to serve static app files.

## Secure Initial Provisioning

The seed creates the first tenant administrator with login `admin@draman.local`. If no Super Admin exists, it also creates a fallback platform administrator at `platform-admin@draman.local`. You may instead use the `SUPER_ADMIN_EMAIL` and `SUPER_ADMIN_PASSWORD` startup bootstrap; in that case the seed detects the existing Super Admin and does not create a second one. Seed passwords are never stored in this repository or echoed by prompts; when the SQL seed creates an account, it requires a 16-character password with upper- and lowercase letters, a number, and a symbol, then hashes it with PostgreSQL `pgcrypto` bcrypt. Do not put passwords in shell arguments, SQL files, committed environment files, or terminal transcripts.

From PowerShell, open an interactive session in the directory containing the SQL files:

```powershell
psql "$env:DATABASE_URL"
```

For environment-based bootstrap on a new database, first apply `schema.sql`, then start or deploy the server with `SUPER_ADMIN_EMAIL` and `SUPER_ADMIN_PASSWORD` configured. The startup helper creates the Super Admin before handling requests. Run `seed.sql` afterward to create the first tenant Admin; only its password is needed because the seed detects the existing Super Admin.

For SQL-only provisioning, disable `psql` history, supply two separate passwords, and apply the schema and seed in one session:

```text
\set HISTFILE NUL
\prompt -s 'Initial Super Admin password: ' super_admin_password
\prompt -s 'Initial tenant Admin password: ' tenant_admin_password
SELECT set_config('app.initial_super_admin_password', :'super_admin_password', false) IS NOT NULL AS configured \gset
SELECT set_config('app.initial_tenant_admin_password', :'tenant_admin_password', false) IS NOT NULL AS configured \gset
\unset super_admin_password
\unset tenant_admin_password
\i .\schema.sql
\i .\seed.sql
\q
```

Run provisioning over an approved secure database connection with SQL statement logging disabled for this session; the password values are passed to PostgreSQL only as interactive `psql` variables, are never printed by `\gset`, and are unset before the seed runs. Keep the connection string in the approved secret store rather than shell history. Sign in with each identifier and its separately supplied password, then immediately change both passwords through **Account → Change password** before handing the environment over. Password rotation is mandatory; retain the new credentials only in your approved password manager. The seed is idempotent and will not replace an existing account's password.

## Authentication, Tenants, and Private Data

New users must provide a valid invitation. The invitation fixes the organization, branch, role, and whether approval is required; the user sets their password during signup. Passwords are hashed with bcryptjs. Password-reset tokens are random, single-use, stored only as SHA-256 hashes, and expire after 30 minutes. Forgot-password responses do not disclose whether an email exists. Production reset delivery requires the HTTPS webhook configuration described above; tokens are never returned by production APIs.

Invitation redemption and support-override audit writes use PostgreSQL transactions. Organization Admins can issue and revoke invitations only for their organization. Codes expire after 24 hours, are shown once, and only their SHA-256 hashes are persisted.

Business records are explicitly filtered by `organization_id` in addition to PostgreSQL row-level security. Super Admin accounts can read across organizations but cannot modify tenant data by default. A business-data write requires an active organization-scoped support override and is recorded in `support_override_audit` in the same transaction; the `audit_logs` view exposes those entries. Platform-scoped override is limited to creating an organization and its initial Admin invitation. Super Admins cannot be invited through the tenant invitation flow.

Sessions are signed `HttpOnly`, `SameSite=Lax` cookies (also `Secure` in production), expire according to organization settings, and use the `session_version` column to invalidate old cookies after password changes or resets. Admins can download a consistent PostgreSQL JSON backup for their organization. Super Admin backups contain either the selected support organization or all organizations and omit password hashes, reset tokens, and session secrets. Unknown API paths return HTTP 404.

## Production Path

Remaining production work includes integrating external identity, email delivery, and operational services:

- `client/`: Vite React app with Tailwind CSS, Chart.js, Axios, and lucide-react
- `server/`: Express.js API with JWT, bcrypt, pg, and multer
- `database/`: PostgreSQL migrations and seed scripts based on the root [`schema.sql`](schema.sql)
