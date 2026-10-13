# Tests des fichiers sur la pile existante

Ce parcours utilise `docker-compose.yml` à la racine du dépôt. Il ne crée pas
de seconde pile. Les uploads privés ne sont pas encore implémentés : le guide
décrit d’abord les prérequis, puis sera complété avec les scénarios produits.

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

`services/media-service/src/validate-file.ts` lance `decode-file.ts` dans un
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
