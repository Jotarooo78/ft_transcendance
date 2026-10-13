# Contrat des fichiers personnels

Choix validés avec l’utilisateur le 12 octobre 2026. Ce document définit les
comportements à produire ; il ne prouve pas leur implémentation. Il sert de
référence commune pour l’interface, Media et les tests.

## Périmètre

Le catalogue commun reste initialisé par des scripts. Un utilisateur connecté
dispose séparément de « Mes fichiers » : envoi, liste, aperçu et suppression
de ses propres audios et images. Les fichiers restent sur le serveur et sont
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
OGG et Opus constituent des cas représentatifs à vérifier. La version, les
capacités et les limites de FFmpeg utilisé seront documentées lors de la
production. Seuls les fichiers locaux envoyés sont traités : un fichier ne
doit pas provoquer la lecture d’une URL, d’un chemin arbitraire ou d’une
ressource externe. La présence de vidéo ne constitue pas un fichier audio
accepté dans ce parcours.

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
exact de cette variante sera fixé lors de la production et testé dans le
navigateur retenu. Aucun succès d’aperçu ne peut être revendiqué pour un format
accepté mais non lisible. Les images validées ont un aperçu image.

Choix de production du 13 octobre 2026 : chaque audio validé reçoit un aperçu
MP3 distinct à 128 kbit/s, 44,1 kHz stéréo, préparé dans le budget global
audio. Sa taille est bornée à 500 000 000 octets (refus 422 si dépassée), pour
borner aussi son téléchargement privé en Blob. L’original est conservé sans
modification ; les images utilisent leur original validé. La preuve de
lecture réelle dans Chromium reste requise avant la clôture du parcours.

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

## Interface HTTP à produire

Toutes les routes passent par HTTPS. Le préfixe externe est /api/media ; les
routes internes Media n’ont pas ce préfixe.

| Méthode et route externe | Résultat attendu |
| --- | --- |
| POST /api/media/assets | Recevoir exactement un fichier multipart, le valider et confirmer l’asset prêt avec 201 |
| GET /api/media/assets | Retourner avec 200 une liste bornée des fichiers prêts du compte, dans un ordre stable |
| GET /api/media/assets/:id/private-content | Retourner avec 200 les octets de l’aperçu autorisé |
| HEAD /api/media/assets/:id/private-content | Même contrôle et mêmes en-têtes que GET, sans corps |
| DELETE /api/media/assets/:id | Confirmer avec 204 une suppression terminée, sans corps |

L’objet public décrit id, usage, MIME confirmé, taille, durée audio éventuelle
et état. Il n’expose ni storageKey, ni chemin physique, ni secret. L’aperçu
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

Les erreurs JSON ont un code stable et un message exploitable sans détail
interne ; HEAD omet aussi les corps d’erreur. Le code ne transforme jamais un
échec de traitement ou de persistance en succès. Les limites Nginx/multipart
doivent laisser passer le fichier maximal et son enveloppe, en conservant les
limites propres aux avatars existants.

## Vérification du contrat

Les cas suivants ont une réponse unique dans les règles ci-dessus ; ce contrôle
documentaire ne remplace pas les tests futurs :

- Audio valide de 500 000 000 octets : admissible en taille, encore soumis au
  décodage et au budget ; un octet de plus : 413.
- Image PNG/JPEG/WebP de 25 000 000 octets et dimensions conformes : admissible ;
  5 000 × 5 000 pixels respecte les bornes, 8 192 × 8 192 les dépasse.
- Audio reconnu par le serveur mais non lisible localement : envoi permis,
  validation serveur et variante d’aperçu compatibles requises avant succès.
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

Les étapes suivantes devront démontrer ces cas sur une pile isolée, avec
deux comptes, concordance SQL/disque, redémarrages et vrai parcours navigateur.
Le Minor n’est acquis qu’après preuve des six exigences : types multiples,
validation client/serveur, stockage et droits, aperçu, progression et suppression.
