# PRI-6 — Preuve de parcours sur base neuve et après redémarrage

## Principe

Le test utilise un projet Docker Compose et un volume réservés à PRI-6. Il ne
réutilise ni les conteneurs `ft_*`, ni le volume PostgreSQL de développement.

Le scénario prouve successivement :

1. la construction de l'état courant depuis une base vide avec les migrations
   Users, la résolution de la baseline Auth déjà matérialisée par PRI-2, puis
   les migrations Auth suivantes ;
2. `signup → login → /me` avec le même UUID, en partant d'un username saisi
   avec des espaces et des majuscules puis stocké sous sa forme canonique ;
3. la conservation du compte et du profil après redémarrage d'Auth et Users ;
4. la conservation des mêmes données après redémarrage de PostgreSQL sans
   suppression du volume ;
5. le refus contrôlé d'un email dupliqué, d'un champ obligatoire absent, d'un
   utilisateur inexistant, d'un format de username invalide et d'un username
   dupliqué après normalisation ;
6. le passage d'une fixture historique déjà canonique vers le schéma courant,
   sans réécriture des trois usernames ;
7. le refus explicite d'une fixture historique divergente par la précondition
   de la migration no-op ;
8. le rejet d'une écriture SQL directe non canonique par la contrainte
   `profiles_username_canonical_check` ;
9. l'ajout de `bio` comme colonne nullable sans valeur par défaut ni backfill,
   avec une clé `bio: null` toujours présente dans le DTO `/me`.

## Exécution

Depuis la racine du dépôt :

```bash
./tests/pri6/run.sh
```

Le script utilise `set -Eeuo pipefail` : une commande en échec, une variable
absente ou une assertion SQL fausse arrête immédiatement la preuve. Son trap de
sortie affiche les derniers logs utiles en cas d'échec, puis supprime uniquement
les conteneurs, le réseau et le volume du projet `transcendence_pri6`.

## Oracles

- HTTP : statuts, codes métier, forme exacte du DTO et stabilité de l'UUID ;
- PostgreSQL : compte `active`, profil canonique associé, outbox `delivered`,
  inbox présente, contrainte de format et état `profile_failed` pour le
  username dupliqué après normalisation ;
- legacy : trois lignes dans `public.users`, `auth.accounts` et
  `users.profiles`, valeurs canoniques préservées, comptes `active` et aucune
  commande de provisionnement inventée ; la fixture divergente doit être
  bloquée avant la pose de la contrainte.

## Résultats observés — 28 septembre 2026

| Critère | Preuve | Observé | Conclusion |
| --- | --- | --- | --- |
| Contrat Auth | typecheck et tests dans l'image | 6 tests réussis ; ` ALICE_2 ` est provisionné en `alice_2` | validé |
| Contrat Users | typecheck et tests dans l'image | 11 tests réussis ; bio nulle et textuelle couvertes, frontière interne toujours défensive | validé |
| Frontend | lint puis build Vite dans l'image | ESLint sans erreur et build de 37 modules | validé |
| Contrainte PostgreSQL | migration et `username_format.sql` | valeur canonique acceptée, valeur divergente refusée par la contrainte nommée | validé |
| Parcours réel | scénario HTTP initial puis deux redémarrages | saisie ` PRI6_USER `, stockage et lecture `pri6_user`, UUID stable | validé |
| No-op historique | deux bases legacy jetables | fixture canonique préservée à 3/3/3 ; fixture divergente bloquée avec `USERNAME migration blocked` | validé |
| Bio facultative | migration, scénario HTTP et assertions SQL | colonne nullable sur base neuve et legacy ; DTO à cinq clés avec `bio: null` | validé |

La sortie finale observée est :

```text
[PRI-6] PASS: canonical username, nullable bio, restarts, and controlled historical no-op
```

## Résultats observés — 17 septembre 2026

| Critère | Commande | Attendu | Observé | Conclusion |
| --- | --- | --- | --- | --- |
| Qualité Auth | `npm run typecheck`, `npm test` dans l'image de build | code 0 | 4 tests sur 4 réussis | validé |
| Qualité Users | `npm run typecheck`, `npm test` dans l'image de build | code 0 | 8 tests sur 8 réussis | validé |
| Base neuve | `prisma migrate deploy` Users, résolution de baseline, puis deploy Auth | migrations appliquées | 3 migrations Users, baseline Auth et migration outbox acceptées | validé |
| Parcours nominal | client Node `initial` | signup, login et `/me` cohérents | même UUID et DTO à quatre champs | validé |
| Erreurs attendues | client Node puis `assert-state.sql` | refus sans écriture indue | 409 email, 400 champ absent, 401 inconnu, 409 username | validé |
| État SQL | `assert-state.sql` | états cohérents | 2 comptes, 1 profil, 1 outbox livrée, 1 échouée, 1 inbox | validé |
| Redémarrage services | `docker compose restart auth-service user-service` | login et `/me` inchangés | même UUID relu | validé |
| Redémarrage PostgreSQL | `docker compose restart db` sans `down -v` | données conservées | même UUID et mêmes comptes SQL | validé |
| Legacy PRI-2 | fixture, migrations, `verify_after.sql` | aucune perte | 3/3/3 lignes, 0 ID manquant ou inattendu, 0 valeur différente | validé |

Le premier essai a produit `P3005` : Auth ne pouvait pas démarrer son historique
sur le schéma `auth` déjà créé par PRI-2. L'ajout de la baseline
`20260910140100_baseline_auth_accounts`, puis son enregistrement explicite avec
`prisma migrate resolve --applied`, a rendu l'ordre de déploiement reproductible.
Le scénario complet a ensuite terminé avec le code `0` et a supprimé uniquement
le projet Compose `transcendence_pri6`.

## Limites

Le scénario appelle directement Auth et Users sur le réseau Compose. Il ne
prouve donc ni le certificat TLS de Nginx, ni le frontend, ni un déploiement à
plusieurs réplicas. Les credentials présents dans `tests/pri6/compose.yml` sont
des valeurs statiques réservées à cette base jetable et ne doivent jamais être
réutilisés ailleurs.
