# Convention : ajouter un nouveau microservice

Chaque service backend suit le même pattern. Pour en ajouter un
(ex: `game-service`), un coéquipier fait :

1. **Créer le dossier** : `services/game-service/`
2. **Copier le Dockerfile template** depuis `services/auth-service/Dockerfile`
   (aucune modification nécessaire si Node.js ; sinon adapter le `FROM`)
3. **Choisir un port interne libre** (ex: 4002, le suivant après auth=4000,
   user=4001) et l'utiliser dans `expose:` du Dockerfile et du compose
4. **Ajouter le bloc service dans `docker-compose.yml`** (copier/adapter le
   bloc `auth-service`)
5. **Ajouter la route dans `nginx/nginx.conf`** :
   ```
   location /api/games/ {
       proxy_pass http://game-service:4002/;
       proxy_set_header Host $host;
       proxy_set_header X-Real-IP $remote_addr;
       proxy_set_header X-Forwarded-Proto https;
   }
   ```
6. **Documenter le service dans le README principal** : responsabilité,
   endpoints exposés, tables DB utilisées.

## Règles à respecter (pour que le module "microservices" soit validé)

- **Une responsabilité unique par service.** Si un service commence à faire
  deux choses distinctes, c'est probablement deux services.
- **Communication entre services en HTTP/REST** (ou message queue si vous
  voulez aller plus loin) — jamais d'accès direct à la DB d'un autre service
  même si l'instance Postgres est physiquement partagée.
- **Chaque service doit pouvoir démarrer indépendamment** (`docker compose up
  auth-service` ne doit pas planter, même sans les autres services — sauf sa
  dépendance directe `db`).
- **Convention d'endpoints cohérente entre services** : décidez ensemble un
  format commun (ex: toujours `GET /health`, `POST /...`, réponses JSON avec
  la même structure d'erreur `{ "error": "..." }`).

## Pour le module devops (Prometheus/Grafana, ELK)

Pensez dès maintenant, dans chaque nouveau service, à :
- exposer un endpoint `GET /health` (retourne `200 OK`) — utile pour le
  module "health check" et pour le monitoring
- exposer un endpoint `GET /metrics` au format Prometheus si possible
  (biblio `prom-client` en Node par exemple)
- logger en JSON structuré sur stdout (pas de logs en texte libre) — ça
  simplifiera énormément l'ingestion dans ELK plus tard

Ça évite de devoir tout retoucher service par service quand j'attaquerai
Prometheus/ELK.
