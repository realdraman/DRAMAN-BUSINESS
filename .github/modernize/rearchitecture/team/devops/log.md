## [t1] Prepared Node.js environment and recorded PostgreSQL tooling block
- Node 26.13.0 and npm 11.20.0 satisfy the existing `node >=20` package engine.
- PostgreSQL 17.12-2 was discoverable through winget, but installation could not complete due timeout/file-lock errors; `psql` and `pg_isready` remain unavailable.
- No hosted database variables or credentials are configured, and Docker/Podman are absent.
- Existing working-tree modifications were preserved; t1 changed no workspace files.
- Existing `npm test` suite passes: 1 pass, 0 fail.
- Learnings consumed: none

## [t1.1] Remediated PostgreSQL tooling and created a local test database
- PostgreSQL 17.12-2 is installed, the Windows service is running, and `psql`/`pg_isready` work; the bin directory was added to the user PATH.
- An isolated loopback PostgreSQL cluster and `draman_test` database are available on port 55432.
- Applying `schema.sql` is blocked before RLS policy creation by an undefined `employee_id` column; RLS status remains unverified.
- No hosted PostgreSQL credentials or provider availability exist, and Docker/Podman are absent.
- Existing `npm test` passes: 1 pass, 0 fail.
- Existing unrelated workspace modifications remain unchanged.
- Learnings consumed: none

## [t1] Re-verified Node.js 20+ and PostgreSQL tooling environment
- Node.js v26.13.0 and npm 11.20.0 satisfy the Node >=20 engine; PostgreSQL 17.12 binaries, service, and loopback cluster on port 55432 are active.
- `draman_t122` contains 18 forced-RLS relations and 41 RLS policies; upstream tenant and support-audit behavior is verified locally.
- No hosted PostgreSQL variables, provider endpoint, credentials, Docker, or Podman are available.
- Existing workspace modifications were preserved and no application file or commit was created.
- `npm test`: 1 passed, 0 failed.
- Learnings consumed: [devops/postgresql-test-cluster-windows]
