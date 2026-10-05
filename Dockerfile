# ponytail: single preview image — split only if cold-start hurts
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/
COPY apps/emr/package.json ./apps/emr/
COPY apps/portal/package.json ./apps/portal/
RUN npm ci
COPY . .
RUN npm run build
FROM node:22-alpine
WORKDIR /app
COPY --from=build /app/apps/api/src ./api/src
COPY --from=build /app/apps/api/package.json ./api/
COPY --from=build /app/apps/emr/dist ./public/emr
COPY --from=build /app/apps/portal/dist ./public/portal
ENV DATABASE_URL=file:/data/asakita.db UPLOADS_DIR=/data/uploads PORT=8787
VOLUME ["/data"]
EXPOSE 8787
CMD ["sh","-c","npm --prefix ./api install --omit=dev && node ./api/src/migrate.js && node ./api/src/seed.js; node ./api/src/index.js"]
