# Contexte de build : le dossier backend/, car l'image a besoin de packages/ en plus du service.
FROM docker.io/library/node:22-alpine AS build
WORKDIR /backend

COPY package.json package-lock.json tsconfig.base.json ./
COPY packages ./packages
COPY services/playback-service ./services/playback-service
# Le cache npm est partagé entre les images et verrouillé : une seule installation télécharge à la fois.
RUN --mount=type=cache,target=/root/.npm,sharing=locked npm ci
RUN npm run build:packages

WORKDIR /backend/services/playback-service
RUN npm run build

FROM build AS runtime
# Retire les dépendances de développement ; le code compilé reste en place.
RUN cd /backend && npm prune --omit=dev

ENV NODE_ENV=production
EXPOSE 4005

CMD ["npm", "run", "start"]
