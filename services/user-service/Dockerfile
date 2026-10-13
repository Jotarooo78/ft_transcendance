# Dockerfile "template" pour un microservice.
# Chaque service (auth, user, game, chat...) a son propre dossier
# sous /services/<nom>/ avec ce même pattern.

FROM docker.io/library/node:22-alpine AS build

WORKDIR /app

COPY package*.json ./

RUN npm ci

COPY . .

# Génère le client Prisma puis compile TypeScript ; une erreur interrompt la construction.
RUN npm run build

FROM build AS runtime
# Retire les dépendances de développement du runtime ; ne change pas le code compilé.
RUN npm prune --omit=dev --omit=optional --omit=peer

EXPOSE 4001

CMD ["npm", "run", "start"]
