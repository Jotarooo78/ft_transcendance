# user-service

## Rôle

Service propriétaire des profils. Il ne gère ni les identifiants de connexion
ni les mots de passe : `auth-service` authentifie la personne et signe son UUID
dans le claim JWT `sub`.

Port interne : `4001`. Nginx l'expose sous `/api/users/`.

## Architecture

- `src/app.ts` construit l'application Fastify et définit les routes.
- `src/index.ts` raccorde l'application au client Prisma de Users et démarre le
  serveur.
- `src/database/prisma.ts` crée l'instance Prisma unique.
- `prisma/schema.prisma` mappe `Profile` vers `users.profiles`.
- `src/app.test.ts` vérifie le contrat HTTP sans dépendre d'une base active.

Le build génère le client Prisma puis compile TypeScript dans `dist/`.
`npm start` exécute `dist/index.js`.

## Dépendances principales

| Dépendance | Rôle |
|---|---|
| `fastify` | Serveur HTTP et injection utilisée par les tests |
| `@fastify/jwt` | Vérification locale du JWT signé par Auth |
| `@prisma/client`, `@prisma/adapter-pg` | Lecture de `users.profiles` |
| `prom-client` | Métriques du service sur `/metrics` |
| `typescript`, `tsx`, `prisma` | Compilation, développement et génération |

Le service ne dépend plus d'`argon2` ni de l'accès SQL brut : ces responsabilités
appartiennent à Auth ou au client Prisma propriétaire.

## `GET /me`

### Identité utilisée

Le hook appelle `request.jwtVerify()`, puis exige un `sub` au format UUID.
La route n'accepte aucun identifiant de profil depuis le chemin, la query string,
le corps ou un header applicatif.

### Lecture propriétaire

```ts
prisma.profile.findUnique({
  where: { userId },
  select: {
    userId: true,
    displayName: true,
    username: true,
    avatarUrl: true,
  },
});
```

Prisma applique le mapping `Profile.userId -> users.profiles.user_id`. Le
service ne lit ni `auth.accounts`, ni `public.users`.

### DTO

Une réponse réussie contient exactement :

```json
{
  "userId": "11111111-1111-4111-8111-111111111111",
  "displayName": "Léa",
  "username": "lea",
  "avatarUrl": null
}
```

Le handler reconstruit cette forme explicitement. Un champ interne ajouté au
lecteur ou au modèle ne peut donc pas apparaître automatiquement dans la
réponse.

### Erreurs

- `401 { "error": "unauthorized" }` : token absent, invalide ou `sub` non UUID.
- `404 { "error": "profile not found" }` : identité valide sans profil.
- `500 { "error": "internal server error" }` : erreur inattendue journalisée
  côté serveur.

## Vérifications

Depuis `services/user-service` :

```bash
npm run prisma:validate
npm run typecheck
npm test
npm run build
```

Le test SQL
`prisma/tests/pri5/username_conflict.sql` vérifie séparément que la contrainte
unique de `users.profiles.username` refuse un doublon. Ce conflit concerne les
futures écritures de profil ; `GET /me` reste une lecture par clé primaire.
