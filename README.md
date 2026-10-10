# Enterprise Carpooling Platform

This repository is a database-backed modular monolith. The frontend is Next.js and TypeScript; the backend is NestJS and TypeScript. PostgreSQL/PostGIS is the authoritative store, while Redis is used for temporary cache, realtime coordination, and BullMQ jobs.

## Prerequisites

- Node.js 22 or newer
- npm 10 or newer
- Docker Desktop with Docker Compose
- Git

## Local setup

From the repository root:

```powershell
npm install
Copy-Item .env.example .env
```

Review `.env` before starting the application. The checked-in `.env.example` contains placeholders only. Never commit `.env`, `apps/api/.env`, production environment files, or provider credentials.

Start local PostgreSQL/PostGIS and Redis:

```powershell
docker compose up -d postgres redis
```

Prepare Prisma:

```powershell
npm run db:generate
npm run db:migrate:deploy --workspace @carpooling/api
```

Available development seed scripts can be run when needed:

```powershell
npm run seed:customers --workspace @carpooling/api
npm run seed:employees --workspace @carpooling/api
npm run seed:vehicles --workspace @carpooling/api
```

Start the frontend and API together:

```powershell
npm run dev
```

The web application is available at `http://localhost:3000`. The API is available at `http://localhost:3001`.

Useful checks:

```powershell
Invoke-WebRequest http://localhost:3001/health
Invoke-WebRequest http://localhost:3001/health/ready
npm run lint
npm run typecheck
npm test
npm run build
```

Frontend-specific tests are available with `npm test --workspace @carpooling/web` and `npm run test:e2e --workspace @carpooling/web`.

## Environment variables

`.env.example` documents all supported variable names. Local development requires PostgreSQL, Redis, API ports, frontend origin, and authentication settings. Google Maps, Razorpay, Resend, Firebase, OpenAI, Exotel, and S3-compatible storage variables are provider-specific and require each developer or deployment environment to supply its own credentials.

Server-only secrets include database credentials, JWT secrets, Google Maps keys, Razorpay secrets, storage keys, OpenAI keys, and calling/email provider credentials. Only `NEXT_PUBLIC_API_URL` is intended for browser exposure.

## Troubleshooting

If Prisma cannot connect:

```powershell
docker compose ps
docker compose logs postgres
npx prisma migrate status --schema apps/api/prisma/schema.prisma
```

Confirm that `DATABASE_URL` uses the published PostgreSQL port from `.env`, and that the database container is healthy. If Redis checks fail, inspect `docker compose logs redis` and confirm that `REDIS_URL` uses the same published port.

Do not delete Docker volumes to resolve an ordinary connection problem. Database reset or volume removal can destroy local data and requires explicit approval.

## Delivered product areas

- Authentication, refresh-token rotation, logout, password reset structure, and backend RBAC.
- Customer, employee/driver, vehicle, document, saved-location, and account management.
- Ride requests, strict ride state transitions, driver location, deterministic matching, driver offers, recurring rides, and Socket.IO ride events.
- Notifications, durable chat, masked calling abstraction, maps abstraction, identity verification abstraction, and S3-compatible document storage abstraction.
- Wallet ledger with idempotent transactional credit/debit/refund operations, Razorpay provider abstraction, payment webhooks, ratings, loyalty, and non-authoritative AI assistance.
- Admin overview, analytics, users, employees/drivers, vehicles, rides, payments, wallet transactions, documents, ratings, and audit logs with pagination and operational actions.
- Customer and employee dashboards with live ride state, booking/history, offers, wallet/payment, ratings, documents, and recurring-ride workflows.

## External integrations

Provider credentials are configuration-only. Tests use mocked providers. Configure Google Maps, Razorpay, Resend, Firebase, OpenAI, Exotel, and S3-compatible settings before enabling those integrations in a deployment. No credentials belong in source control.

## Collaboration workflow

1. Accept the GitHub repository invitation using the account that should contribute.
2. Clone the private repository and enter the project directory.
3. Copy `.env.example` to `.env` and supply local-only values.
4. Run the local setup steps and the complete validation suite.
5. Create a feature branch from `main`, for example `feature/ride-history`.
6. Keep commits focused, run lint/typecheck/tests, and push the branch.
7. Open a pull request into `main`; do not push directly to `main`.

Protect `main` with required pull-request review and passing CI checks. Never force-push shared branches.

## Deployment

Use `docker-compose.production.yml`, a separately managed production environment file, Prisma migrations (`prisma migrate deploy`), and the CI workflows under `.github/workflows`. Never put production secrets in GitHub source files. Back up PostgreSQL, including PostGIS data, before migration or release operations. Redis is disposable state and must not be treated as the business source of truth.

## Security and operational notes

All state-changing API paths validate input and enforce authorization server-side. Payment and wallet changes are transactional and idempotent. Admin user status changes protect the last active administrator. Private documents are accessed through authorized, time-limited URLs. Review the remaining provider configuration and production observability settings before going live.
