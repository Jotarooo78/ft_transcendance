# Exécution des parcours musicaux

Branche dédiée : `feat/music-journeys`, issue de `main` à 182c75e.
Répertoire : `/home/ange/common_core/transcendence/music-journeys`.
Les changements personnels de `common_repo` restent dans leur worktree.

Source : [plan Notion](https://app.notion.com/p/3f241a23495481b5a93dfbd600a8d0c4).
Ordre : CAT (11), MED (8), LIB (14), ECO (13). Après chaque sous-action,
appliquer git-sync avant de commencer la suivante. Cette exécution est
autorisée par la demande explicite du 7 octobre 2026 ; la pause pour relecture
du plan initial est levée. Aucun déploiement ni fusion vers main n'est prévu.
Les critères de compréhension restent personnels.

## CAT-1 — Contrat du catalogue

- Produit : [CATALOG_CONTRACT.md](CATALOG_CONTRACT.md).
- Sources inspectées : modèle Prisma, type Track et CatalogPage à 182c75e.
- Le document fixe paramètres, unités, ordre stable, artistes et sorties,
  visibilité, erreurs, recherche littérale et conversion des BigInt.
- Contrôle : correspondance manuelle des champs avec leurs sources ; validation
  syntaxique des deux exemples JSON. Aucune route Catalogue n'existe encore.
- Synchronisation : commit `6e4b54b` publié sur `origin/feat/music-journeys`.
  Pull initial de origin/main : aucun nouveau commit, aucun conflit.
  Authentification rétablie par ange_ssh ; changements personnels préservés.

## CAT-2 — Base isolée

- Configuration et guide créés dans tests/music ; six migrations et permissions
  réutilisées, Catalogue connecté par catalog_runtime, healthcheck /ready.
- Preuves : compose config --quiet et garde Python sur la configuration résolue
  réussis ; up --build --wait catalog-service réussi, six migrations/permissions
  terminées et GET /ready interne répond 200 ready. Routes musicales non produites.
- Documentation Notion liée à CAT-2 pour compose.yml et README.
- Synchronisation CAT-2 : `29ad931` publié ; aucun nouveau commit distant,
  aucun conflit.

## CAT-3 — Fixtures reproductibles

- Seed explicite et transactionnel avec identités stables, garde de collision
  et sérialisation des installations ; aucune initialisation au démarrage.
- Construction Docker/TypeScript réussie. Deux commandes seed:demo et deux
  passages assert-catalog.sql réussis : mêmes trois published, un draft,
  durées de six secondes, crédits et genres. Aucune route HTTP encore prouvée.
- Documentation Notion créée et liée pour seed.ts, package.json et assertions.
- Synchronisation CAT-3 : 85a856f publié, aucun nouveau commit ni conflit.

## CAT-4 — Détail réel

- buildApp sépare le contrat HTTP du lecteur Prisma réel ; DTO public partagé
  dans catalog.ts pour centraliser la conversion des BigInt sans précision perdue.
- Docker et deux tests node:test réussis : champs publics/unités, validation,
  refus, panne injectée, readiness/métriques et fermeture.
- Fetch interne sur PostgreSQL : détail Aube 200 avec artiste/genre/durée,
  draft réellement présent et UUID absent 404, UUID mal formé 400.
- Documentation Notion des cinq fichiers liée à CAT-4.
- Synchronisation CAT-4 : 1a2416f publié, aucun nouveau commit ni conflit.

## CAT-5 — Liste, recherche et pagination

- Liste SQL paramétrée dans catalog-list.ts ; filtre commun liste/count, snapshot
  RepeatableRead, collation C et UUID de départage ; tri global avant pagination.
- Quatre tests du service réussis et vérification réelle de pages 2+1 sur les
  trois tris, total 3, genres, absence du brouillon, recherche littérale %/_ et
  insensible à la casse, recherche absente et page vide. Aucune lecture Media.
- Notes de documentation existantes actualisées et lecteur SQL documenté.
- Synchronisation CAT-5 : 0537b43 publié, aucun nouveau commit ni conflit.

## CAT-6 — Catalogue par HTTPS

- Routage Catalogue identique dans Nginx principal et Nginx de test, résolution
  dynamique Docker et métriques interdites. Pile de développement inchangée.
- Configuration Compose valide ; démarrage sain de Nginx, Auth/Users/frontend
  isolés. Liste/détail HTTPS concordent avec SQL, total 3 ; métriques 403 ;
  nginx -t réussi dans le conteneur de test.
- Documentation Notion du routage et de Compose liée à CAT-6.
- Synchronisation à effectuer avant CAT-7.
