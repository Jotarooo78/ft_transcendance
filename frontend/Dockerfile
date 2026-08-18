# Placeholder — à adapter une fois le framework frontend choisi
# (React/Vue avec Vite -> ce Dockerfile convient pour le dev server,
#  pour la prod on ajoutera un `npm run build` + un serveur statique
#  comme nginx ou `serve`)

FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 3000

CMD ["npm", "run", "dev", "--", "--host"]
