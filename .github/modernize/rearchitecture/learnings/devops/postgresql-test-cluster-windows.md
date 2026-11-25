# PostgreSQL Test Cluster on Windows

Use the installed PostgreSQL 17 bin directory and an isolated loopback cluster for local test-database remediation.

## What Happened

For project DRAMAN and task t1.1, winget reported PostgreSQL 17.12-2 as installed and the Windows service was running, but the bin directory was absent from the current shell PATH. An isolated cluster was initialized under `C:\temp\draman-pg-test-17`, started on port 55432, and database `draman_test` was created. Applying `schema.sql` stopped at an undefined `employee_id` column before RLS policies were created.

## Takeaway

- Verify PostgreSQL with `pg_isready`, not only package/service state.
- Add `C:\Program Files\PostgreSQL\17\bin` to the user PATH and provide an explicit-shell activation command.
- Use an isolated loopback-only trust cluster for test availability; do not treat it as hosted or production infrastructure.
- A successful test database connection does not prove RLS verification; RLS is verified only after the complete schema and policy DDL execute.
- Escalate schema DDL blockers to the DBA role instead of modifying schema in a devops task.

## History
- 2026-11-23 (DRAMAN/t1.1): documented Windows PostgreSQL package, PATH, test-cluster, and RLS-blocker pattern
