# PER — preuve des permissions PostgreSQL

## Objectif

Cette pile prouve quatre frontières :

1. `auth_runtime` accède uniquement aux opérations Auth autorisées ;
2. `users_runtime` accède uniquement aux opérations Users autorisées ;
3. `auth_migration` peut effectuer du DDL dans `auth`, mais pas dans `users` ;
4. `users_migration` peut effectuer du DDL dans `users`, mais pas dans `auth`.

La base PostgreSQL reste partagée. L’isolation repose sur les propriétaires de
schémas et les privilèges, pas sur des bases physiques distinctes.

## Identités utilisées

| Rôle | Usage |
|---|---|
| `per_admin` | bootstrap d’une base neuve uniquement |
| `auth_migration` | propriétaire et migration du schéma `auth` |
| `users_migration` | propriétaire et migration du schéma `users` |
| `auth_runtime` | processus HTTP Auth |
| `users_runtime` | processus HTTP Users |

`per_admin` n’est jamais injecté dans un serveur HTTP.

## Fichiers SQL attendus

Le dossier `database/permissions` doit contenir :

```text
database/permissions/
├── bootstrap-roles.sql
├── assign-owners.sql
└── apply-grants.sql