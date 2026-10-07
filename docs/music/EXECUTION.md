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
- Synchronisation : commit/pull/push à effectuer avant CAT-2 ; le rapport
  suivant consignera le résultat et les éventuels apports distants.
