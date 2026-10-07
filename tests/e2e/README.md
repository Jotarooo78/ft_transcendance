# PCE — preuve du parcours utilisateur

Depuis la racine du dépôt :

```bash
tests/e2e/run.sh
```

La commande reconstruit une base vide, vérifie le parcours via HTTPS, puis supprime
les ressources Docker de cette campagne. Un code de sortie `0` et `PASS ALL`
confirment que les contrôles et le nettoyage ont réussi. Exécuter la commande
deux fois pour vérifier que la seconde campagne ne dépend pas de la première.

## Prérequis

- Bash, Git, Node.js 22 et npm ; Docker Engine accessible et Compose v2 avec `--wait`.
- Port local 2443 disponible ; accès réseau pour les images et dépendances lors
  de leur installation. `E2E_HTTPS_PORT=3443 tests/e2e/run.sh` choisit un autre
  port supérieur à 1024 ; le port de développement 1443 est refusé.
- Bibliothèques système nécessaires à Chromium. Le runner installe le package
  verrouillé Playwright et son navigateur. Si le lancement signale une bibliothèque
  absente, installer les dépendances sur l’hôte selon la documentation officielle :
  `npm exec --prefix tests/e2e -- playwright install --with-deps chromium`.

## Ressources ciblées

Le runner affiche ses cibles avant toute suppression : projet
`transcendence_e2e`, fichier `tests/e2e/compose.yml`, volumes
`transcendence_e2e_e2e_db_data` et `transcendence_e2e_e2e_avatar_data`, ainsi que
le réseau propre au projet. Une campagne précédente de ce projet est supprimée
au démarrage, puis la campagne courante à la sortie, y compris en cas d’échec.
Ne pas lancer deux campagnes simultanément sur ce même projet.

Le Compose ne lit pas le `.env` de développement et ne monte aucun volume externe.
Ses identifiants sont fixes et réservés au test. Les services Auth et Users
utilisent leurs rôles runtime ; les migrations et l’application des permissions
utilisent des rôles distincts. Le port HTTPS est publié uniquement sur la boucle
locale `127.0.0.1`. Le certificat est autosigné et sa vérification est désactivée
uniquement pour les clients de cette preuve.

Les tests et builds des services/frontend s’exécutent dans des conteneurs
temporaires, sans réécrire leurs fichiers sur l’hôte. Le runner installe
`tests/e2e/node_modules`, met Chromium dans le cache utilisateur Playwright et
conserve les éventuels résultats navigateur ignorés par Git. Son petit état API
est privé, sans JWT ni mot de passe, et supprimé dans le nettoyage.

## Contrôles et premier diagnostic

| Phase | Preuve attendue | Première observation en cas d’échec |
| --- | --- | --- |
| guard / configuration | dépôt, Node 22, projet et volumes internes corrects | cibles affichées, port choisi, validation Compose |
| build | images et génération Prisma compilées | premier build ou téléchargement en échec |
| auth-tests / users-tests | contrats des routes et refus contrôlés | assertion du test en échec |
| frontend-lint-build | lint et compilation React | première erreur ESLint ou TypeScript |
| browser-install | Playwright et Chromium installés | accès registre/cache et dépendances système |
| migrations-permissions-readiness | six baselines, permissions, services prêts | service Compose qui échoue ou n’est pas prêt |
| initial | inscription, connexion, UUID, texte, avatar et état SQL | phase `[PCE HTTP]` puis assertion SQL |
| after-services-restart / after-db-restart | mêmes données après redémarrage | readiness, lecture HTTPS, puis état SQL |
| negative-cases | email/username occupés, mauvais mot de passe, JWT absent, MIME refusé | statut attendu et profil inchangé autour du refus |
| browser | gestes UI, rendu, réponses serveur, reload/relogin, succès partiel | première assertion Playwright et capture d’échec |
| cleanup | uniquement les ressources du projet supprimées | erreur Docker de suppression ; absence de `PASS ALL` |

Le résumé conserve les versions Node/npm/Docker/Compose/Playwright et la révision
Git. S’il existe des modifications locales des sources, il indique que cette
révision est leur base committée. Garder le résumé et le code de sortie, sans
recopier les tokens, mots de passe ou journaux réseau complets. Les traces et
vidéos Playwright sont désactivées ; les captures d’échec sont locales.

## Limites et contrôle de la preuve

Le navigateur couvre Chromium et le frontend livré par le serveur Vite. Après
rechargement, la session en mémoire disparaît : le scénario se reconnecte par le
formulaire pour relire les données persistantes. PostgreSQL conserve le profil
et l’URL avatar ; le volume avatar conserve les octets du fichier PNG.

Le succès partiel utilise une vraie sauvegarde du texte, puis une modification
du MIME de la requête sortante pour provoquer un refus réel du serveur. Le
formulaire reste ouvert, affiche le texte confirmé et conserve l’ancien avatar.
Pour contrôler séparément l’oracle de persistance, sur une pile fraîche après
le scénario API initial, lancer `PCE_MUTATION_CHECK=1 npm test --prefix tests/e2e`.
Ce diagnostic doit échouer à `persisted profile after reload` : la réponse
textuelle simulée n’a rien enregistré. Le runner normal désactive ce diagnostic.

Le redémarrage arrête Auth/Users puis les relance sans dépendances, dans l’ordre
inverse de leur démarrage initial. Les adresses Docker peuvent alors changer :
la preuve exige une reprise HTTPS sans redémarrer Nginx. Les configurations E2E
et principale utilisent la résolution dynamique du DNS Docker et des groupes
upstream partagés (Nginx 1.27.3 minimum, image vérifiée 1.27.5). Elles autorisent
3 MiB au niveau de la passerelle pour laisser passer un avatar de 2 MiB avec
son enveloppe multipart ; Users conserve la limite du fichier à 2 MiB.
Références : [résolution Nginx](https://nginx.org/en/docs/http/ngx_http_upstream_module.html)
et [DNS Docker](https://docs.docker.com/engine/network/).

Cette campagne ne prouve pas les services musicaux, la récupération/suppression
de compte, le déploiement, les certificats de production, la réplication ni le
nettoyage des anciens avatars. Les caches et images peuvent être réutilisés ;
la base et les fichiers avatar de chaque campagne sont recréés à vide.
L’ancien [rapport PRI-6](../../docs/PRI-6_E2E.md) conserve ses résultats historiques.
