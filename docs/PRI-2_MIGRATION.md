# PRI-2 — Migration incrémentale `public.users` vers Auth et Users

## Résultat préparé

La migration `20260910140000_split_auth_accounts_and_user_profiles` réalise
uniquement **expand + backfill + vérification** :

1. elle verrouille la source contre les écritures pendant la transaction ;
2. elle vérifie que chaque ancienne ligne possède le `username` obligatoire ;
3. elle crée `auth.accounts` et `users.profiles` conformément aux modèles Prisma ;
4. elle copie les UUID, hashes et valeurs de profil sans normalisation ; lorsque
   l'ancien `displayName` est `NULL`, elle utilise le `username` selon D02 ;
5. elle vérifie les nombres de lignes et les valeurs associées à chaque UUID ;
6. elle conserve `public.users` pour la comparaison et la récupération.

Le **cutover applicatif** appartient aux actions de raccord Auth/Users. Le retrait
de `public.users` doit être une migration `contract` ultérieure, après preuve que
les nouveaux chemins de lecture et d'écriture fonctionnent.

## Préconditions

- Exécuter d'abord `prisma/tests/pri2/preflight.sql` sur la base concernée.
- Confirmer que `public.users` est la table créée par
  `20260905155209_init` et que cette migration n'a pas été modifiée.
- Arrêter les écritures Auth/Users avant `migrate deploy` et ne les reprendre
  qu'avec le code compatible avec les nouvelles tables.
- Confirmer que les anciens timestamps sans fuseau représentent UTC. La migration
  les convertit explicitement avec `AT TIME ZONE 'UTC'`.
- Confirmer D02 : `username` est obligatoire, non nul et unique. Pour le backfill
  historique seulement, `COALESCE(displayName, username)` fournit le nom affiché
  manquant ; aucune valeur n'est dérivée de l'email.
- Les tables cibles ne doivent pas déjà exister. Leur présence fait échouer la
  migration afin de ne pas accepter un état partiel silencieusement.
- Conserver une sauvegarde adaptée à l'environnement avant une future exécution
  hors base de test. La procédure destructive décrite ci-dessous est réservée aux
  bases `transcendence_pri2_test_*`.

Les collisions après `lower()` sont seulement affichées par le preflight. Elles
ne bloquent pas PRI-2, car la décision retenue ici est de préserver exactement la
casse historique. Toute future normalisation demandera une décision métier et
une migration séparée.

## Fichiers de preuve

- `prisma/tests/pri2/preflight.sql` : inventaire avant migration, en lecture seule.
- `prisma/tests/pri2/legacy_fixture_valid.sql` : trois anciennes lignes valides,
  dont des emails et pseudos qui diffèrent seulement par la casse.
- `prisma/tests/pri2/legacy_fixture_null_display_name.sql` : cas qui prouve le
  fallback d'un `displayName NULL` vers le `username` obligatoire.
- `prisma/tests/pri2/verify_after.sql` : comptages, ensembles d'UUID et comparaison
  `IS DISTINCT FROM` de toutes les valeurs conservées.
- `prisma/tests/pri2/recover_test_database.sql` : retour à l'état legacy, protégé
  par le préfixe obligatoire du nom de la base de test.
- `prisma/tests/pri2/run-prisma-deploy.mjs` : exécute `prisma migrate deploy`
  contre une base jetable explicitement désignée, sans enregistrer de secret.

## Résultats attendus

### Jeu valide

- la migration termine sans erreur ;
- `public.users`, `auth.accounts` et `users.profiles` contiennent le même nombre de
  lignes ;
- les six recherches d'identifiants manquants/inattendus ou de valeurs
  différentes retournent `0` ;
- `Lea@example.test` et `lea@example.test`, ainsi que `Lea` et `lea`, restent
  distincts et conservent leur casse ;
- `public.users` existe toujours avec toutes ses lignes.

### `displayName` nul

- la migration réussit ;
- le `username` est conservé sans changement ;
- `users.profiles.display_name` reçoit la valeur du `username` ;
- la ligne historique reste inchangée dans `public.users`.

## Récupération limitée à la base de test

Après une migration réussie sur une base dédiée dont le nom commence par
`transcendence_pri2_test_`, exécuter :

```sh
psql "$TEST_DATABASE_URL" \
  -v ON_ERROR_STOP=1 \
  -f services/user-service/prisma/tests/pri2/recover_test_database.sql
```

Le garde-fou refuse tout autre nom de base. La procédure supprime seulement les
deux tables cibles, retire la trace PRI-2 éventuelle de `_prisma_migrations` et
conserve `public.users`. Elle sert à répéter le test ; ce n'est pas une procédure
de restauration de production.

Pour une base de test jetable, la récupération la plus forte reste de supprimer
la base entière, de la recréer, puis de rejouer la migration initiale et le jeu
ancien. Cette opération doit elle aussi viser un nom explicite
`transcendence_pri2_test_*`.

## Limites et décisions restantes

- La base locale inspectée avant ce changement contenait zéro utilisateur. Les
  fixtures prouvent le comportement sur des lignes représentatives, pas sur une
  copie d'une base de production.
- La règle D02 transforme seulement un ancien `displayName NULL` en `username`.
  Elle ne normalise pas la casse et ne dérive jamais une valeur depuis l'email.
- La normalisation et l'unicité insensible à la casse des emails/pseudos ne sont
  pas décidées et ne sont donc pas introduites.
- PRI-2 ne sépare pas encore les rôles et permissions PostgreSQL et ne modifie pas
  les routes applicatives.
- Cette migration de transition reste dans le seul historique Prisma actuellement
  exécutable, celui de `user-service`, même si elle crée aussi la première table
  Auth. La mise en place éventuelle d'un historique par propriétaire devra
  baseliner cet état au lieu de recréer `auth.accounts` une seconde fois.

## Vérifications exécutées — 10 septembre 2026

Environnement : PostgreSQL 16 dans `ft_db`, image locale `common_repo_user-service`,
Prisma CLI 7.10.0. Toutes les bases manipulées portaient le préfixe
`transcendence_pri2_test_` ; la base de travail `transcendence` n'a pas reçu la
nouvelle migration.

| Preuve | Résultat observé |
| --- | --- |
| Empreinte SHA-256 de la migration initiale comparée à `HEAD` | identique : `bf9f4a2fa8cd873a0152a1b065c9d834673d87fab7ecebb67f129aec6bf7a09d` |
| `prisma validate` sur les modèles Users et Auth | code 0 pour les deux modèles |
| Migration SQL sur le jeu valide | code 0 ; 3 lignes source, 3 comptes et 3 profils |
| `verify_after.sql` sur le jeu valide | 0 identifiant manquant/inattendu ; 0 valeur différente |
| Migration SQL sur le jeu contenant un `displayName NULL` | code 0 ; source `displayName=NULL`, cible `display_name='null-name'`, identique au `username` |
| Insertion directe d'un profil avec `username NULL` | échec attendu : violation de la contrainte `NOT NULL` |
| `recover_test_database.sql` après migration valide | 3 lignes source conservées ; cibles retirées |
| Nouvelle application après récupération | code 0 ; vérifications à nouveau toutes à 0 |
| `prisma migrate deploy` sur une base vide | les migrations initiale et PRI-2 sont toutes deux marquées terminées |

Le premier essai de récupération a révélé que `_prisma_migrations` n'existe pas
quand les fichiers SQL sont appliqués directement avec `psql`. Le script a été
corrigé pour ne retirer la trace PRI-2 que si cette table existe, puis la
récupération complète a été rejouée avec succès.
