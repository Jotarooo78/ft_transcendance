# PER — installation neuve et frontières PostgreSQL

`run.sh` reconstruit une database PostgreSQL jetable avec :

- six schémas propriétaires ;
- six rôles de migration et six rôles runtime ;
- les baselines Prisma Auth, Users, Catalog, Media, Library et Playback ;
- les propriétaires et privilèges attendus ;
- des essais DML autorisés, des refus interservices et des contraintes locales.

Lancer depuis la racine du dépôt :

```sh
tests/per/run.sh
```

Le script supprime seulement le projet Compose nommé `transcendence_per` et son
volume jetable. En cas d'échec, il affiche l'état et les logs avant nettoyage.
