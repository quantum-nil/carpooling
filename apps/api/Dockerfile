FROM node:22-alpine AS build

WORKDIR /app
COPY package.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm install

COPY . .
RUN npm run db:generate --workspace @carpooling/api
RUN npm run build --workspace @carpooling/api

FROM node:22-alpine AS runtime

ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/prisma ./apps/api/prisma
COPY docker/api-entrypoint.sh ./docker/api-entrypoint.sh
RUN chmod +x ./docker/api-entrypoint.sh

EXPOSE 3001
ENTRYPOINT ["./docker/api-entrypoint.sh"]
