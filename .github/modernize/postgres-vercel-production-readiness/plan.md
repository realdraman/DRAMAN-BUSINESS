# Implementation Plan: PostgreSQL Persistence and Vercel Production Readiness

**Project**: DRAMAN Loan Services Management System

## Technical Framework

- **Language**: JavaScript (Node.js 20+)
- **Framework**: Existing Node.js HTTP handler; requested Express serverless adapter
- **Build Tool**: npm / Node.js built-in test runner
- **Database**: Local JSON files today; PostgreSQL via `pg` requested
- **Key Dependencies**: No runtime dependencies currently declared

## Overview

Replace instance-local JSON persistence with durable PostgreSQL storage and make the
existing application reliable to deploy on Vercel. Preserve its authentication,
organization/branch tenancy, invitation, support-override, and business API behavior
while enforcing isolation at the database boundary and using secure password
verification. Keep local development and automated tests usable without production
database credentials.

The work is split into the database/authentication change, the Vercel serving and
networking change, then a focused dependency security check.

## Current-State Evidence

- `server.js` persists account and business data in JSON files, uses Node `http`,
  performs password hashing with `scrypt`, and exports a handler while starting a
  listener outside Vercel.
- `schema.sql` already contains tenant keys, RLS policies, and a support-override
  audit table; validate and align it with the runtime queries before relying on it.
- `app.jsx` issues same-origin `/api/...` requests. The server currently emits
  wildcard CORS headers, while `vercel.json` declares the function and bundled
  assets but no explicit rewrites.
- `package.json` has no runtime dependencies. The existing `node:test` suite
  exercises authentication, invitations, tenancy, and support overrides using a
  temporary local data directory.

## Scope and Goals

1. Use PostgreSQL through `pg` and `DATABASE_URL`, with SSL enforced for hosted
   database connections; remove JSON files as the source of truth.
2. Enforce organization and branch boundaries with validated RLS policies and/or
   explicit tenant-scoped SQL, including support's read-only and audited override
   flows.
3. Use bcrypt hash/compare for passwords and redeem invitations atomically so a
   code cannot be consumed by concurrent signups.
4. Provide safe local/test database configuration, `.env.example`, and README
   guidance for hosted PostgreSQL setup.
5. Eliminate production API/network failures by keeping browser calls same-origin,
   configuring Express for Vercel serverless export and local-only listening,
   serving the index/static assets through Vercel routing, and replacing wildcard
   CORS with an explicit credential-safe policy.
6. Add mock/test-pool coverage for database behavior, tenant isolation, password
   verification, invite concurrency/rollback, and support-override audit writes;
   verify local and Vercel-style API/static routing.

## Impact Summary

| Area | Current State | Target State |
|---|---|---|
| Persistence | Process-local JSON files | PostgreSQL with `pg` and TLS |
| Tenancy | Application checks over JSON | RLS and/or strict tenant SQL |
| Passwords | `scrypt` | bcrypt hash and compare |
| Invitations | File-store redemption | Atomic database transaction |
| Hosting | Custom Node handler | Express handler on Vercel |
| Browser API | Same-origin calls; wildcard CORS | Relative calls; explicit CORS |
| Verification | One local-server test suite | Test-pool coverage and deployment smoke tests |

## Execution and Verification Approach

Complete the persistence/authentication task before the Vercel serving task because
both touch the server entry point. Run the existing and new `npm test` suite with a
mock or test pool, verify tenant-crossing reads/writes are rejected, confirm
concurrent invite redemption results in at most one successful registration, and
confirm support override start/write/stop events are durably audited. Validate the
schema and RLS policies against a test database or equivalent policy-level tests.
Finally, check local startup and the Vercel function's index, static-asset, API,
preflight, and cookie behavior. Do not require live hosted credentials in the
automated suite.

## Out of Scope

- Provisioning a hosted database, managing production secrets, or deploying the
  application.
- Replacing the existing session model or introducing an external identity provider.
- Rewriting unrelated frontend or business functionality.

## Open Questions & Questionnaire

No unresolved questions. The requested database, security, Vercel, documentation,
and test scope is specified.
