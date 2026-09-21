# auth-service

## Rôle

Auth est propriétaire des comptes, des mots de passe et de l'émission des JWT.
Il ne crée jamais directement de ligne dans le schéma `users` : il demande à
`user-service` de provisionner le profil avec le même UUID.

Port interne : `4000`. Nginx l'expose sous `/api/auth/`.

## Parcours d'inscription

`POST /signup` attend :

```json
{
  "email": "lea@example.com",
  "password": "password1234",
  "username": "lea",
  "displayName": "Léa"
}
```

Dans une transaction PostgreSQL unique, Auth :

1. crée `auth.accounts` dans l'état `pending_profile` ;
2. crée un message `ProfileProvisionRequested.v1` dans
   `auth.outbox_messages` ;
3. essaie immédiatement d'envoyer ce message à Users.

Si Users confirme la création, le message devient `delivered`, le compte
devient `active` et le signup répond `201`. Si Users est temporairement
indisponible, le signup répond `202 REGISTRATION_PENDING` et le worker rejoue
le message avec un délai progressif. Un compte `pending_profile` ne peut pas
recevoir de JWT.

Un conflit permanent de username ou de profil répond `409` et place le compte
dans l'état explicite `profile_failed`. Un email déjà présent répond également
`409`, grâce à la contrainte unique de la base.

## Contrat interne Auth vers Users

Auth appelle :

```text
PUT http://user-service:4001/internal/profiles/:userId
Authorization: Bearer <INTERNAL_SERVICE_TOKEN>
```

Le corps contient `eventId`, `aggregateId` (l'UUID Auth), la version du contrat,
la date, `username` et `displayName`. L'identifiant stable `eventId` permet à
Users de reconnaître un rejeu. Le timeout HTTP est de trois secondes ; les
erreurs réseau et les réponses non permanentes restent dans l'outbox.

`USER_SERVICE_URL` configure la destination et `INTERNAL_SERVICE_TOKEN` est un
secret technique partagé uniquement entre Auth et Users. La route interne
n'est pas publiée par Nginx.

## Connexion

`POST /login` vérifie le mot de passe avec Argon2 puis regarde l'état du compte :

- `active` : réponse `200` avec un JWT d'une heure ;
- `pending_profile` : réponse `202 REGISTRATION_PENDING` ;
- `profile_failed` : réponse `409 REGISTRATION_FAILED` ;
- identifiants invalides : réponse générique `401`.

Le claim JWT `sub` contient l'UUID commun au compte et au profil.

## Fichiers principaux

- `src/app.ts` : routes HTTP, validation et états du signup/login ;
- `src/database/registration-store.ts` : transaction compte + outbox et
  transitions d'état ;
- `src/http-profile-provisioner.ts` : appel HTTP interne ;
- `src/provisioning.ts` : contrat et classification temporaire/permanente ;
- `src/index.ts` : câblage runtime et worker de rejeu ;
- `src/app.test.ts` : réussite, indisponibilité, rejeu et conflit permanent.

## Vérifications

Depuis `services/auth-service` :

```bash
npm run prisma:validate
npm run typecheck
npm test
npm run build
```

Les migrations ajoutent l'état du compte et l'outbox sans rendre les anciens
comptes inutilisables : les lignes préexistantes sont migrées vers `active`.
