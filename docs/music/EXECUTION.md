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
- Synchronisation MED-2 : 76bb210 publié, aucun apport distant ni conflit.

## MED-3 — Lecture complète autorisée

- Media sépare application et dépendances ; ouvre un fichier régulier validé
  sans suivre de symlink, diffuse son descripteur et le ferme à l’abandon.
- Catalogue expose un booléen de publication par asset ; client HTTP Media
  borné à deux secondes, sans cache ni lecture SQL interschéma.
- Deux tests Media passent : fichier WAV réel, octets/en-têtes, refus,
  erreurs et vrai serveur HTTP local pour corps invalide/503/timeout.
- Cinq tests Catalogue passent, dont publication minimale et pannes.
  Ce sont des tests de service ; HTTPS et vraie base Media seront prouvés
  en MED-5/7. HEAD et Range restent MED-4.
- Notes Notion par fichier produites et reliées à MED-3.
- Synchronisation MED-3 : 9801f68 publié, aucun apport distant ni conflit.
  La suite Catalogue a fini après ce push ; succès confirmé avant MED-4.

## MED-4 — HEAD et plages

- GET accepte plage fermée, ouverte et suffixe ; bornes inclusives et entiers
  sûrs. 206 contient la portion exacte ; plages invalides/multiples : 416.
- HEAD partage les contrôles, ignore Range et ne crée aucun flux. Une erreur
  HEAD supprime explicitement son corps, correction détectée par le test.
- Trois tests Media passent après correction : octets complets/partiels,
  limites, en-têtes, HEAD autorisé/refusé et client publication HTTP borné.
- Contrat et notes Notion actualisés ; preuve HTTPS à suivre en MED-5.
- Synchronisation MED-4 : bb501ea publié, aucun apport distant ni conflit.

## MED-5 — Audio par HTTPS

- Nginx principal et test routent /api/media/ avec résolution Docker dynamique.
  Media consulte l’origine interne Catalogue explicitement configurée.
- Pile isolée reconstruite, tous services requis sains. curl HEAD public :
  200 audio/wav, Content-Length 96044, no-store et Accept-Ranges bytes.
- GET Range 0-43 public : 206, Content-Range bytes 0-43/96044 ; 44 octets
  vérifiés et signature RIFF. Métriques publiques : 403.
- Aucun seed rejoué : les fichiers de MED-2 ont survécu à la reconstruction.
- ENVIRONMENT.md et notes Notion documentent variables, volumes et seeds.
- Synchronisation MED-5 : 9b4e544 publié, aucun apport distant ni conflit.

## MED-6 — Lecteur et erreur locale

- URL audio réelle sans MIME présumé ; chargement et erreur par événements
  natifs, message de disponibilité sans supposer un autoplay réussi.
- Remontage par UUID dans le composant, y compris pour ses autres usages.
  Fermer/rouvrir permet de réessayer ; changer de piste efface l’ancien état.
- Lint et build frontend passent. Chromium réel via HTTPS : durée 6 s,
  progression > 0,3 s, déplacement à 3 s puis progression > 3,3 s.
- Réponse 404 volontairement simulée : erreur locale affichée ; changement
  de piste puis réouverture après retrait de la panne décodent les vrais WAV.
- Preuve locale : /tmp/music-med6-browser.mjs. Test durable ajouté en MED-8.
  Aucune donnée Playback envoyée avant ECO. Notes Notion actualisées.
- Synchronisation MED-6 : ac82ed7 publié, aucun apport distant ni conflit.

## MED-7 — Octets, refus et redémarrages

- HTTPS réel compare les trois SHA-256 MED-2, tailles, RIFF, HEAD, plages
  fermées/ouvertes/suffixes et limites 416 ; SQL confirme les mêmes empreintes.
- Fixtures distinctes : pending avec fichier, ready retiré avec fichier,
  ready publié sans fichier. GET et HEAD refusent les trois en 404.
- Arrêt réel de Catalogue : Media répond 503. Après retour de Catalogue,
  redémarrage Media puis DB séparément : mêmes empreintes relues sans seed.
- `media`, `media-unavailable`, deux `media-verify` et assert-media.sql passent.
- Fixtures SQL et deux copies de fichiers retirées ; `catalog-verify` passe.
  Les fichiers de démonstration sont conservés pour la preuve navigateur.
- Documentation Notion des contrôles et fixtures reliée à MED-7.
- Synchronisation MED-7 : b8764af publié, aucun apport distant ni conflit.

## MED-8 — Campagne Media complète

- Test navigateur durable media seul : succès en 7,5 s. Puis campagne
  `tests/music/run.sh media` depuis volumes neufs : PASS, cleanup inclus.
- Cinq tests Catalogue, trois Media, lint/build frontend, six migrations et
  permissions, doubles seeds et SQL, HTTPS/empreintes/plages/refus, panne
  Catalogue, redémarrages Catalogue/Media/DB sans seed : tous réussis.
- Chromium : deux scénarios catalog et media réussis en 10,4 s. Décodage,
  progression réelle et seek ; aucune fabrication d’événement de lecture.
- Après nettoyage : zéro conteneur, volume ou réseau transcendence_music.
  La garde couvre trois volumes (DB, audio, avatars), correction documentaire
  du critère Notion qui en mentionnait deux.
- Journal /tmp/music-med8-campaign.log. Base b8764af, sources de MED-8 alors
  modifiées et signalées ; Node 22.23.2, npm 10.9.8, Docker 29.1.3,
  Compose 2.40.3, Playwright 1.63.0. Promesse Media prouvée.
- Runner, navigateur et README documentés dans Notion. Library/Playback
  restent à réaliser ; compréhension personnelle non cochée.
- Synchronisation MED-8 : 231246c publié, aucun apport distant ni conflit.

## LIB-1 — Contrat des playlists privées

- Définit identité de playlist, occurrence et morceau, doublons et liste vide,
  propriétaire JWT, visibilité privée, routes et DTO avec version sûre.
- Mutations transactionnelles sous verrou, contrôle Catalogue borné à l’ajout,
  refus 409 sur concurrence et réponses explicites aux suppressions répétées.
- Bornes relues contre SQL : nom 100, description 2000, position positive,
  cascade locale. Ancien localStorage conservé mais non importé.
- Vérification documentaire réalisée ; aucune route Library implémentée ici.
- Note Notion du contrat créée ; application du modèle encore asynchrone.
  Sa documentation et son lien restent à finaliser avant le bilan global.
- Synchronisation LIB-1 : 0d785c1 publié, aucun apport distant ni conflit.

## LIB-2 — Lectures privées authentifiées

- JWT vérifié avant les lecteurs ; sujet UUID utilisé dans chaque filtre SQL.
  Lecture privée seulement, listes bornées et ordre stable ; compte et page
  dans un instantané RepeatableRead. Conversion sûre des versions BigInt.
- @fastify/jwt 10.2.2 ajouté avec lockfile ; aucun secret de secours.
- Build Docker et deux tests Library réussis : tokens invalides sans lecture,
  comptes A/B, pagination, pannes et DTO. Stockage injecté dans les tests ;
  la preuve PostgreSQL réelle reste LIB-13.
- Six notes Notion par fichier créées ; leurs modèles sont encore en attente.
  La documentation préparée et les liens seront finalisés avant le bilan.
- Synchronisation LIB-2 : 61a39dd publié, aucun apport distant ni conflit.

## LIB-3 — Création d’une playlist vide

- POST authentifié, name/description uniquement ; propriétaire JWT, visibilité
  private et version 1 imposés par le serveur, réponse 201 avec items vides.
- Validation intégrale avec trim et limites en caractères Unicode ; un champ
  illicite ou une description invalide bloque toute écriture.
- Build et trois tests Library passent : 401 sans écriture, identités forgées,
  noms/descriptions invalides, création/relecture, trim et panne contrôlée.
  Lecteurs/writer injectés ; les preuves SQL restent LIB-13.
- Rôles des fichiers : app route/identité ; playlist validation/DTO ; index
  création Prisma ; app.test refus et confirmation. Amendements Notion
  préparés, application des modèles LIB-1/2 toujours en attente externe.
- Synchronisation LIB-3 : 771ede0 publié, aucun apport distant ni conflit.

## LIB-4 — Ajout d’une occurrence

- Propriétaire/version contrôlés avant appel Catalogue HTTP, borné à 2 s.
  La transaction SQL revérifie les deux sous verrou SELECT FOR UPDATE,
  calcule max(position)+1 et crée une occurrence avec identité propre.
- Mise à jour de version/updatedAt et insertion atomiques ; bornes position
  int32 et version JSON sûre. Aucun réseau sous verrou ni SQL interschéma.
- Build et cinq tests Library passent : refus avant Catalogue, absence,
  timeout, conflit, double occurrence ; vrai client HTTP sur serveur local.
  La concurrence SQL réelle reste à prouver en LIB-13.
- Nouveaux fichiers : catalog.ts client HTTP ; database/mutations.ts verrou
  et écriture ; app orchestre les refus, playlist valide, index branche,
  app.test distingue contrôles injectés et HTTP réel.
- Deux nouvelles notes Notion créées, documentation/amendements préparés ;
  les modèles Notion restent en attente, suivis pour finalisation globale.
- Synchronisation LIB-4 : 3ec82ee publié, aucun apport distant ni conflit.

## LIB-5 — Retrait ciblé d’une occurrence

- DELETE item avec expectedVersion ; verrou/propriétaire/version réutilisés,
  suppression par itemId ET playlistId, incrément seulement après retrait.
  Les autres occurrences et leurs positions restent inchangées.
- Aucun appel Catalogue requis ; répétition avec version ancienne 409,
  avec version courante mais item absent 404, sans seconde mutation.
- Build et six tests Library passent, dont retrait précis sur doublons,
  compte/occurrence étrangers, version périmée et Catalogue indisponible.
- app valide et route ; mutations exécute la transaction locale ; playlist
  valide expectedVersion ; index branche ; app.test exerce les refus.
  Amendements Notion préparés, modèles externes toujours en attente.
- Synchronisation LIB-5 : 52bc13d publié, aucun apport distant ni conflit.

## LIB-6 — Édition atomique

- PATCH name/description et expectedVersion ; validation complète avant writer,
  champs de propriétaire/visibilité interdits. Réutilise verrou et version.
- Champs et version/updatedAt mis à jour dans une transaction ; aucun effet
  partiel si un champ est invalide, conflit ou panne.
- Build et sept tests Library passent : refus sans changement, édition des
  deux champs et description seule conservant le nom, DTO confirmé.
- playlist valide, app protège la route, mutations écrit atomiquement, index
  branche et app.test vérifie les comportements avec stockage contrôlé.
  Amendements Notion préparés, modèles externes encore en attente.
- Synchronisation LIB-6 : ecd91d2 publié, aucun apport distant ni conflit.

## LIB-7 — Suppression locale d’une playlist

- DELETE avec contrôle propriétaire/version sous verrou ; réponse 204 après
  suppression, répétition 404. La FK existante cascade vers ses seuls items.
  Aucun appel destructeur ni lecture à Catalogue/Media.
- Build et huit tests Library passent : identité, propriété, version,
  ressource absente, succès et répétition. Cascade SQL réelle prévue LIB-13.
- app valide et répond ; mutations réutilise le verrou générique et supprime ;
  index branche ; app.test vérifie les refus et l’absence d’appel Catalogue.
  Amendements Notion préparés, modèles externes encore en attente.
