# Contrat de lecture audio — MED-1

Catalogue fournit un assetId et une URL ; Media relie cet identifiant aux
métadonnées puis aux octets. Une ligne ready ne garantit pas qu'un fichier
existe : les deux sont contrôlés avant de commencer une réponse de succès.
Ce document décrit les routes à produire dans MED-3 à MED-5, pas des routes
déjà disponibles à MED-1.

## Chemin et publication

GET et HEAD `/api/media/assets/:id/audio` sont exposés par HTTPS ; le préfixe
interne Media est `/assets/:id/audio`. UUID canonique validé avant lecture.
Media utilise son seul schéma `media`. Il demande à Catalogue, par HTTP
interne, `GET /assets/:id/publication` : réponse publique `{ "published": true }`
si au moins un track published référence cet asset, sinon false. L'endpoint
ne renvoie aucun titre, compte, état de brouillon ou chemin de stockage.

`CATALOG_SERVICE_URL` désigne l'origine interne, par défaut
`http://catalog-service:4002`. La demande est bornée à 2 secondes, sans cache ;
erreur réseau, statut inattendu ou corps invalide donnent 503. La vérification
n'effectue aucune lecture SQL interservice. Un retrait empêche une nouvelle
requête une fois observé par Catalogue ; il n'interrompt pas rétroactivement
un flux déjà autorisé. Une réponse audio utilise `Cache-Control: no-store`.

## Conditions d'accès au fichier

- asset existant, purpose audio, state ready ;
- Catalogue confirme une publication ;
- storageKey est une clé interne simple, sans chemin absolu, slash, antislash
  ni segment parent ; elle n'est jamais fournie par le navigateur ;
- fichier régulier dans MEDIA_STORAGE_DIR (par défaut /data/audio), pas un
  lien symbolique ; ouverture sans suivi de lien et validation du descripteur ;
- taille du fichier égale à byteSize, valeur entière sûre et strictement
  positive ; MIME dans la liste audio/wav, audio/mpeg, audio/ogg, audio/mp4,
  audio/webm.

Ne pas exposer storageKey, uploaderUserId, chemin physique ou erreurs internes.
Un fichier est ouvert et validé avant réponse, puis transmis en flux à partir
du même descripteur. Le flux ferme le descripteur même si le client abandonne.
Le stockage n'est pas modifiable par cette API de lecture.

## Réponses et plages

GET sans Range : 200, corps complet, Content-Type validé, Content-Length exact,
Accept-Ranges: bytes et Cache-Control: no-store.

GET avec une seule plage accepte `bytes=start-end`, `bytes=start-` et
`bytes=-suffix`. Les nombres doivent être des entiers décimaux sûrs. La borne
finale est inclusive ; une fin dépassant le fichier est limitée au dernier
octet. Un suffixe plus grand que le fichier renvoie tout le fichier en 206.
La réponse 206 contient Content-Range `bytes start-end/total` et une longueur
`end-start+1`. Une plage 0-43 permet de lire les 44 octets de l'en-tête WAV.

Les plages inversées, vides, multiples, unités inconnues, nombres non sûrs,
suffixe zéro et start >= taille sont refusés par 416, avec
Content-Range `bytes */total`. Les mêmes contrôles de publication et stockage
sont effectués avant le traitement de Range.

HEAD applique les mêmes contrôles d'accès et retourne 200 avec les en-têtes du
GET complet, sans corps ; Range est ignoré pour HEAD. Une requête HEAD ne
contourne jamais les refus. La diffusion multipart n'est pas implémentée.

| Statut | Situation |
| --- | --- |
| 200 | GET complet ou HEAD autorisé |
| 206 | portion autorisée par GET |
| 400 | UUID invalide |
| 404 | inconnu, non audio/non ready/non publié, clé interdite, fichier absent ou non régulier, taille incohérente |
| 416 | Range invalide sur un fichier autorisé |
| 503 | panne SQL, Catalogue indisponible/invalide ou erreur de stockage opérationnelle |

Les erreurs ont un corps JSON `{ "error": "invalid_request" }`,
`media_not_found`, `invalid_range` ou `media_unavailable`, selon le statut.
HEAD supprime le corps aussi sur erreur. Les métriques ne sont pas publiques.

Implémentation MED-4 : un gestionnaire commun contrôle GET et HEAD avant le
traitement de Range. HEAD ouvre et vérifie le descripteur mais ne crée pas de
flux. Les tests comparent les portions, dont le dernier octet et les suffixes
surdimensionnés ; publication et stockage restent requis pour chaque méthode.

## Fixtures et persistance

Trois fichiers WAV PCM mono 16 bits little-endian, 8000 échantillons/seconde,
six secondes (6000 ms), fréquences 220/330/440 Hz et amplitude faible fixe.
Chaque fichier contient 44 octets d'en-tête et 96000 octets audio, soit 96044.
UUID Media 30000000-0000-4000-8000-000000000001 à 003 identiques aux références
Catalogue ; storageKey `demo-1.wav` à `demo-3.wav`, empreinte SHA-256 calculée
sur les octets. Aucune œuvre musicale externe n'est nécessaire.

Le seed explicite prépare un temporaire complet dans le même répertoire,
installe atomiquement le fichier, puis inscrit les métadonnées ready.
Un fichier préexistant doit avoir exactement les octets attendus ; une
collision SQL ou disque est refusée sans écraser des données arbitraires.
Un échec SQL peut laisser un fichier sans ligne, jamais publiquement lisible.
Un second passage reprend un fichier cohérent sans changer ses octets.

Volume principal media_data ; volume de test music_media_data dans le seul
projet transcendence_music. Aucun seed automatique au démarrage du serveur,
aucun upload, transcodage, CDN ou URL signée dans ce parcours.

## Contrôle réalisé à MED-1

Références comparées à CATALOG_CONTRACT.md et au schéma Prisma Media : l'UUID
reste identique du morceau à l'asset, les métadonnées ont leurs colonnes, le
chemin physique reste privé. CAT-11 a prouvé le Catalogue ; ce contrat ne
prétend pas encore que Media sert ou décode les fichiers.
