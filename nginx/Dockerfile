FROM nginx:1.27-alpine

# Génère un certificat auto-signé pour le dev/l'évaluation.
# (En prod on utiliserait Let's Encrypt, mais un cert auto-signé
# est accepté pour ce projet 42 tant que la connexion est chiffrée.)
RUN apk add --no-cache openssl && \
    mkdir -p /etc/nginx/certs && \
    openssl req -x509 -nodes -days 365 \
      -newkey rsa:2048 \
      -keyout /etc/nginx/certs/selfsigned.key \
      -out /etc/nginx/certs/selfsigned.crt \
      -subj "/C=FR/ST=IDF/L=Paris/O=42/CN=localhost"

COPY nginx.conf /etc/nginx/nginx.conf

EXPOSE 80 443
