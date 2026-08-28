# Configuration locale avec `.env`

Cette documentation décrit uniquement la configuration nécessaire au premier
milestone PostgreSQL. Elle sera complétée lorsque Node.js et Prisma auront été
installés et testés dans le projet.

## `.env.example` et `.env`

| Fichier | Rôle | Dans Git ? |
| --- | --- | --- |
| `.env.example` | Modèle commun avec des valeurs fictives | Oui |
| `.env` | Valeurs réellement utilisées sur une machine | Non |

Chaque teammate crée son propre `.env`. Il ne faut jamais y placer les comptes des
utilisateurs de l'application : ce fichier contient seulement la configuration
technique des services.

## Installation sur une nouvelle machine

Depuis la racine du dépôt :

```sh
cp .env.example .env
```

Dans `.env`, remplacer ensuite les deux occurrences de `change_me` par le même mot de
passe local :

```dotenv
DB_USER=transcendence
DB_PASSWORD=mon_mot_de_passe_local
DB_NAME=transcendence
DATABASE_URL=postgresql://transcendence:mon_mot_de_passe_local@db:5432/transcendence?schema=public
```

Le `.env` est ignoré par Git. `.env.example` reste dans Git et ne doit contenir aucun
vrai mot de passe.

cette configuration amène à la création en locale, pour chaque membre de l'équipe de sa propre instance PostgreSQL, contenant une database nommée `transcendence` et un compte technique PostgreSQL également nommé `transcendence`, protégé par le mot de passe défini dans son fichier `.env`.

Ce compte sera utilisé pour le développement en local et permettra, dans un premier temps, à tous les services d’accéder à PostgreSQL. Plus tard, des comptes techniques distincts pourront être créés pour chaque service, par exemple `auth_service`, `user_service`, `catalog_service` ou `playlist_service`. Chacun disposera uniquement des permissions nécessaires sur les tables ou schémas dont son service est responsable.

un compte technique est ici un compte PostgreSQL créé par chaque membre de l’équipe dans sa propre instance locale, afin d’administrer la database et de permettre aux outils et services du projet de s’y connecter ; il ne correspond pas à son compte utilisateur dans l’application.

Même si tous utilisent le nom transcendence, ce sont des comptes indépendants puisqu’ils existent en local,sur chaques ordinateurs des membres de l'équipe, dans des instances PostgreSQL différentes . Plus tard, il existera des comptes exclusivement attribués à chaque service.