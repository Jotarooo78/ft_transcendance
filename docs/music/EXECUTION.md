# Exécution des parcours musicaux

Branche dédiée : `feat/music-journeys`, issue de `main` à 182c75e.
Répertoire : `/home/ange/common_core/transcendence/music-journeys`.
Les changements personnels de `common_repo` restent dans leur worktree.

Source : [plan Notion](https://app.notion.com/p/3f241a23495481b5a93dfbd600a8d0c4).
Ordre : CAT (11), MED (8), LIB (14), ECO (13). Après chaque sous-action,
appliquer git-sync avant de commencer la suivante. Cette exécution est
autorisée par la demande explicite du 7 octobre 2026 ; la pause pour relecture
du plan initial est levée. Aucun déploiement ni fusion vers main n'est prévu.
Les critères de compréhension restent personnels.

## CAT-1 — Contrat du catalogue

- Produit : [CATALOG_CONTRACT.md](CATALOG_CONTRACT.md).
- Sources inspectées : modèle Prisma, type Track et CatalogPage à 182c75e.
- Le document fixe paramètres, unités, ordre stable, artistes et sorties,
  visibilité, erreurs, recherche littérale et conversion des BigInt.
- Contrôle : correspondance manuelle des champs avec leurs sources ; validation
  syntaxique des deux exemples JSON. Aucune route Catalogue n'existe encore.
- Synchronisation : commit `6e4b54b` publié sur `origin/feat/music-journeys`.
  Pull initial de origin/main : aucun nouveau commit, aucun conflit.
  Authentification rétablie par ange_ssh ; changements personnels préservés.

## CAT-2 — Base isolée

- Configuration et guide créés dans tests/music ; six migrations et permissions
  réutilisées, Catalogue connecté par catalog_runtime, healthcheck /ready.
- Preuves : compose config --quiet et garde Python sur la configuration résolue
  réussis ; up --build --wait catalog-service réussi, six migrations/permissions
  terminées et GET /ready interne répond 200 ready. Routes musicales non produites.
- Documentation Notion liée à CAT-2 pour compose.yml et README.
- Synchronisation CAT-2 : `29ad931` publié ; aucun nouveau commit distant,
  aucun conflit.

## CAT-3 — Fixtures reproductibles

- Seed explicite et transactionnel avec identités stables, garde de collision
  et sérialisation des installations ; aucune initialisation au démarrage.
- Construction Docker/TypeScript réussie. Deux commandes seed:demo et deux
  passages assert-catalog.sql réussis : mêmes trois published, un draft,
  durées de six secondes, crédits et genres. Aucune route HTTP encore prouvée.
- Documentation Notion créée et liée pour seed.ts, package.json et assertions.
- Synchronisation CAT-3 : 85a856f publié, aucun nouveau commit ni conflit.

## CAT-4 — Détail réel

- buildApp sépare le contrat HTTP du lecteur Prisma réel ; DTO public partagé
  dans catalog.ts pour centraliser la conversion des BigInt sans précision perdue.
- Docker et deux tests node:test réussis : champs publics/unités, validation,
  refus, panne injectée, readiness/métriques et fermeture.
- Fetch interne sur PostgreSQL : détail Aube 200 avec artiste/genre/durée,
  draft réellement présent et UUID absent 404, UUID mal formé 400.
- Documentation Notion des cinq fichiers liée à CAT-4.
- Synchronisation CAT-4 : 1a2416f publié, aucun nouveau commit ni conflit.

## CAT-5 — Liste, recherche et pagination

- Liste SQL paramétrée dans catalog-list.ts ; filtre commun liste/count, snapshot
  RepeatableRead, collation C et UUID de départage ; tri global avant pagination.
- Quatre tests du service réussis et vérification réelle de pages 2+1 sur les
  trois tris, total 3, genres, absence du brouillon, recherche littérale %/_ et
  insensible à la casse, recherche absente et page vide. Aucune lecture Media.
- Notes de documentation existantes actualisées et lecteur SQL documenté.
- Synchronisation CAT-5 : 0537b43 publié, aucun nouveau commit ni conflit.

## CAT-6 — Catalogue par HTTPS

- Routage Catalogue identique dans Nginx principal et Nginx de test, résolution
  dynamique Docker et métriques interdites. Pile de développement inchangée.
- Configuration Compose valide ; démarrage sain de Nginx, Auth/Users/frontend
  isolés. Liste/détail HTTPS concordent avec SQL, total 3 ; métriques 403 ;
  nginx -t réussi dans le conteneur de test.
- Documentation Notion du routage et de Compose liée à CAT-6.
- Synchronisation CAT-6 : d6e760d publié, aucun nouveau commit ni conflit.

## CAT-7 — Liste réelle dans l’interface

- Client Catalogue validant les réponses, annulation et clé de requête pour
  ignorer les réponses périmées ; page 1 après recherche/genre/tri.
- Chargement/erreur/vide distincts et retry ; durée inconnue représentée sans
  valeur fictive. Playlists locales conservées jusqu’à LIB.
- Lint/build frontend réussis, frontend de test rechargé. Contrôle Chromium
  réel : inscription/connexion, Aube/Brise puis Clair, recherche absente donnant
  zéro résultat. Script ponctuel /tmp/music-cat7-browser.mjs ; le scénario
  durable complet sera ajouté en CAT-10.
- Documentation Notion des cinq fichiers liée à CAT-7.
- Synchronisation CAT-7 : a9dfd7e publié, aucun nouveau commit ni conflit.

## CAT-8 — Détail dans l’interface

- Route dédiée appelée par getTrack ; panneau distinct remonté par UUID,
  annulation, retry et erreurs locales. Région non modale accessible au clavier,
  Escape ferme puis restaure le focus au bouton d’ouverture.
- Lint/build réussis. Chromium : détail réel, durée six secondes, focus ;
  erreur 404 simulée sans perte de liste puis retry vers le vrai serveur.
  Script ponctuel /tmp/music-cat8-browser.mjs, à intégrer en CAT-10.
- Notes client/page réutilisées et TrackDetails documenté dans Notion.
- Synchronisation CAT-8 : 01c611e publié, aucun nouveau commit ni conflit.

## CAT-9 — Preuves HTTPS/SQL et redémarrages

- Scénario durable borné à 127.0.0.1:3443 : listes/détail, erreurs, champs publics,
  total/pagination, trois tris, recherches littérales et invisibilité du draft.
- catalog puis catalog-edge réussis. Les deux fixtures supplémentaires ont été
  installées/retirées explicitement dans la seule base transcendence_music.
- Catalogue arrêté/redémarré puis DB redémarrée : catalog-verify réussi après
  chaque phase, sans seed supplémentaire. assert-catalog.sql final réussi.
- Aucun redémarrage de Nginx nécessaire, données et UUID conservés.
- Documentation Notion liée à CAT-9 ; cda4a77 publié, aucun nouveau commit ni conflit.

## CAT-10 — Parcours Chromium durable

- Playwright 1.63.0 verrouillé, un worker/zéro retry, URL exacte 3443 ; artefacts
  locaux ignorés, traces et vidéos désactivées.
- npm ci, installation Chromium et scénario catalog réussis (1 test, 5,2 s).
  Le premier essai a identifié un sélecteur getByLabel inadapté aux combobox ;
  remplacé par getByRole avec leur nom accessible, puis scénario entier rejoué.
- Succès réels et identités API comparés au rendu ; erreurs 404/réseau simulées
  suivies de retry réel ; réponse ancienne retardée, nouveau résultat conservé.
- Documentation Notion des tests/config/package/lockfile liée à CAT-10.
- Synchronisation CAT-10 : 366d74a publié, aucun nouveau commit ni conflit.

## CAT-11 — Deux campagnes Catalogue complètes

- Runner gardé créé et syntaxe bash -n validée. Deux exécutions complètes de
  tests/music/run.sh catalog réussies, base neuve puis nettoyage à chaque fois.
- Quatre tests Catalogue, lint/build frontend, six migrations/permissions,
  double seed/SQL, HTTPS/tri, redémarrages et Chromium passent sur chaque run.
  Chromium : 1 test en 5,6 s puis 6,4 s. Journaux locaux :
  /tmp/music-cat11-run1.log et /tmp/music-cat11-run2.log.
- Outils : Node 22.23.2, npm 10.9.8, Docker 29.1.3, Compose 2.40.3,
  Playwright 1.63.0. Base Git 366d74a, runner et README alors modifiés,
  explicitement signalés par la campagne ; les résultats ne prétendent pas
  concerner un commit qui n’existait pas encore.
- Après le second nettoyage, zéro conteneur, volume ou réseau portant le
  label com.docker.compose.project=transcendence_music.
- Promesse CAT prouvée ; audio, Library et Playback restent à réaliser.
- Synchronisation CAT-11 : 49fed22 publié, aucun nouveau commit ni conflit.

## MED-1 — Contrat des octets audio

- MEDIA_CONTRACT.md relie assetId, publication Catalogue, métadonnées et
  stockage privé. Définit GET/HEAD, plages, statuts, timeout, confinement et
  limite du retrait pendant un flux en cours.
- Contrôle documentaire contre schémas/contrat Catalogue réalisé ; format de
  démonstration déterministe précisé. Aucune route Media encore implémentée.
- Synchronisation MED-1 : b1ecd7b publié, aucun apport distant ni conflit.

## MED-2 — Fichiers et volume audio

- Trois WAV PCM mono 16 bits, 8 kHz, six secondes (96 044 octets), associés
  aux UUID Catalogue ; installation explicite avec vérification des collisions.
- Publication du temporaire complet par lien atomique sans remplacement,
  plutôt que rename qui peut écraser une destination concurrente. SQL ready
  est écrit ensuite ; un éventuel fichier orphelin reste privé.
- Build et démarrage isolés Catalogue/Media réussis. Double seed Media réussi,
  octets comparés et empreintes identiques ; assert-media.sql passe.
- Premier essai corrigé : le retour void du verrou PostgreSQL doit être
  converti en texte pour $queryRaw. Les deux seeds validés sont post-correction.
- Volume principal configuré seulement ; aucun seed de développement exécuté.
  Garde du runner étendue aux trois volumes isolés ; bash -n passe.
- Documentation Notion par fichier produite et reliée à MED-2.
