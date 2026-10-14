# Tests des fichiers sur la pile existante

Ce parcours utilise `docker-compose.yml` à la racine du dépôt, le projet
`common_repo` et HTTPS 1443. Il couvre envoi, validation, stockage, liste,
aperçu et suppression des fichiers personnels audio/image. Les sections
ci-dessous distinguent les preuves unitaires, HTTPS/SQL/disque et Chromium ;
la campagne globale les reprend depuis des volumes neufs.

## Cibles

Configuration observée le 13 octobre 2026 : projet `common_repo`, base
`transcendence`, HTTPS `https://127.0.0.1:1443`.

| Stockage | Volume |
| --- | --- |
| PostgreSQL | common_repo_db_data |
| Audios Media | common_repo_media_data |
| Avatars Users | common_repo_avatar_data |

`common_repo_prometheus_data` et `common_repo_grafana_data` ne font pas partie
des données de test. Ne pas utiliser `down --volumes` pour nettoyer ce parcours.
Avant toute suppression future, vérifier le projet, la base, le montage réel
et la liste des UUID créés par le scénario ; ne pas déduire la cible d'un nom
de dossier. Toute réinitialisation complète reste distincte du nettoyage.

## Démarrer et contrôler

Depuis `/home/ange/common_core/transcendence/common_repo`, avec Docker/Compose
disponibles et `.env` local renseigné :

```bash
docker compose -f docker-compose.yml config --quiet
docker compose -f docker-compose.yml up -d --build db auth-service user-service catalog-service media-service library-service playback-service frontend nginx
docker compose -f docker-compose.yml ps -a
```

Le démarrage applique les six migrations puis les permissions. Les migrations
et `apply-permissions` doivent terminer avec le code 0. Si elles échouent,
diagnostiquer avant de tester les routes ; ne pas supprimer la base pour
masquer l’échec. Une base ancienne peut demander une reprise documentée des
schémas et de l’historique, distincte d’un simple démarrage.

Les variables de connexion runtime et migration doivent utiliser les rôles
dédiés définis dans `.env.example`. Les douze variables de mots de passe
utilisées par le bootstrap doivent être cohérentes avec ces connexions.
Ne jamais publier `.env`, les mots de passe ou la sortie complète de `config`.

Après démarrage réussi, contrôler les réponses réelles :

```bash
curl --fail --silent --show-error --insecure https://127.0.0.1:1443/api/catalog/ready
curl --fail --silent --show-error --insecure https://127.0.0.1:1443/api/media/ready
```

Attendu : 200 et état ready pour les deux services. `--insecure` sert uniquement
au certificat auto-signé de cette pile locale ; ne pas le reprendre pour un
serveur public. Un conteneur running ou une page HTML 200 ne prouve pas la
disponibilité de la route : vérifier également le corps JSON du service.

## Vérifier la session et la propriété

Depuis la racine, construire l’image de test puis lancer les contrôles Media :

```bash
docker compose -f docker-compose.yml build migrate-media
docker compose -f docker-compose.yml run --rm --no-deps migrate-media npm test
```

`authenticate-user.ts` vérifie la signature HS256, l’expiration obligatoire et
le sujet UUID du jeton, puis place l’identité sur la requête. Les futures routes
privées devront utiliser cette fonction dans leur hook `onRequest`.
`read-owned-asset.ts` reçoit cette requête et le client Prisma Media : il cherche
simultanément `id` et `uploaderUserId`. Sans identité valide, il ne consulte pas
la base. Un fichier étranger, sans propriétaire ou absent donne le même `null`.
La route privée devra traduire ce résultat en 404 ; une erreur de base doit
rester une erreur de service. Le formulaire ne fournit jamais le propriétaire.

`file-access.test.ts` utilise de vrais jetons signés et une route présente
uniquement dans le test. Une doublure de Prisma compte les lectures et applique
les deux conditions aux fichiers de A, de B et du catalogue sans propriétaire.
Les tests vérifient les refus avant lecture, les deux sens A/B et la résistance
aux identifiants de propriétaire falsifiés dans le formulaire ou la requête.
`app.test.ts` conserve les contrôles sur de vrais octets audio temporaires,
GET, HEAD, plages et publication ; la lecture publique reste sans connexion.

Ces tests ne créent ni compte ni ligne SQL. Ils prouvent les fonctions et leur
composition Fastify, pas encore le parcours privé HTTPS/PostgreSQL/navigateur.
Aucune route privée de gestion n’est livrée à l’étape 4. `JWT_SECRET` doit être
non vide au démarrage ; Compose le fournit déjà via `.env`, sans exposer sa
valeur dans les rapports.

## Données des prochains scénarios

Créer A et B par l’inscription réelle avec un identifiant de campagne unique,
par exemple le préfixe `files-<campagne>-a` et `files-<campagne>-b`. Conserver
les UUID réellement retournés dans un fichier d’état local privé et ignoré
par Git, plutôt qu’utiliser des UUID supposés. Ne pas inscrire de jetons ou
mots de passe dans les rapports. A et B doivent avoir des fichiers distincts.

Préparer des audios synthétiques et des images générées, valides, invalides,
tronqués et hors limites selon [FILES_CONTRACT.md](../../docs/music/FILES_CONTRACT.md).
Ne pas utiliser les fichiers du catalogue comme uploads personnels : les
assets de démonstration `30000000-0000-4000-8000-000000000001` à `003` restent
hors nettoyage de ce parcours.

Après implémentation, nettoyer les uploads personnels via leur vraie route
DELETE, avec leur propriétaire et les UUID du manifeste ; contrôler leurs
variantes et métadonnées. Une fixture de référence Catalogue ajoutée pour un
test négatif doit être retirée par une opération ciblée avant l’effacement du
fichier. Les éventuelles écritures SQL de fixtures doivent vérifier
`current_database() = 'transcendence'` et viser uniquement les UUID enregistrés.
Les comptes créés pour la campagne sont conservés tant qu’aucun nettoyage
ciblé des références Auth/Users/Library/Playback n’est produit et vérifié.
Ne jamais supprimer globalement des tables, des comptes ou des volumes.

## Valider le contenu réel — étape 5

`backend/services/media-service/src/validation/validate-file.ts` lance `decode-file.ts` dans un
processus Linux isolé. La fonction reçoit un temporaire interne et le MIME
annoncé, puis renvoie type confirmé, octets, SHA-256 et durée décodée ; une
image reçoit aussi ses dimensions. Elle ne publie ni fichier ni ligne SQL.
Le nom et les métadonnées du client ne servent pas à calculer ces valeurs.

FFmpeg 8.1.2 (paquet Alpine 8.1.2-r0 observé) et sharp 0.34.5 sont utilisés
dans les images de construction et de production. Le protocole FFmpeg `fd`
lit un descripteur de fichier régulier déjà ouvert sans suivre de symlink,
avec recherche dans le fichier pour M4A. Les protocoles de chemins, réseau
et playlists sont exclus ; les entrées vidéo et les audios à plusieurs flux
sont refusés dans cette première version. Aucun filtre par extension audio
n'est appliqué. Les MIME usuels des conteneurs testés et leurs alias sont
contrôlés ; `application/octet-stream` permet la reconnaissance serveur
d'un format audio dont le navigateur ignore le MIME. Les autres conteneurs
décodables reçoivent un type `audio/x-<format FFmpeg>`. La compatibilité reste
celle des décodeurs installés, sans promesse pour tous les codecs possibles.

La validation audio parcourt complètement le fichier vers un flux PCM jeté
progressivement ; le nombre d'échantillons donne la durée, comparée à celle
du conteneur quand elle existe. Les erreurs de décodage font échouer la
validation. sharp parcourt les pixels PNG/JPEG/WebP avec erreurs strictes,
refuse animation/pages et vérifie 8 192 par côté et 25 millions de pixels.

Le budget porte sur le worker JS et ses descendants : somme de leurs mémoires
résidentes via `/proc`, contrôlée toutes les 20 ms, arrêt du groupe de
processus à dépassement. Le délai couvre tout le traitement, sans remise à
zéro entre décodeurs. Audio : 300 s/512 Mio ; image : 30 s/256 Mio. La
surveillance est échantillonnée, pas une réservation de mémoire du noyau ;
un dépassement bref entre deux mesures reste une limite de cette preuve.
Une deuxième validation simultanée reçoit 503 ; une annulation arrête aussi
le groupe. Aucun contrôle ne charge les 500 Mo originaux en mémoire.

```bash
docker compose build migrate-media
docker compose run --rm --no-deps migrate-media npm test
node tests/files/fixtures/create-fixtures.mjs /tmp/files-fixtures
```

Les 10 tests Media passent : les 6 contrôles acquis et 4 groupes de validation
sur de vrais fichiers. WAV, FLAC, MP3, AAC, M4A, Ogg/Vorbis et Opus sont
décodés ; PNG/JPEG/WebP aussi, dont la borne de 5 000 × 5 000 pixels.
Refus testés : MIME mensonger, vide, signature seule, troncature, durée WAV
incohérente, formats actifs, références externes, animation, dimensions et
tailles dépassées. Des fichiers creux vérifient les limites exactes +1 octet
sans allocation de 500 Mo. Les tests de budget arrêtent de vrais workers,
avec récupération de la capacité après erreur et annulation.
Le générateur de fixtures réutilise le PNG existant et produit un WAV
synthétique et leurs variantes invalides dans le dossier fourni.

Ces contrôles ne prouvent pas encore un envoi HTTPS, le stockage SQL, un
aperçu navigateur, ni la prise en charge de fichiers maximaux de tous formats.
Les étapes suivantes apportent ces preuves et la variante audio d'aperçu.

## Recevoir et conserver — étape 6

POST /api/media/assets reçoit exactement un champ fichier nommé `file`,
avec Authorization: Bearer et aucun champ de propriétaire/chemin. La
réception compte les octets en flux vers un dossier privé `.upload-UUID`
du volume Media. Un seul envoi est actif par instance ; les autres donnent
503. Une image reconnue est limitée à 25 000 000 octets dès sa réception,
l'audio à 500 000 000. Une erreur ou un abandon ferme le flux et nettoie
le dossier temporaire. Le nom original du navigateur n'est jamais un chemin.

Après décodage, tous les audios reçoivent une variante MP3 128 kbit/s,
44,1 kHz stéréo ; l'original reste identique. Le budget unique du worker
inclut validation et conversion, et la variante est bornée à 500 Mo.
Les images utilisent directement leur original validé. La lisibilité réelle
MP3 dans Chromium sera démontrée à l'étape navigateur.

Le serveur synchronise les fichiers/dossiers sur disque, installe des liens
complets sans écrasement, puis crée en une écriture Prisma l'asset ready et
sa variante. La valeur SQL existante `cover` représente une image, tandis
que la réponse publique expose `usage: image`. Aucun changement de schéma
ni écriture Catalogue n'est nécessaire. La réponse 201 contient uniquement
id, usage, MIME, taille, durée éventuelle et état ; elle ne contient aucun
chemin, propriétaire ou clé interne.

Une panne SQL certaine supprime les seuls liens installés par l'envoi. Un
résultat de commit impossible à déterminer conserve dossier et fichiers
jusqu'à reprise, plutôt que risquer de retirer les octets d'un asset ready.
Au démarrage, avant de recevoir des requêtes, `recoverUploads` examine au
plus 1 000 dossiers .upload-UUID, consulte Media et compare les inodes :
supprime les liens d'un envoi non enregistré, conserve ceux d'un asset
enregistré, puis retire son dossier temporaire. SQL indisponible ou trop de
dossiers à reprendre empêchent le démarrage ; aucun seed ni fichier portant
une autre clé n'est effacé. Ne pas lancer ce traitement à côté d'une instance
qui écrit activement dans le même volume ; il est conçu pour le redémarrage
de l'unique instance Media de cette pile.

Nginx autorise 501 000 000 octets sur `/api/media/assets`, enveloppe comprise,
transmet l'envoi en flux et attend jusqu'à 330 secondes le résultat après
réception. La limite avatar et les autres routes gardent leurs bornes.
Les configurations principale et musicale passent `nginx -t`.

Les 14 tests Media passent, dont quatre nouveaux groupes : POST audio/image
sur vrais octets, variante MP3 décodable, refus multipart/MIME/taille,
compensation et commit incertain avec base simulée, reprise sur disque et
collision, et abandon d'une vraie connexion HTTP. La preuve PostgreSQL/HTTPS
reste à l'étape 11 ; la liste et la lecture privées restent à l'étape 7.

## Retrouver et prévisualiser — étape 7

GET /api/media/assets liste exclusivement les assets ready audio/cover
du propriétaire JWT. La réponse contient items, total, page et pageSize ;
page commence à 1 (maximum 9 999), pageSize vaut 50 par défaut et au plus
100. L'ordre createdAt descendant puis UUID descendant est déterministe.
Une pagination invalide donne 400 ; rafraîchir la liste après une mutation.
Les réponses ne révèlent ni propriétaire, ni clé de stockage, ni checksum.

GET et HEAD /api/media/assets/:id/private-content revérifient la connexion,
l'UUID, la propriété et l'état ready. Les images livrent leur original ;
l'audio livre sa variante MP3 privée. MIME et Content-Length décrivent les
octets réellement livrés, avec Cache-Control no-store et nosniff. Un chemin
non conforme, un symlink, un fichier non régulier, absent ou dont la taille
ne correspond pas est refusé. Un autre propriétaire, seed ou état indisponible
reçoit uniformément 404 ; absence de session : 401. HEAD omet tout corps,
y compris lors d'un refus. La lecture publique /audio conserve ses règles.

Les 16 tests Media passent : les deux nouveaux groupes vérifient la requête
Prisma propriétaire/état, la pagination et les clés publiques, puis les
octets image/variante et tous ces refus sur un dossier temporaire réel.
La base des tests reste simulée ; le rendu navigateur est encore à prouver.

## Supprimer sans casser le catalogue — étape 8

DELETE /api/media/assets/:id exige propriétaire et UUID valides. Un fichier
sans propriétaire ou d'un autre compte donne 404 ; un fichier déjà deleted
du même compte donne 204. Media demande à Catalogue si tracks.audioAssetId,
releases.coverAssetId ou artists.imageAssetId référence ce fichier, sans
filtre d'état : un brouillon est protégé aussi. Le contrôle utilise HTTP
interne et INTERNAL_SERVICE_TOKEN, jamais le SQL d'un autre service.
Nginx refuse tout accès public à /api/catalog/internal/. Une référence
donne 409 ; réponse invalide, timeout ou panne du contrôle donne 503, sans
effacement ni transition depuis ready.

Après contrôle, une transition SQL conditionnelle ready → deleting masque
le fichier des nouvelles listes/lectures. Le serveur retire l'original et
toutes ses variantes, synchronise le dossier et marque deleted. Une absence
d'octets est tolérée pour terminer une suppression interrompue. Deux DELETE
concurrents convergent vers deleted/204 ; les lignes de suivi sont conservées.
Au démarrage, la reprise traite au plus 1 000 lignes deleting appartenant à
un compte, avec le même contrôle de références et les mêmes protections.
Une panne Catalogue/SQL empêche un faux succès ; la reprise pourra retenter
l'opération. Un flux déjà autorisé peut terminer sa lecture.

Cette protection correspond au périmètre acquis : les routes Catalogue
sont en lecture seule et les fichiers personnels ne sont jamais associés
par l'interface. Une vérification HTTP suivie d'un effacement ne constitue
pas une transaction entre services. Des écritures administratives de seeds
doivent être faites hors suppression concurrente ; une future publication
utilisateur devra ajouter son propre protocole d'association/suppression.

Les tests Media couvrent accès tiers/seeds, références et panne de contrôle,
DELETE concurrents/idempotents et reprise après panne SQL sur octets réels.
Les tests Catalogue couvrent les trois champs de référence sans filtre de
statut et l'authentification interne. Les preuves de références SQL réelles
et de conservation de la lecture publique sont prévues à l'étape 11.

## Envoyer depuis l’interface — étape 9

La navigation privée « Mes fichiers » affiche un formulaire audio/image,
avec contrôles de fichier vide, taille et type. Les premiers 1 Mio au plus
permettent de reconnaître les signatures, les dimensions PNG/JPEG/WebP et
les contenus texte/actifs indécodables ; les images dépassant les dimensions
sont refusées avant de demander au navigateur leur décodage. Une image dont
l'en-tête ne permet pas ce contrôle borné est refusée avec un message clair.
Le navigateur décode réellement l'image et tente les métadonnées audio,
avec un délai de 5 s. Un codec audio non pris en charge localement reste
envoyable : le serveur vérifie le contenu complet. Les WAV manifestement
tronqués et les faux audios texte sont refusés localement.

Le client utilise XMLHttpRequest.upload.onprogress, sans fabriquer de
pourcentage : octets réels, progression indéterminée si nécessaire, puis
« validation et enregistrement » jusqu'à une réponse 201 avec objet ready
valide. Le JWT reste en mémoire et passe dans Authorization ; FormData fixe
sa propre frontière. Annulation, réseau, timeout, 401 et changement de
session ne produisent aucun succès trompeur. Un 401 tardif n'efface pas une
session plus récente. La sélection reste disponible après un refus ; les
URL de contrôle local sont libérées à la fin ou à l'annulation.

Lint et compilation frontend sont les contrôles de cette étape. La preuve
de progressions intermédiaires sur réseau réellement ralenti, des refus
visibles et de l'aperçu reste au scénario Chromium de l'étape 12.

## Gérer ses fichiers dans l’interface — étape 10

Mes fichiers utilise maintenant la liste paginée du serveur, par pages de
20, et distingue chargement, liste vide et erreur. L'envoi confirmé actualise
la première page ; une erreur d'envoi n'ajoute aucune ligne.
Chaque fichier présente type, taille et durée éventuelle, un aperçu à ouvrir
et un bouton de suppression. Le serveur peut confirmer 204 ou refuser 409 ;
la ligne disparaît uniquement après succès. Un refus garde ligne et aperçu,
avec un message exploitable et possibilité de réessayer.

L'aperçu est téléchargé par authenticatedFetch avec signal d'annulation,
MIME attendu et taille annoncée bornée. Les octets sont comptés pendant la
lecture, puis un Blob local alimente img ou audio. Pas de jeton dans src,
pas de session Playback pour ces fichiers privés. Fermeture, suppression,
changement de compte et démontage libèrent les URL Blob et annulent les
requêtes ; les réponses tardives d'une ancienne session sont ignorées.
La liste n'est pas conservée dans localStorage.

Lint et build frontend passent. Les preuves avec un vrai serveur, images
décodées, lecture MP3, refus de suppression et changements de compte
arrivent aux étapes 11/12 ; la compilation ne remplace pas ces preuves.

## Prouver les vrais stockages — étape 11

Après démarrage des services et installation explicite des démonstrations
Media/Catalogue par leurs scripts existants, utiliser un nouveau manifeste
privé de campagne. Le scénario refuse d'écraser un manifeste existant.

```bash
docker compose exec -T media-service npm run seed:demo
docker compose exec -T catalog-service npm run seed:demo
node tests/files/verify-files.mjs initial /tmp/transcendence-files-state.json
docker compose restart media-service
node tests/files/verify-files.mjs verify /tmp/transcendence-files-state.json
docker compose restart db
node tests/files/verify-files.mjs verify /tmp/transcendence-files-state.json
node tests/files/verify-files.mjs catalog-down /tmp/transcendence-files-state.json
node tests/files/verify-files.mjs delete /tmp/transcendence-files-state.json
```

La campagne est strictement bornée au projet common_repo, à HTTPS 1443 et à
current_database() = transcendence. Les comptes A/B sont créés par inscription
réelle, avec attente du résultat pending avant connexion. Le manifeste mode
0600 contient identités de campagne, UUID et empreintes ; aucun JWT n'est
enregistré. Le mot de passe est une constante destinée uniquement aux comptes
de test example.invalid. Les fixtures sont générées à côté du manifeste.

initial envoie audio/image à A et une image à B ; compare propriétaire,
purpose/state/tailles/durée/checksum SQL via assert-files.sql, SHA-256 des
originaux sur disque et octets des aperçus autorisés. Il contrôle les listes,
GET/HEAD, refus A/B sur UUID réellement existants, JWT absent, MIME mensonger,
troncature, vide, contenu actif, image de 25 000 001 octets et audio de
500 000 001 octets réellement transmis en flux (sans allocation de 500 Mo).
Trois fixtures SQL distinctes protègent audio draft, cover draft et image
d'artiste ; leur effacement refusé conserve références/octets et audio public.
Leur nettoyage vise seulement les trois UUID du manifeste, même sur échec.

verify attend les services prêts puis recontrôle les mêmes UUID/empreintes
sans seed ni ré-upload. catalog-down arrête seulement Catalogue, attend un
503 de DELETE sans effacement, puis le redémarre même sur échec. delete
envoie deux DELETE concurrents par fichier A, vérifie deleted en SQL,
absence d'original/variante, nouvel accès 404 et idempotence ; B reste intact
jusqu'à son nettoyage final, et les démonstrations restent lisibles.
Les comptes et lignes deleted sont conservés comme suivi, sans suppression
globale de tables/volumes. Une campagne ordinaire ne réinitialise aucune base.

Résultats du 13 octobre 2026 : initial, vérification après redémarrage Media,
vérification après redémarrage PostgreSQL, panne Catalogue et suppression
concurrente/idempotente réussis sur les vrais services. Aucun dossier .upload
résiduel ; les trois audios de démonstration et le catalogue sont conservés.
Le rendu et la progression visibles du navigateur restent à l'étape 12.

## Prouver les gestes navigateur — étape 12

```bash
npm ci --prefix tests/files
npm run install:browser --prefix tests/files
npm test --prefix tests/files
```

Playwright est verrouillé à 1.63.0 ; réutiliser son Chromium déjà installé
lorsqu'il correspond. Les scénarios ciblent exclusivement HTTPS 1443, avec
un worker, zéro retry, traces et vidéos désactivées ; seules les captures
locales d'échec sont conservées dans des dossiers ignorés par Git.

Les scénarios envoient une vraie image et un WAV de 576 044 octets par
le formulaire. Un ralentissement CDP réel à 128 Kio/s d'envoi démontre
plusieurs valeurs intermédiaires de progression : aucun onprogress synthétique
ni réponse ready inventée. Les tests attendent les vraies réponses 201,
vérifient naturalWidth de l'image et la durée/lecture réelle du MP3 via les
contrôles audio, rechargent et reconnectent avant de relire la liste.
Un audio AIFF effectivement refusé par le décodeur local est envoyé quand
même, validé par FFmpeg et réellement lu par son aperçu MP3 séparé.

Une référence draft réelle fait refuser la suppression avec 409 : ligne et
aperçu restent visibles. Une coupure réseau conserve aussi la ligne ; après
reprise, le vrai DELETE la retire et le rechargement confirme l'absence.
B ne voit aucun fichier de A. Des fichiers image +1 octet, texte faux audio,
WAV et PNG tronqués échouent localement avant POST ; les contournements par
requête HTTP sont refusés aussi par le serveur. Annuler un envoi en réseau
ralenti n'ajoute aucune ligne. Une réponse A réellement obtenue auprès du
backend est retardée pendant logout/connexion B, puis relâchée : aucune
ancienne ligne ne réapparaît.

Les fixtures et comptes sont uniques à chaque test ; le nettoyage retire
les seules références et fichiers de ces comptes via DELETE, en exigeant
une liste vide. Les comptes et lignes deleted restent comme suivi.
Les résultats Chromium complètent les preuves SQL/disque, sans certifier
tous les formats, navigateurs ou charges.

## Rejouer depuis des volumes neufs — étape 13

```bash
tests/files/run.sh
tests/files/run.sh
```

Chaque lancement utilise les mêmes services/réseau/ports du Compose
principal, avec une surcharge temporaire portant seulement sur les noms de
db_data, media_data et avatar_data. Il vérifie les volumes d'origine, crée
trois volumes uniques étiquetés jetables pour cette campagne, suspend les
services applicatifs, puis démarre la pile sur ces nouveaux volumes.
Les six migrations et les permissions précèdent la preuve de tables vides
et les seeds explicitement exécutés. Les données existantes restent dans
leurs volumes d'origine, qui sont ensuite remontés.

La commande enchaîne 98 tests Auth/Users/Catalogue/Media/Library/Playback,
lint/build et 10 tests music frontend, outils Chromium, preuves HTTPS/SQL/disque,
redémarrages, panne Catalogue, avatars/Library/Playback, trois scénarios
Chromium et suppression ciblée. La vérification finale du volume Media
exige exactement les trois originaux de démonstration, sans upload résiduel.

Le trap de sortie restaure les volumes d'origine, revérifie les montages
effectifs et la disponibilité HTTPS, puis retire uniquement les volumes
créés par ce lancement après contrôle de leurs labels de campagne/jetables.
Il conserve les volumes originaux et ceux du monitoring. Un contrôle,
une restauration ou un nettoyage en échec interdit le PASS global.
En cas d'échec, le chemin local des cibles/preuves est affiché pour reprendre
la restauration ; les configurations contenant l'environnement sont effacées.

Le runner imprime révision Git, présence de changements locaux, versions
Node/npm/Compose/Playwright/Chromium/FFmpeg et résultats, sans secrets. Les
manifestes et fixtures locaux restent sous /tmp en accès privé. Deux lancements
indépendants démontrent l'absence de dépendance aux données du premier.

**Résultats du 13 octobre 2026 : deux campagnes complètes PASS**, chacune avec
98 tests de services (Auth 6, Users 50, Catalogue 7, Media 19, Library 8,
Playback 8), 10 tests frontend, lint/build verts, HTTPS/SQL/disque et
3 scénarios Chromium (35,5 s puis 37,7 s). Chaque campagne a utilisé trois
volumes nouveaux distincts, prouvé les tables vides après migrations,
restauré les montages d'origine et retiré ses seuls volumes jetables.
Node 22.23.2, npm 10.9.8, Compose 2.40.3, Playwright 1.63.0,
Chromium 153.0.8010.12 et FFmpeg 8.1.2 sont les versions observées.
Révision de base d87ebc9 avec les modifications locales du runner/guide.

Un essai de préparation a échoué sur une garde visant auth.users, alors
que la table réelle est auth.accounts. Le runner a restauré/nettoyé cet
essai ; les deux campagnes complètes ont ensuite utilisé la garde corrigée.
Le scénario de non-régression respecte aussi le vrai retour 200 de l'ajout
d'un morceau à une playlist, vérifié dans le code existant.

Cette preuve complète justifie le Minor « File upload and management system »
de 1 point. Elle ne coche pas la compréhension de l'utilisateur ; le bilan
global des autres modules est à réexaminer par tr-status.

## État du contrôle initial

Le 13 octobre 2026, la configuration Compose est valide et la base démarre.
Les migrations Catalogue, Media, Library et Playback terminent avec succès.
Le premier démarrage a révélé des schémas Auth/Users anciens : Auth P3005
(schéma non vide), Users P3018 (table profiles existante). La reprise a
conservé les données : ajout de bio, friends, presences et de la contrainte
canonique des usernames après vérification de zéro profil incompatible ;
enregistrement des deux baselines dans les schémas auth/users et application
des scripts existants de propriété et permissions. Le .env local utilise
désormais les rôles dédiés et la connexion migration Users cible users, pas
public. Ces opérations ne doivent pas être rejouées aveuglément : comparer
le schéma avant toute reprise. Aucun volume n’a été réinitialisé.

Contrôle final effectué le 13 octobre 2026 : les six migrations et
apply-permissions terminent avec le code 0 ; Auth, Users, Catalogue, Media,
Library et Playback répondent tous 200 avec le JSON ready attendu via HTTPS
1443. Ces réponses confirment les connexions et la passerelle, pas les futurs
uploads, aperçus ou suppressions. Aucun compte ni fichier personnel de test
n’a été créé à cette étape ; leurs identifiants seront enregistrés lors des
scénarios suivants.
