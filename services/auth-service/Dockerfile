# Dockerfile "template" pour un microservice.
# Chaque service (auth, user, game, chat...) a son propre dossier
# sous /services/<nom>/ avec ce même pattern.

FROM docker.io/library/node:22-alpine AS build

WORKDIR /app

COPY package*.json ./

RUN npm ci

COPY . .

RUN npm run build

FROM build AS runtime
RUN npm prune --omit=dev --omit=optional --omit=peer

EXPOSE 4000

CMD ["npm", "run", "start"]
