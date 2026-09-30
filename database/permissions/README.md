# Rôles et permissions PostgreSQL

La database partagée contient six schémas propriétaires. Chaque schéma possède
un rôle de migration et un rôle runtime :

```text
<service>_migration → propriétaire du schéma et de ses tables
<service>_runtime   → DML du service, sans DDL ni accès aux voisins
```

Ordre d'installation sur une database neuve :

1. `bootstrap-roles.sql` crée les douze rôles et les six schémas ;
2. les six historiques Prisma sont exécutés avec leurs rôles de migration ;
3. `assign-owners.sql` vérifie et réapplique les propriétaires attendus ;
4. `apply-grants.sql` retire les accès implicites et accorde les droits runtime.

Le script `database/init/10-bootstrap-roles.sh` exécute la première étape lors
de l'initialisation d'un volume PostgreSQL neuf. Les mots de passe arrivent par
variables d'environnement et ne sont jamais inscrits dans les fichiers SQL.

Les références entre services sont des UUID logiques. Les clés étrangères SQL
restent à l'intérieur du schéma qui possède les deux tables concernées.

La preuve reproductible se lance avec :

```sh
tests/per/run.sh
```

Elle utilise exclusivement le projet Compose et le volume jetables
`transcendence_per`.
