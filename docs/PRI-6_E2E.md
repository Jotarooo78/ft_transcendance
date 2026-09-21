# PRI-6 — Preuve de parcours sur base neuve et après redémarrage

## Principe

Le test utilise un projet Docker Compose et un volume réservés à PRI-6. Il ne
réutilise ni les conteneurs `ft_*`, ni le volume PostgreSQL de développement.

Le scénario prouve successivement :

1. la construction de l'état courant depuis une base vide avec les migrations
   Users, la résolution de la baseline Auth déjà matérialisée par PRI-2, puis
   les migrations Auth suivantes ;
2. `signup → login → /me` avec le même UUID ;
3. la conservation du compte et du profil après redémarrage d'Auth et Users ;
4. la conservation des mêmes données après redémarrage de PostgreSQL sans
   suppression du volume ;
5. le refus contrôlé d'un email dupliqué, d'un champ obligatoire absent, d'un
   utilisateur inexistant et d'un username dupliqué ;
6. le passage de la fixture legacy PRI-2 vers le schéma courant sans perte des
   trois lignes représentatives.

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
- PostgreSQL : compte `active`, profil associé, outbox `delivered`, inbox
  présente et état `profile_failed` pour le username dupliqué ;
- legacy : trois lignes dans `public.users`, `auth.accounts` et
  `users.profiles`, valeurs préservées, comptes `active` et aucune commande de
  provisionnement inventée.

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
