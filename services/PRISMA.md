# Prisma dans les services propriétaires

## Principe

Chaque service génère son propre client Prisma. Ce client ne voit que les
modèles du schéma PostgreSQL dont le service est propriétaire.

```text
schema.prisma -> prisma:generate -> TypeScript généré -> build -> client runtime
```

Les six services utilisent Node.js 22, des modules ESM et Prisma `7.10.0`.
Prisma 7 exige l'adaptateur PostgreSQL `@prisma/adapter-pg` au runtime.

## Commandes

Exécuter les commandes depuis le dossier du service concerné.

| Commande | Contexte | Effet |
| --- | --- | --- |
| `npm run prisma:generate` | clone, changement de modèle, build | Génère uniquement le client dans `src/generated/prisma`. |
| `npm run prisma:migrate:dev -- --name <nom>` | développement local | Conçoit et applique une migration sur une base de développement. |
| `npm run prisma:migrate:deploy` | release, CI ou déploiement | Applique uniquement les migrations déjà versionnées. |
| `npm run prisma:smoke` | vérification ciblée | Compile, ouvre une connexion avec le client du service, exécute `SELECT 1`, puis ferme la connexion. |

`npm run build` lance automatiquement `prisma:generate`. Le démarrage normal
d'un service ne lance aucune migration.

## Connexions et permissions

Le code runtime lit `<SERVICE>_DATABASE_URL`, avec `DATABASE_URL` comme solution
temporaire de compatibilité locale. Les configurations de migration lisent
uniquement `<SERVICE>_MIGRATION_DATABASE_URL`.

L'objectif est d'utiliser deux rôles PostgreSQL différents :

- le rôle runtime peut lire et modifier les tables de son service ;
- le rôle de migration peut créer ou modifier la structure de ce schéma.

Les valeurs de `.env.example` utilisent encore le compte local commun tant que
les rôles SQL dédiés ne sont pas provisionnés. La séparation des variables est
donc prête, mais elle ne constitue pas encore une preuve d'isolation SQL.

## Cycle de vie du client

Chaque module `src/database/prisma.ts` crée une seule instance réutilisée par le
processus. Le hook Fastify `onClose` appelle `prisma.$disconnect()`. Le script de
smoke test utilise un bloc `finally` pour fermer la connexion même en cas
d'erreur.

## État des modèles et migrations

- Auth possède le modèle `Account`.
- Users possède le modèle `Profile` et conserve provisoirement l'historique
  PRI-2 qui a créé les tables Auth et Users.
- Catalogue, Media, Library et Playback ont chacun un client et un schéma privé,
  mais aucun modèle métier ni migration initiale n'est inventé dans PRI-3.

Sur une base partagée où PRI-2 a déjà créé `auth.accounts`, marquer d'abord la
baseline Auth comme appliquée, puis déployer les migrations Auth suivantes :

```sh
cd services/auth-service
npx prisma migrate resolve \
  --applied 20260910140100_baseline_auth_accounts \
  --config prisma.migration.config.ts
npm run prisma:migrate:deploy
```

`migrate resolve --applied` enregistre la baseline dans l'historique Auth sans
réexécuter son SQL, puisque la table existe déjà grâce à PRI-2. Cette commande
ne doit être utilisée qu'après avoir vérifié cet état. Sur une base Auth dédiée
et vide, `migrate deploy` peut exécuter la baseline normalement.

Pour les services M1, créer la première migration uniquement après validation
de leurs modèles.

Le paramètre `schema` des URLs doit correspondre au propriétaire indiqué dans
`.env.example`. Les scripts PRI-3 ont été vérifiés sur une base jetable distincte
par service. PRI-6 prouve l'ordre partagé Users, baseline Auth résolue, puis
migrations Auth ; la séparation effective des rôles SQL reste toutefois une
décision distincte.
