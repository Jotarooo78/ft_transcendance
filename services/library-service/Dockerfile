# Construction du service avec les outils de compilation, puis image runtime conservant seulement les dépendances nécessaires.
FROM docker.io/library/node:22-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY prisma ./prisma
COPY prisma.migration.config.ts tsconfig.json ./
COPY src ./src

# Génère le client Prisma puis compile TypeScript ; une erreur interrompt la construction.
RUN npm run build

FROM build AS runtime
# Retire les dépendances de développement du runtime ; ne change pas le code compilé.
RUN npm prune --omit=dev --omit=optional --omit=peer

ENV NODE_ENV=production
EXPOSE 4004

CMD ["npm", "run", "start"]
