# PostgreSQL Tenant RLS Schema

Tenant identifiers and tenant RLS policies must be represented consistently in PostgreSQL schema and runtime data.

## What Happened

While applying `schema.sql` to PostgreSQL 17 for t1.2, the users table referenced `employee_id` in a unique constraint before the column existed. The runtime already uses `employee_id`, so the DDL mismatch was resolved by adding `employee_id VARCHAR(32)` to the users table while retaining the organization-scoped uniqueness constraint.

## Takeaway

Use tenant-keyed columns in DDL exactly as runtime code and invitation/registration data expect them. Verify RLS with a non-superuser role and explicit `app.organization_id`, `app.global_read_only`, `app.support_override`, and `app.platform_override` settings. Keep table owners and superusers separate from application database roles when RLS is intended to enforce isolation.

For bootstrap scripts, a clean-schema reset makes reruns deterministic but is destructive. If preserving existing data is required, replace the reset with true in-place migration primitives and do not claim the script is a safe migration. Force RLS on every tenant and audit relation, not only enabling it, so non-superuser table owners cannot bypass policies.

For rerunnable PostgreSQL bootstraps, use `IF EXISTS`/`IF NOT EXISTS` DDL and constraint/policy existence checks rather than `DROP SCHEMA ... CASCADE`. Record the initial migration in `schema_migrations`, but never use a schema reset as the rerun mechanism.

## History

- 2026-11-24 (postgres-vercel-production-readiness/t1.2): initial tenant employee_id DDL fix and local RLS validation.
- 2026-11-24 (postgres-vercel-production-readiness/t1.2.1): made the bootstrap rerunnable, explicitly documented destructive reset semantics, and enforced RLS with FORCE across all tenant/audit relations.
- 2026-11-24 (postgres-vercel-production-readiness/t1.2.2): replaced the public-schema reset with additive/guarded rerunnable DDL while preserving existing rows and continuing to enforce forced RLS.
