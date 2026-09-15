FROM docker.io/library/node:22-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY prisma ./prisma
COPY prisma.migration.config.ts tsconfig.json ./
COPY src ./src

RUN npm run build

FROM build AS runtime
RUN npm prune --omit=dev --omit=optional --omit=peer

ENV NODE_ENV=production
EXPOSE 4002

CMD ["npm", "run", "start"]
