# ft_transcendance

## Configuration locale

Avant de démarrer les conteneurs, créer le fichier `.env` local à partir de
`.env.example`. La procédure complète et le rôle des variables sont décrits dans
[ENVIRONMENT.md](ENVIRONMENT.md).

## Services backend M1

Chaque domaine propriétaire est déployé dans son propre conteneur :

| Service            | Port interne | Responsabilité                            |
| ------------------ | ------------ | ----------------------------------------- |
| `auth-service`     | 4000         | Identité et authentification              |
| `user-service`     | 4001         | Profils utilisateurs                      |
| `catalog-service`  | 4002         | Artistes, morceaux, crédits et sorties    |
| `media-service`    | 4003         | Upload, validation et stockage des médias |
| `library-service`  | 4004         | Playlists, occurrences et favoris         |
| `playback-service` | 4005         | Sessions et progression d'écoute          |

Les clients et commandes Prisma sont documentés dans
[services/PRISMA.md](services/PRISMA.md). Les modèles M1 ne sont pas encore
figés : les nouveaux schémas Prisma matérialisent seulement leurs frontières de
propriété.

Le rôle de chaque fichier présent dans ces dossiers est résumé dans
[docs/STRUCTURE_SERVICES.md](docs/STRUCTURE_SERVICES.md).

## 📝 Repartition des modules

### Tiphaine

#### USER MANAGEMENT :

- Major: Standard user management and authentication.

#### WEB : (to be confirmed)

- Major: A public API to interact with the database with a secured API key, rate
  limiting, documentation, and at least 5 endpoints:
- Minor: A complete notification system for all creation, update, and deletion ac-
  tions.

#### ARTCIFICIAL INTELLIGENCE : (to be confirmed)

- Major: Implement a complete RAG (Retrieval-Augmented Generation) system.
- Major: Implement a complete LLM system interface.

#### DATA AND ANALYTICS :

- Major: Advanced analytics dashboard with data visualization.

### Emile

#### DATABASE :

- Creation et configuration du container PostgreSQL

### Armand

#### DEVOPS

- Major: Backend as microservices.
- Major: Monitoring system with Prometheus and Grafana.
- Minor: Health check and status page system with automated backups and disaster
  recovery procedures.

## 📝 Git Commit Convention

To keep the project history clean and consistent, we use the following commit naming convention:

```text
<type>(<module>): <description>
```

### 🏷️ Commit Types

| Type       | Description                            | Example                                              |
| ---------- | -------------------------------------- | ---------------------------------------------------- |
| `feat`     | Add a new feature                      | `feat(ai): add RAG pipeline`                         |
| `fix`      | Fix a bug                              | `fix(web): fix rate limiting`                        |
| `refactor` | Improve code without changing behavior | `refactor(backend): simplify microservice structure` |
| `docs`     | Documentation changes                  | `docs(web): update API documentation`                |
| `test`     | Add or modify tests                    | `test(web): add API authentication tests`            |
| `chore`    | Maintenance / configuration            | `chore: update Docker configuration`                 |
| `style`    | Formatting / code style changes        | `style(web): format API routes`                      |
| `perf`     | Performance improvements               | `perf(ai): optimize document retrieval`              |
| `build`    | Build system / dependencies            | `build: update backend dependencies`                 |
| `ci`       | CI/CD configuration                    | `ci: add GitHub Actions workflow`                    |
