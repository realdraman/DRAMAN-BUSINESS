# t1 — Node.js and PostgreSQL Environment Re-verification

## Summary

- Node.js `v26.13.0` and npm `11.20.0` are active and satisfy `package.json` engine `node >=20`.
- PostgreSQL 17.12 binaries are installed and resolve to `C:\Program Files\PostgreSQL\17\bin`.
- PostgreSQL Windows service `postgresql-x64-17` is running and the loopback test cluster on port `55432` accepts connections.
- Local databases `draman_t122` and `draman_test` are available.
- Hosted PostgreSQL is unavailable and no hosted/database environment variables are configured.
- RLS inventory is locally verified in `draman_t122`: 18 forced-RLS relations and 41 public RLS policies.
- No application source or configuration file was changed; existing workspace modifications were preserved.

## Exact Changes

- No workspace source, test, schema, environment-template, or other project file was changed.
- No commit was created.
- No hosted credential or database setting was added.
- PostgreSQL `C:\Program Files\PostgreSQL\17\bin` was already present in the Windows user `PATH`; no permanent PATH change was needed.
- `psql` and `pg_isready` resolve in a new shell after explicit environment activation was applied during verification.
- Existing modified and untracked workspace state remained unchanged:
  - Modified: `.gitignore`, `.vercelignore`, `README.md`, `app.jsx`, `package.json`, `schema.sql`, `seed.sql`, `server.js`, `styles.css`
  - Untracked: `.github/`, `test/`

## Toolchain Verification

| Check | Result |
|---|---|
| `node --version` | `v26.13.0` — PASS |
| `npm --version` | `11.20.0` — PASS |
| Package engine | `>=20` — satisfied |
| `psql --version` | `psql (PostgreSQL) 17.12` — PASS |
| PostgreSQL service | `postgresql-x64-17`, state `RUNNING` — PASS |
| `pg_isready -h 127.0.0.1 -p 55432` | `accepting connections` — PASS |
| `pg_isready -h 127.0.0.1 -p 55432 -d draman_t122 -U postgres` | `accepting connections` — PASS |
| PostgreSQL server version | PostgreSQL 17.12, x86_64-windows — PASS |
| Docker | Not found — UNAVAILABLE |
| Podman | Not found — UNAVAILABLE |

Activation for downstream shells:

```powershell
$env:Path="C:\Program Files\PostgreSQL\17\bin;$env:Path"
```

## Hosted PostgreSQL Availability

**Status: UNAVAILABLE / NOT CONFIGURED**

The following process environment variables were unset:

- `DATABASE_URL`
- `POSTGRES_URL`
- `POSTGRES_PRISMA_URL`
- `POSTGRES_URL_NON_POOLING`
- `PGHOST`
- `PGPORT`
- `PGDATABASE`
- `PGUSER`
- `PGPASSWORD`

No hosted provider endpoint, certificate/TLS configuration, pooler setting, or credential was available to verify. Hosting remains an explicit downstream prerequisite for production validation.

## RLS Verification Status

**Status: VERIFIED LOCALLY AGAINST POSTGRESQL 17.12**

| Check | Result |
|---|---|
| Verification database `draman_t122` available | PASS |
| Public relations with `relrowsecurity=t` and `relforcerowsecurity=t` | 18 PASS |
| Public RLS policy rows | 41 present |
| Tenant1 application-role read and tenant isolation | PASS in upstream t1.2.2 verification |
| Cross-tenant customer insert | REJECTED in upstream t1.2.2 verification |
| Tenant support-audit insert | PASS in upstream t1.2.2 verification |
| Cross-tenant support-audit insert | REJECTED in upstream t1.2.2 verification |
| Hosted/provider RLS behavior | NOT VERIFIED |

The current re-verification confirmed the server/database and enforced-RLS inventory. The behavioral tenant/audit checks are inherited from the completed downstream DBA verification, not rerun by this devops task.

## Test Results

- Command: `cmd.exe /d /c "cd /d D:\CODESS && npm test"`
- Passed: 1
- Failed: 0
- Skipped: 0
- Cancelled: 0
- Duration: approximately 1.386 seconds

Additional environment commands:

- `psql --version` — pass
- `pg_isready -h 127.0.0.1 -p 55432 -t 3` — pass
- `pg_isready -h 127.0.0.1 -p 55432 -d draman_t122 -U postgres -t 5` — pass
- `sc.exe query postgresql-x64-17` — running
- Forced-RLS inventory query — 18 relations
- RLS policy inventory query — 41 policies

## Preserved Workspace State

Pre-existing modifications remained intact. Git reported:

```text
 M .gitignore
 M .vercelignore
 M README.md
 M app.jsx
 M package.json
 M schema.sql
 M seed.sql
 M server.js
 M styles.css
?? .github/
?? test/
```

## Risks

- **HIGH / hosted:** No hosted PostgreSQL instance or credentials exist; TLS, provider role ownership, pooler behavior, and hosted RLS behavior remain unverified.
- **MEDIUM / operations:** The test cluster is a loopback trust-authenticated local cluster. It must not receive production credentials or be treated as hosted/database-production evidence.
- **MEDIUM / persistence:** The local cluster is outside the workspace under `C:\temp\draman-pg-test-17` and can depend on workstation/temp-directory persistence.
- **MEDIUM / runtime:** Active Node.js is v26.13.0 while the project only declares `>=20`; downstream pinning should still be evaluated if reproducible CI requires an exact major.
- **MEDIUM / containers:** Docker and Podman are unavailable, so container-based PostgreSQL test provisioning cannot be used in the current environment.
- **LOW / shell:** Some fresh shells may need explicit PostgreSQL PATH activation despite the permanent user PATH.

## Upstream Artifacts Consumed

- `D:\CODESS\.github\modernize\postgres-vercel-production-readiness\plan.md` — target Node 20+, PostgreSQL, hosted/TLS, RLS, and test scope.
- `D:\CODESS\.github\modernize\rearchitecture\artifacts\t1.1-devops.md` — prior tooling/test-cluster findings.
- `D:\CODESS\.github\modernize\rearchitecture\artifacts\t1.2.2-dba.md` — local forced-RLS and cross-tenant behavioral verification.
- `D:\CODESS\.github\modernize\rearchitecture\learnings\devops\postgresql-test-cluster-windows.md` — Windows PostgreSQL test-cluster guidance.

## Evidence Mapping

- Plan technical framework (Node.js 20+) → `node v26.13.0` satisfies `>=20`.
- Plan scope item 4 (safe local/test database) → loopback cluster on `127.0.0.1:55432`, databases `draman_test` and `draman_t122`, explicit activation command.
- Plan execution and RLS scope → 18 forced-RLS relations and 41 RLS policies inventory; upstream cross-tenant and support-audit behavioral checks passed locally.
- Plan hosted scope → no hosted credentials/provider present; hosted status remains unavailable/unverified.
- Board/previous t1 findings → service, binaries, test cluster, and existing npm suite revalidated; no source changes or commits made.

## Test Timing

- Start: `2026-11-23T22:43:00Z` (approximate)
- End: `2026-11-23T22:50:57.0135080Z`
- Duration: approximately 8 minutes
