
# Carpooling Project Development Rules

## Project architecture

- Frontend: Next.js with TypeScript.
- Backend: NestJS with TypeScript.
- Database: PostgreSQL with PostGIS for geospatial data.
- ORM: Prisma.
- Cache and realtime state: Redis.
- Background jobs: BullMQ.
- Realtime communication: Socket.IO.
- Maps and routing: Google Maps Platform.
- Payments: Razorpay.
- Email: Resend.
- Push notifications: Firebase Cloud Messaging.
- AI: OpenAI API.
- Calling: Exotel.
- Object storage: S3-compatible storage.
- Testing: Jest, Supertest, and Playwright.
- Containers: Docker and Docker Compose.

## Architecture rules

- Use a modular monolith. Do not introduce microservices unless explicitly requested.
- Keep frontend, backend, database, and infrastructure responsibilities separated.
- Keep business logic in backend services, not controllers.
- Do not silently change the architecture.
- Do not proceed into later project phases unless explicitly instructed.

## Engineering and security rules

- Inspect existing files before modifying anything.
- Do not rewrite working code unnecessarily.
- Implement only the requested scope.
- Do not introduce unrelated dependencies.
- Validate all external input.
- Enforce authorization on the backend; never trust frontend role checks as security.
- Never store plaintext passwords. Use secure password hashing.
- Never store secrets in source code. Use environment variables for secrets and configuration.
- Never expose server-only API keys to the browser.
- Do not add placeholder implementations where production behavior is required unless explicitly marked.
- When an external API is unavailable, create a clean provider abstraction instead of coupling business logic directly to the provider.

## Data, payments, and AI rules

- Treat PostgreSQL as the permanent source of truth.
- Use Redis only for temporary, cache, realtime, or queue state.
- Use database transactions when multiple related records must change atomically.
- Make payment and webhook operations idempotent.
- Preserve auditability for financial operations.
- Do not allow AI to directly modify authoritative business state.
- Keep AI as an assistant or recommendation layer.

## Testing and validation

- Add or update tests for important business logic.
- Run lint, typecheck, and relevant tests after meaningful changes.
- Fix errors caused by the implementation before reporting completion.

## Workflow for every task

1. Inspect relevant existing files.
2. Explain the implementation plan briefly.
3. Implement only the requested scope.
4. Update required database, schema, API, and UI files.
5. Add or update tests.
6. Run relevant validation commands.
7. Fix errors caused by the implementation.
8. Report:
   - files changed;
   - functionality implemented;
   - tests run;
   - remaining limitations; and
   - the next recommended step.
