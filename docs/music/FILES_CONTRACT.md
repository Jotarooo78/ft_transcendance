# Contrat des fichiers personnels

Choix initiaux validés le 12 octobre 2026, puis parcours audio/pochette validé
le 14 octobre 2026. La rectification est implémentée et sa campagne complète
a réussi le même jour. Ce document définit les
comportements et limites retenus. Il sert de référence commune pour
l’interface, Media et les tests ; les preuves d’exécution sont décrites
dans [le guide des fichiers](../../tests/files/README.md).

## Périmètre

Le catalogue commun reste initialisé par des scripts. Un utilisateur connecté
dispose séparément de « Mes audios » : envoi, liste, aperçu et suppression
de ses audios avec une pochette facultative. Une image seule ne peut pas être
ajoutée dans cet espace. Les fichiers restent sur le serveur et sont
accessibles depuis plusieurs appareils avec le même compte.

Un envoi personnel ne crée ni morceau, ni artiste, ni album dans Catalogue.
Les fichiers du catalogue créés par script ne sont pas gérables depuis cet
espace. La lecture publique existante reste définie par [MEDIA_CONTRACT.md](MEDIA_CONTRACT.md).
Une éventuelle association future au catalogue demandera un nouveau contrat.

## Formats et tailles

Les tailles maximales s’appliquent aux octets du fichier, hors enveloppe HTTP
multipart. La borne est incluse ; un octet supplémentaire entraîne un refus.
Mo utilise ici la convention décimale : 1 Mo = 1 000 000 octets.

| Fichier | Formats | Taille maximale | Autres limites |
| --- | --- | --- | --- |
| Audio | Tout format audio réellement reconnu et décodé par la version de FFmpeg installée | 500 Mo, soit 500 000 000 octets | Durée positive déterminée par le serveur |
| Image | PNG, JPEG et WebP | 25 Mo, soit 25 000 000 octets | Au plus 25 000 000 pixels et 8 192 pixels par côté |

Les deux limites de dimensions s’appliquent simultanément. Aucune forme carrée
ni résolution minimale de pochette n’est imposée aux images personnelles.
Les images animées, multipages ou actives ne font pas partie du premier
parcours : SVG, HTML et fichiers non décodables sont refusés.

« Tous les formats audio » signifie absence de liste fermée d’extensions,
pas compatibilité universelle avec tous les codecs. WAV, FLAC, MP3, AAC/M4A,
OGG et Opus sont vérifiés par les tests Media ; les pochettes intégrées sont
également vérifiées en MP3, FLAC et M4A. Seuls les fichiers locaux envoyés sont traités : un fichier ne
doit pas provoquer la lecture d’une URL, d’un chemin arbitraire ou d’une
ressource externe. Une véritable piste vidéo est refusée. Les images attachées
signalées par attached_pic sont des pochettes facultatives et ne doivent pas
faire refuser une piste audio valide. La durée provient de la piste audio,
quel que soit son ordre dans le fichier.

## Validation et ressources

Le navigateur contrôle rapidement fichier vide, taille et types d’image
acceptés. Il vérifie le décodage local lorsqu’il est disponible. Son incapacité
à lire un codec audio ne doit pas empêcher un envoi que le serveur sait traiter.
La reconnaissance complète des audios reste un contrôle serveur indépendant.

Le serveur contrôle type, taille et format réels, et refuse les fichiers vides,
tronqués, corrompus ou non pris en charge. Une extension, un MIME déclaré ou
une signature seule ne suffit pas. Il calcule taille, SHA-256 et durée audio
depuis le contenu validé ; les valeurs du client ne font pas autorité.

| Traitement lourd | Temps maximal | Mémoire maximale |
| --- | --- | --- |
| Validation audio et préparation de son aperçu | 300 secondes | 512 Mio, soit 536 870 912 octets |
| Validation image | 30 secondes | 256 Mio, soit 268 435 456 octets |

Un seul traitement lourd s’exécute à la fois par instance Media, audio et image
confondus. Le budget couvre l’ensemble des opérations nécessaires sur le
fichier après réception complète, y compris une conversion d’aperçu ; il ne
repart pas à zéro à chaque processus. Ces durées ne limitent ni la durée du
morceau ni le temps d’envoi. La mémoire couvre le traitement et ses processus
enfants, pas uniquement le processus principal. Une surveillance doit arrêter
le traitement lorsque sa limite est atteinte et nettoyer ses ressources.

Les fichiers sont reçus en flux borné vers un temporaire ; aucun contrôle ne
doit exiger de charger un audio de 500 Mo intégralement en mémoire. À capacité
indisponible, refuser explicitement avec possibilité de réessayer plutôt que
créer une attente non bornée. Les limites sont des valeurs de départ validées,
à éprouver avec des fichiers représentatifs avant de revendiquer leur support.
Tout ajustement nécessaire doit être expliqué et reporté dans ce contrat.

## Propriété et stockage

Media conserve ses métadonnées dans son seul schéma. Le propriétaire provient
du sujet UUID d’un JWT dont signature et expiration sont vérifiées, jamais
d’un champ de formulaire. Chaque opération privée vérifie de nouveau ce droit.

Attribuer une clé de stockage interne aléatoire ; ne pas accepter de chemin
ou de clé fourni par le client. Conserver les fichiers dans le volume Media,
hors des dossiers publics, sans suivi de liens symboliques. Les assets sans
propriétaire, notamment les seeds du catalogue, restent hors gestion privée.

Un succès exige un fichier complet et des métadonnées cohérentes. Tant que
validation, stockage et aperçu nécessaire ne sont pas terminés, le fichier
n’est pas annoncé prêt. Les abandons et erreurs nettoient les temporaires ;
une interruption entre disque et SQL doit avoir une reprise documentée et
testée. Une ligne ready doit décrire un fichier réel et disponible.

## Aperçus et progression

Conserver l’original audio sans altération. Le propriétaire peut écouter un
aperçu ; si son format n’est pas lisible directement dans le navigateur,
produire une variante compatible distincte avec les mêmes droits. Le format
exact de cette variante est fixé ci-dessous et testé dans le
navigateur retenu. Aucun succès d’aperçu ne peut être revendiqué pour un format
accepté mais non lisible. La pochette validée possède une lecture image privée
associée à l’audio ; elle ne forme pas une entrée distincte dans la liste.

Choix de production du 13 octobre 2026 : chaque audio validé reçoit un aperçu
MP3 distinct à 128 kbit/s, 44,1 kHz stéréo, préparé dans le budget global
audio. Sa taille est bornée à 500 000 000 octets (refus 422 si dépassée), pour
borner aussi son téléchargement privé en Blob. L’original est conservé sans
modification ; les pochettes utilisent leurs octets validés. La lecture réelle
dans Chromium est prouvée, y compris pour un original AIFF non lisible
localement dont la variante MP3 fonctionne.

Les lectures privées exigent une authentification et ne mettent jamais de JWT
dans une URL. Utiliser Cache-Control: no-store ; libérer les copies et URL Blob
du navigateur à la fermeture de l’aperçu, à la suppression ou au changement
de compte. Les réponses tardives d’un ancien compte ne doivent pas réafficher
ses fichiers. La lecture d’un audio personnel ne crée pas de session Playback
du catalogue.

La progression montre les octets réellement transmis, ou un état indéterminé
si leur total est inconnu. Après transmission, afficher la validation et
l’enregistrement en cours : 100 % envoyé ne signifie pas fichier prêt. Seule
la confirmation serveur autorise le succès et l’ajout à la liste.

## Suppression

La pochette est une Variant locale de l’audio, identifiée par renditionKey=cover.
Ce choix réutilise le schéma existant et ne demande aucune migration de données.
Ses métadonnées et ses octets dépendent des droits et de l’état de l’audio.

Le propriétaire peut ajouter, remplacer et retirer la pochette d’un audio
ready lui appartenant. Chaque opération contrôle cet audio dans une transaction
locale avec les changements de variantes. La suppression rend l’audio deleting
avant de relire toutes ses variantes ; aucun ajout ne peut ensuite réintroduire
une pochette. Une ancienne pochette devient une variante retired-cover-* avant
effacement de ses octets et de sa trace SQL ; ce nettoyage est reprenable après panne.
Les installations de pochette interrompues conservent un marqueur .cover-UUID.
Au démarrage, Media vérifie la confirmation SQL avant de nettoyer ce marqueur
ou les liens non confirmés, sans effacer une pochette active.

La pochette intégrée est extraite et validée séparément. Une image inexploitable
produit un avertissement cover_unavailable sans déclarer l’audio corrompu.
L’analyse des en-têtes ne décode pas les pixels attachés ; la piste audio est
ensuite entièrement décodée sous contrôle strict. L’extraction image possède
au plus 30 secondes et 256 Mio, dans le temps restant du budget audio de 300 secondes.
Son arrêt ne doit pas annuler un audio déjà confirmé.
Une pochette manuelle valide remplace celle affichée après confirmation ;
un échec garde la précédente. Le formulaire confirme et affiche l’audio avant
de transférer la pochette manuelle, afin qu’un refus d’image ne masque pas cet audio.
Retirer la pochette détache la représentation
utilisée par l’application, sans modifier le MP3 original ni ses métadonnées.

Le propriétaire peut supprimer ses fichiers personnels. La suppression retire
l’original et ses variantes, puis confirme leur indisponibilité dans la liste
et sur les autres appareils. L’interface ne retire la ligne qu’après succès.
Un fichier d’un autre compte ou sans propriétaire reste intact.

La suppression doit être reprenable après interruption, notamment depuis
l’état deleting ; deux demandes concurrentes ne doivent pas produire un état
contradictoire. Le contrat de réponse prévoit un nouveau DELETE sur un asset
déjà deleted du même propriétaire comme succès idempotent, tant que la ligne
de suivi est conservée. Les nouvelles lectures sont refusées après le retrait ;
un flux déjà autorisé n’est pas une copie que le serveur peut récupérer.

Les envois personnels ne sont pas associés au catalogue dans le périmètre
retenu. Par défense, si une référence Catalogue existe malgré cette séparation,
refuser l’effacement : audio de morceau, pochette ou image d’artiste, y compris
brouillons. Media demande ce contrôle par HTTP interne protégé, jamais par
lecture SQL interservice. Une panne du contrôle empêche la suppression. Ce
contrôle ne garantit pas une transaction avec une future association concurrente ;
aucune écriture de publication utilisateur n’est ajoutée ici.

## Interface HTTP produite

Toutes les routes passent par HTTPS. Le préfixe externe est /api/media ; les
routes internes Media n’ont pas ce préfixe.

| Méthode et route externe | Résultat attendu |
| --- | --- |
| POST /api/media/assets | Recevoir un audio multipart et confirmer l’asset prêt avec 201, sa pochette extraite éventuelle et un avertissement séparé |
| GET /api/media/assets | Retourner avec 200 les audios prêts du compte avec leur pochette éventuelle, dans un ordre stable |
| GET /api/media/assets/:id/private-content | Retourner avec 200 les octets de l’aperçu autorisé |
| HEAD /api/media/assets/:id/private-content | Même contrôle et mêmes en-têtes que GET, sans corps |
| PUT /api/media/assets/:id/cover | Valider une image pour cet audio du compte et confirmer sa pochette avec 200 |
| GET /api/media/assets/:id/cover | Lire les octets de la pochette du propriétaire avec 200 |
| HEAD /api/media/assets/:id/cover | Même contrôle et mêmes en-têtes que GET, sans corps |
| DELETE /api/media/assets/:id/cover | Retirer la pochette affichée avec 204 sans effacer l’audio |
| DELETE /api/media/assets/:id | Confirmer avec 204 une suppression terminée, sans corps |

L’objet public décrit id, usage=audio, MIME confirmé, taille, durée audio positive
et état, ainsi que cover=null ou les métadonnées id/mimeType/byteSize de la
pochette facultative. POST peut ajouter warning=cover_unavailable pour une
pochette intégrée non confirmée ou inexploitable, avec l’audio déjà confirmé. Il n’expose ni
storageKey, ni chemin physique, ni secret. L’aperçu
peut avoir un MIME et une taille différents de l’original ; ses en-têtes doivent
décrire les octets effectivement transmis.

| Statut d’erreur | Cas |
| --- | --- |
| 400 | Requête ou UUID invalide, fichier absent/vide, nombre de fichiers incorrect |
| 401 | Session absente, invalide ou expirée |
| 404 | Asset inconnu, non disponible ou hors propriété, sans révéler son existence |
| 409 | Fichier encore référencé par Catalogue |
| 413 | Limite d’octets dépassée |
| 415 | Type/format interdit, contenu incohérent, corrompu ou non décodable |
| 422 | Dimensions d’image ou budget de traitement dépassés |
| 503 | Stockage, base ou contrôle indispensable indisponible, ou capacité de traitement occupée |

Les erreurs distinguent format non accepté, audio réellement corrompu et
pochette inexploitable. Les erreurs JSON ont un code stable et un message exploitable sans détail
interne ; HEAD omet aussi les corps d’erreur. Le code ne transforme jamais un
échec de traitement ou de persistance obligatoire en succès. Le traitement
facultatif de la pochette rapporte son propre avertissement. Les limites Nginx/multipart
doivent laisser passer le fichier maximal et son enveloppe, en conservant les
limites propres aux avatars existants.

## Vérification du contrat

Les cas suivants ont une réponse unique dans les règles ci-dessus ; ce contrôle
documentaire est complété par la campagne d’exécution :

- Audio valide de 500 000 000 octets : admissible en taille, encore soumis au
  décodage et au budget ; un octet de plus : 413.
- Pochette PNG/JPEG/WebP de 25 000 000 octets et dimensions conformes : admissible ;
  5 000 × 5 000 pixels respecte les bornes, 8 192 × 8 192 les dépasse.
- Audio reconnu par le serveur mais non lisible localement : envoi permis,
  validation serveur et variante d’aperçu compatibles requises avant succès.
- Audio valide avec une pochette intégrée corrompue ou trop grande : audio
  conservé, avertissement de pochette ; MP3 tronqué malgré une pochette complète : refus.
- Image seule dans POST assets : 415 ; une image s’associe à un audio par PUT cover.
- Fichier tronqué ou dont la déclaration masque un autre type : refus, sans
  asset prêt ni fichier incomplet consultable.
- Compte B visant un UUID privé connu du compte A : 404 ; A conserve son accès.
- Même compte sur un autre appareil : retrouve les fichiers via sa session,
  sans dépendance au stockage local du premier appareil.
- Suppression d’un fichier personnel inutilisé : 204, original et variantes
  retirés ; nouvelle lecture refusée et liste actualisée.
- Seed du catalogue ou fichier d’un autre compte : aucune suppression ;
  référence catalogue inattendue : 409, panne de contrôle : 503.
- Décodage trop lent ou trop gourmand : arrêt, refus 422 et nettoyage ; serveur
  indisponible ou occupé : 503, aucun faux succès.

La campagne complète `tests/files/run.sh` a réussi le 14 octobre 2026 : 26 tests
Media, lint et compilation frontend, 10 tests d’écoute, preuves HTTPS/SQL/disque
et quatre parcours Chromium. Le projet isolé transcendence_audio_cover utilise
trois volumes neufs et HTTPS 4443 ; il ne remplace pas les volumes de développement.
Les redémarrages Media/PostgreSQL, marqueurs d’interruption, deux comptes et
écritures de pochette/suppression réellement bloquées ensemble en PostgreSQL
sont vérifiés. Le nettoyage final confirme seulement les trois WAV de
démonstration avant de retirer la pile de test et ses volumes.
Les avatars, Catalogue, Library et Playback passent les contrôles de
non-régression. Les preuves portent sur les formats et scénarios documentés,
pas sur tous les codecs ou toutes les charges ; la validation de compréhension
reste personnelle.

## Publication depuis un compte

Le nouveau parcours reçoit l’audio par `POST /api/media/assets?temporary=1`,
puis publie par `POST /api/catalog/tracks` avec `audioAssetId`, `title` (1–200
caractères après nettoyage) et `description` (0–5 000). Le serveur déduit
l’artiste de la session vérifiée par Users ; tout champ d’identité ajouté au
corps est refusé. `GET /api/users/profiles/:id` expose uniquement le profil
public. Les lectures Catalogue utilisent le nom actuel du compte, y compris
pour la recherche et le tri, sans lire directement les tables de Users.

Media réserve durablement l’audio par sa route interne de publication avant
l’écriture Catalogue. Cette réservation et la transition vers deleting se
concurrencent sur la même ligne SQL : une seule peut gagner. Le morceau utilise
l’UUID de l’audio comme identifiant stable ; une répétition retrouve la même
publication. Une panne après réservation conserve l’audio pour une nouvelle
tentative, même si la réponse de Catalogue s’est perdue. Ces réservations ne
sont jamais supprimées sur un simple délai : leur issue peut être incertaine.
Le nettoyage périodique retire au plus 100 uploads provisoires non réservés,
expirés depuis 24 heures, après contrôle des références Catalogue. Les anciens
fichiers, sans expiration, sont conservés.

L’audio publié utilise l’aperçu MP3 validé lorsqu’il existe. Sa pochette se lit
par `/api/media/assets/:id/artwork`, avec vérification de publication à chaque
lecture ; `/cover` conserve ses permissions privées. Nginx interdit tout accès
navigateur aux routes Media internes. Le service Users doit être disponible pour
résoudre les artistes liés aux comptes ; les lectures n’inventent pas de nom en
cas de panne. La résolution actuelle regroupe les auteurs distincts et limite
les appels parallèles à huit, avant la recherche et la pagination SQL.
