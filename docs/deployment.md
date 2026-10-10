# Production deployment

This project is a modular monolith with one NestJS API, one Next.js web application, PostgreSQL/PostGIS, Redis, BullMQ workers hosted in the API process, and S3-compatible object storage.

## Required files and secrets

Copy `.env.example` to an untracked `.env.production` and replace every `replace-with-*` value. Never commit `.env.production`, provider credentials, database dumps, or generated certificates. The repository ignores `.env.*` except `.env.example`.

Production-only connection values should use container/service names:

```text
DATABASE_URL=postgresql://USER:PASSWORD@postgres:5432/DB?schema=public
REDIS_URL=redis://:REDIS_PASSWORD@redis:6379
FRONTEND_ORIGIN=https://app.example.com
NEXT_PUBLIC_API_URL=https://api.example.com
```

`NEXT_PUBLIC_API_URL` is embedded into the browser bundle at web build time. It is not a server secret. All other provider keys remain API-only.

## Build and run

Build from the repository root:

```bash
docker build -f apps/api/Dockerfile -t carpooling-api:production .
docker build --build-arg NEXT_PUBLIC_API_URL=https://api.example.com \
  -f apps/web/Dockerfile -t carpooling-web:production .
```

The production compose file expects `.env.production` and runs PostgreSQL migrations before starting the API:

```bash
docker compose --env-file .env.production -f docker-compose.production.yml up -d
docker compose --env-file .env.production -f docker-compose.production.yml ps
```

The API image runs `prisma migrate deploy` at startup. Migrations are forward-only deployment artifacts and must be reviewed for lock duration and backward compatibility before release. Do not use `prisma db push` in production.

## Health checks

- `/health` is a liveness endpoint and confirms that the Node process responds.
- `/health/ready` checks PostgreSQL and Redis and returns `503` when either dependency is unavailable.

The production compose health checks use readiness for the API and prevent the web container from starting before the API is ready.

## Logging and error monitoring

NestJS logs are emitted to stdout/stderr for container collection. Production compose rotates Docker JSON logs at 10 MB × 5 files per service. Ship those streams to the platform log service; do not log tokens, cookies, request bodies, provider secrets, or private document URLs.

Configure an external error-monitoring service at the platform level for API and web containers. Capture release/version, route, status, and correlation information while scrubbing authentication and payment data. No monitoring credential is stored in this repository.

## Backups and recovery

- Use managed PostgreSQL/PostGIS point-in-time recovery plus daily encrypted snapshots where available.
- Store encrypted backups outside the database host and test restoration regularly.
- The optional `docker/backup-postgres.sh` creates a compressed custom-format dump and removes files older than `BACKUP_RETENTION_DAYS`.
- Redis is cache, queue, and realtime state. Enable AOF as configured, but do not treat Redis as the authoritative business database. Rebuild transient cache state after recovery.
- S3-compatible document storage must have versioning, encryption, restricted bucket access, and lifecycle/backup policies enabled at the provider.

## Release sequence

1. Build and test immutable API and web images in CI.
2. Back up PostgreSQL and verify the target image/configuration.
3. Deploy the API image; its entrypoint runs `prisma migrate deploy`.
4. Wait for `/health/ready`.
5. Deploy the web image and verify the configured API origin.
6. Run smoke checks for authentication, ride request, offer acceptance, payment webhook, and document access.
7. Monitor error rate, database saturation, Redis health, queue failures, and migration duration.

Rollback application images only when migrations are backward compatible. For destructive schema changes, use an expand/migrate/contract release sequence and a tested restore plan.
