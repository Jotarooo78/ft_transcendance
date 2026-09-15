# Structure des services M1

Les services suivent volontairement le même modèle : chaque dossier contient
ce qu'il faut pour installer, compiler, conteneuriser et connecter un service à
PostgreSQL. On retrouve donc souvent les mêmes fichiers ; seuls le métier, le
port et le schéma de base de données changent.

## Fichiers communs

Ces fichiers ont le même rôle dans les six services :

| Fichier | Rôle |
| --- | --- |
| `.dockerignore` | Exclut de l'image Docker les dépendances et fichiers générés. |
| `Dockerfile` | Décrit la construction et le démarrage du conteneur. |
| `package.json` | Déclare les dépendances et les commandes npm du service. |
| `package-lock.json` | Verrouille les versions exactes des dépendances npm. |
| `tsconfig.json` | Configure la compilation et les contrôles TypeScript. |
| `prisma.migration.config.ts` | Configure Prisma pour exécuter les migrations. |
| `prisma/schema.prisma` | Déclare le schéma et les modèles possédés par le service. |
| `prisma/migrations/migration_lock.toml` | Verrouille PostgreSQL comme moteur des migrations. |
| `src/database/prisma.ts` | Crée et exporte le client Prisma du service. |
| `src/database/prisma.smoke.ts` | Vérifie simplement que Prisma peut joindre PostgreSQL. |

Les dossiers suivants peuvent aussi apparaître localement, mais ils sont
générés et ne sont pas versionnés :

| Dossier | Rôle |
| --- | --- |
| `node_modules/` | Dépendances installées par npm. |
| `dist/` | JavaScript produit par la compilation TypeScript. |
| `src/generated/prisma/` | Client généré depuis `schema.prisma`. |

## Santé, disponibilité et métriques

Tous les services exposent les trois mêmes routes techniques :

| Route | Signification | Réponse attendue |
| --- | --- | --- |
| `GET /health` | Le processus HTTP fonctionne. | `200` avec `status: "ok"`. |
| `GET /ready` | Le service est prêt à travailler. | `200` s'il est prêt, sinon `503`. |
| `GET /metrics` | Fournit les mesures destinées à Prometheus. | Texte au format Prometheus. |

### `/health` : le service est vivant

Cette route répond sans interroger PostgreSQL. Elle permet de distinguer un
service arrêté d'un service démarré mais incapable d'utiliser sa base.

```ts
app.get("/health", async () => ({ status: "ok", service: "catalog-service" }));
```

### `/ready` : le service est disponible

`auth-service`, `catalog-service`, `media-service`, `library-service` et
`playback-service` exécutent une requête `SELECT 1` vers PostgreSQL. Ils
répondent `503 not-ready` si la connexion échoue.

```ts
try {
  await prisma.$queryRaw`SELECT 1`;
  return { status: "ready", service: "catalog-service" };
} catch {
  reply.code(503);
  return { status: "not-ready", service: "catalog-service" };
}
```

Exception actuelle : la route `/ready` de `user-service` répond toujours
`ready` et ne teste pas encore PostgreSQL.

### `/metrics` : le service est mesurable

Chaque service collecte les métriques Node.js par défaut, comme l'utilisation
du processeur, de la mémoire et de la boucle d'événements. Leur nom porte un
préfixe propre au service.

```ts
client.collectDefaultMetrics({ prefix: "catalog_service_" });
```

`auth-service` et `user-service` mesurent aussi la durée des requêtes HTTP.
Cette mesure n'est pas encore présente dans les quatre nouveaux services.

Prometheus récupère la route `/metrics` de chaque service toutes les
15 secondes, selon `monitoring/prometheus/prometheus.yml`.

### Comportement dans Docker

Les services utilisent `restart: unless-stopped` : Docker les redémarre après
une erreur ou un redémarrage de Docker, sauf s'ils ont été arrêtés
volontairement. Les services dépendants de PostgreSQL attendent aussi que le
conteneur `db` soit déclaré sain avant de démarrer.

Les routes `/health` et `/ready` existent, mais aucun `healthcheck` Docker ne
les appelle encore automatiquement.

## `auth-service`

Service d'authentification, sur le port `4000`, propriétaire du schéma `auth`.

Il contient tous les [fichiers communs](#fichiers-communs), avec ces fichiers
ou particularités supplémentaires :

| Fichier | Rôle |
| --- | --- |
| `index.js` | Point d'entrée HTTP : inscription, connexion, vérification JWT, santé et métriques. |
| `auth-service.md` | Documentation détaillée du service d'authentification. |
| `prisma/schema.prisma` | Contient actuellement le modèle `Account`. |

Il n'a pas encore de migration SQL propre, seulement le verrou de migrations.

## `user-service`

Service des profils utilisateurs, sur le port `4001`, propriétaire du schéma
`users`.

Il contient tous les [fichiers communs](#fichiers-communs), avec ces fichiers
ou particularités supplémentaires :

| Fichier | Rôle |
| --- | --- |
| `index.js` | Point d'entrée HTTP : profil courant, vérification JWT, santé et métriques. |
| `user-service.md` | Documentation détaillée du service utilisateur. |
| `tsconfig.md` | Explication de sa configuration TypeScript. |
| `prisma/schema.prisma` | Contient actuellement le modèle `Profile`. |
| `prisma/migrations/20260905155209_init/migration.sql` | Crée l'ancienne table commune `public.users`. |
| `prisma/migrations/20260910140000_split_auth_accounts_and_user_profiles/migration.sql` | Sépare les comptes d'authentification et les profils utilisateurs. |
| `prisma/tests/pri2/legacy_fixture_valid.sql` | Ajoute des données historiques valides pour tester la migration. |
| `prisma/tests/pri2/legacy_fixture_null_display_name.sql` | Teste un ancien profil sans nom d'affichage. |
| `prisma/tests/pri2/preflight.sql` | Vérifie la base avant la migration PRI-2. |
| `prisma/tests/pri2/verify_after.sql` | Vérifie le résultat après la migration PRI-2. |
| `prisma/tests/pri2/recover_test_database.sql` | Remet une base de test PRI-2 dans son état initial. |
| `prisma/tests/pri2/run-prisma-deploy.mjs` | Lance les migrations sur une base de test dédiée. |

## `catalog-service`

Service du catalogue musical, sur le port `4002`, propriétaire du schéma
`catalog`.

Il contient les [fichiers communs](#fichiers-communs), plus :

| Fichier | Rôle |
| --- | --- |
| `src/index.ts` | Point d'entrée HTTP minimal : santé, disponibilité et métriques. |

Ses modèles métier et ses migrations seront ajoutés dans une action M1 dédiée.

## `media-service`

Service des fichiers médias, sur le port `4003`, propriétaire du schéma
`media`.

Il contient les [fichiers communs](#fichiers-communs), plus :

| Fichier | Rôle |
| --- | --- |
| `src/index.ts` | Point d'entrée HTTP minimal : santé, disponibilité et métriques. |

Ses modèles métier et ses migrations seront ajoutés dans une action M1 dédiée.

## `library-service`

Service des bibliothèques, playlists et favoris, sur le port `4004`,
propriétaire du schéma `library`.

Il contient les [fichiers communs](#fichiers-communs), plus :

| Fichier | Rôle |
| --- | --- |
| `src/index.ts` | Point d'entrée HTTP minimal : santé, disponibilité et métriques. |

Ses modèles métier et ses migrations seront ajoutés dans une action M1 dédiée.

## `playback-service`

Service des sessions et progressions d'écoute, sur le port `4005`, propriétaire
du schéma `playback`.

Il contient les [fichiers communs](#fichiers-communs), plus :

| Fichier | Rôle |
| --- | --- |
| `src/index.ts` | Point d'entrée HTTP minimal : santé, disponibilité et métriques. |

Ses modèles métier et ses migrations seront ajoutés dans une action M1 dédiée.

## Différence actuelle en une phrase

`auth-service` et `user-service` contiennent déjà du code métier et un
historique de migration ; `catalog-service`, `media-service`,
`library-service` et `playback-service` sont encore des squelettes techniques
prêts à recevoir leur métier M1.
