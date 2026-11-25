# DBA Session Log

## [t1.2] Fixed schema DDL and validated RLS locally
- Added `users.employee_id VARCHAR(32)` to `schema.sql`; this resolved the undefined-column blocker while preserving `UNIQUE (organization_id, employee_id)`.
- Applied the complete schema successfully to PostgreSQL 17 on the local `draman_test` database.
- Verified tenant reads/inserts and support/platform audit policies with a non-superuser test role; cross-tenant customer and audit inserts were rejected.
- `schema.sql` is not idempotent, and RLS is enabled but not forced; table owners/superusers can bypass it.
- Hosted PostgreSQL remains unavailable/not configured.
- Learnings consumed: none (no relevant existing DBA learning found).

## [t1.2.1] Made schema bootstrap rerunnable and forced RLS
- Added a transactional `DROP SCHEMA public CASCADE` bootstrap reset to eliminate rerun conflicts; this is destructive and is not an in-place migration for existing data.
- Added `FORCE ROW LEVEL SECURITY` to all 16 tenant tables plus `organizations` and `support_override_audit` (18 relations total).
- Verified twice-successful clean reruns on PostgreSQL 17.12.
- Verified with a non-superuser table-owner role that owner context without tenant settings sees zero customers; tenant1 app context sees only tenant1.
- Cross-tenant customer and support-audit inserts are rejected; tenant and platform support-audit inserts pass.
- Hosted PostgreSQL remains unavailable/not configured; Docker daemon/tooling is not available in this environment.
- Learnings consumed: dba/postgres-tenant-rls-schema.

## [t1.2.2] Replaced destructive public-schema reset
- Removed `DROP SCHEMA public CASCADE` and replaced it with additive `CREATE TABLE/INDEX IF NOT EXISTS` DDL, guarded constraint/policy creation, and a `schema_migrations` marker.
- Applied the bootstrap twice to `draman_t122`, inserted a preservation probe, re-applied the script, and confirmed the probe remained.
- Confirmed 18 forced-RLS relations; tenant1 read passed, cross-tenant customer insert was rejected.
- `npm test` passed 1/1.
- Hosted PostgreSQL remains unavailable; the local test cluster is not production evidence.
- Learnings consumed: dba/postgres-tenant-rls-schema, devops/postgresql-test-cluster-windows.
