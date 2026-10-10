#!/bin/sh
set -eu

npx prisma migrate deploy --schema apps/api/prisma/schema.prisma
exec node apps/api/dist/main.js
