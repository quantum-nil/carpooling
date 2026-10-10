FROM node:22-alpine AS build

WORKDIR /app
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
COPY package.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm install

COPY . .
RUN npm run build --workspace @carpooling/web

FROM node:22-alpine AS runtime

ENV NODE_ENV=production
WORKDIR /app
COPY package.json ./
COPY apps/web/package.json apps/web/package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/web/.next ./apps/web/.next
COPY --from=build /app/apps/web/public ./apps/web/public

EXPOSE 3000
CMD ["npm", "run", "start", "--workspace", "@carpooling/web"]
