# ft_transcendance

## Configuration locale

Avant de démarrer les conteneurs, créer le fichier `.env` local à partir de
`.env.example`. La procédure complète et le rôle des variables sont décrits dans
[ENVIRONMENT.md](ENVIRONMENT.md).

## 📝 Repartition des modules

### Tiphaine
#### WEB :
- Major: A public API to interact with the database with a secured API key, rate
limiting, documentation, and at least 5 endpoints:
- Minor: A complete notification system for all creation, update, and deletion ac-
tions.

#### ARTCIFICIAL INTELLIGENCE :
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

| Type | Description | Example |
|------|-------------|---------|
| `feat` | Add a new feature | `feat(ai): add RAG pipeline` |
| `fix` | Fix a bug | `fix(web): fix rate limiting` |
| `refactor` | Improve code without changing behavior | `refactor(backend): simplify microservice structure` |
| `docs` | Documentation changes | `docs(web): update API documentation` |
| `test` | Add or modify tests | `test(web): add API authentication tests` |
| `chore` | Maintenance / configuration | `chore: update Docker configuration` |
| `style` | Formatting / code style changes | `style(web): format API routes` |
| `perf` | Performance improvements | `perf(ai): optimize document retrieval` |
| `build` | Build system / dependencies | `build: update backend dependencies` |
| `ci` | CI/CD configuration | `ci: add GitHub Actions workflow` |
