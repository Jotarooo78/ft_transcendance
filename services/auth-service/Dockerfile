# Dockerfile "template" pour un microservice.
# Chaque service (auth, user, game, chat...) a son propre dossier
# sous /services/<nom>/ avec ce même pattern.

FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 4000

CMD ["npm", "run", "start"]
