# Structure des services backend

Le code des sept services se trouve dans `backend/services/`. Sa description
complète est dans le guide du backend :

- [backend/docs/CONVENTIONS.md](../backend/docs/CONVENTIONS.md) — notions,
  architecture, anatomie d'un service, trajet d'une requête, routes et points
  d'entrée de chaque service, recettes pour modifier ou ajouter du code ;
- [backend/docs/PRISMA.md](../backend/docs/PRISMA.md) — organisation de la base
  de données, rôles, migrations et usage de Prisma.

| Service | Port | Schéma SQL | Responsabilité |
| --- | --- | --- | --- |
| `auth-service` | 4000 | `auth` | comptes, mots de passe, connexion |
| `user-service` | 4001 | `users` | profils, avatars, amis, présence |
| `catalog-service` | 4002 | `catalog` | morceaux, artistes et sorties publiés |
| `media-service` | 4003 | `media` | envoi, validation, stockage et diffusion des fichiers |
| `library-service` | 4004 | `library` | playlists privées |
| `playback-service` | 4005 | `playback` | sessions d'écoute et historique |
| `chat-service` | 4006 | `chat` | conversations et messages entre amis, temps réel |

Chaque fichier du backend commence par un en-tête `@file` qui dit son rôle, et
chaque fonction porte sa documentation au format Doxygen.
