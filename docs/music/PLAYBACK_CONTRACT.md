# Contrat du suivi d’écoute

Ce contrat est produit en ECO-1 ; les routes sont construites en ECO-2 à ECO-7.
Les sessions appartiennent au sujet UUID du JWT Auth vérifié. Aucun body ou
paramètre de requête ne peut choisir un autre compte. Playback utilise seulement
son schéma SQL ; l’ouverture consulte Catalogue par HTTP avec délai de 2 s.

## Trois valeurs distinctes

- Session : une tentative de lecture d’un morceau, identifiée par un UUID serveur.
- Position : emplacement actuel dans le média, en millisecondes ; peut reculer.
- Temps déclaré : cumul actif mesuré côté client, monotone, indépendant du seek.
  Event le conserve dans listenedMsTotal. Session.listenedMs contient seulement
  le temps crédité après plafonnement par l’horloge serveur.

Exemple théorique : lecture de 2 s puis déplacement à 5 s dans un fichier de 6 s.
La position vaut 5000, le cumul déclaré environ 2000 ; le crédit est au plus 2000.
Atteindre la fin par déplacement ne vaut jamais une écoute de toute la piste.

## Réponses

DTO Session : id, trackId, trackDurationMs, startedAt, endedAt (ISO UTC ou null),
listenedMs, lastSequence, positionMs. Durées/positions et séquences sont des
entiers JSON sûrs, non négatifs. trackDurationMs est strictement positif.
La position vient de l’événement lastSequence ; sans événement elle vaut zéro.
qualified et countingRuleVersion ne sont pas exposés comme résultats calculés.
Les réponses métier portent Cache-Control: no-store.

## Ouverture

POST /api/playback/sessions reçoit exactement {trackId: UUID} et renvoie 201.
Catalogue doit retrouver un morceau publié, avec durationMs entier positif sûr.
Cette durée est copiée dans trackDurationMs. Aucun accès Media ne s’effectue.
userId, durée et horodatage ne sont jamais acceptés du client. L’état initial
est listenedMs=0, lastSequence=0, endedAt=null. Une ouverture ne prouve aucune
écoute. Ce POST n’a pas de clé d’idempotence : après réponse perdue, le lecteur
signale l’incertitude et ne le répète pas automatiquement.

## Progression et transaction

PUT /api/playback/sessions/:id/progress reçoit exactement
{sequence, positionMs, listenedMsTotal}. sequence est compris entre 1 et
2147483647 (colonne SQL Int) ; les deux autres champs sont des entiers sûrs
positifs ou nuls. positionMs doit rester entre 0 et la durée de référence.
Le total déclaré peut dépasser la durée en cas de réécoute ; le crédit cumulé
ne dépasse jamais cette durée. Aucun timestamp client n’est accepté.

Sous verrou de la session du propriétaire, rechercher d’abord l’événement
de même séquence. S’il existe et que position/total sont identiques, répondre
200 avec l’état confirmé courant sans écrire, même si un événement plus récent
existe ou si la session est close. Un contenu divergent donne 409.

Pour une nouvelle séquence : session ouverte, sequence=lastSequence+1 et total
déclaré au moins égal à celui de l’événement précédent. Position arrière
autorisée. L’horloge est l’heure serveur relevée après acquisition du verrou.
Tolérance ajoutée : **0 ms**. Avec deltaDeclared=total-totalPrécédent,
le crédit ajouté est le minimum des quatre bornes non négatives suivantes :

- deltaDeclared ;
- temps écoulé depuis le dernier événement accepté (ou startedAt) ;
- temps écoulé depuis startedAt moins le crédit déjà acquis ;
- trackDurationMs moins le crédit déjà acquis.

Enregistrer Event (déclaration, position, receivedAt serveur) et mettre à jour
Session (crédit, lastSequence) dans une seule transaction. Une régression de
l’horloge donne une borne nulle ; elle n’ajoute pas de temps négatif. Cette
limitation ne prouve pas que la personne entend le son : un client reste capable
de déclarer une lecture fictive dans les bornes temporelles acceptables.

## Clôture et historique

POST /api/playback/sessions/:id/close sans body (ou objet vide) fixe endedAt
à l’heure serveur, au moins startedAt, sous le même verrou. Réponse 200 avec
DTO ; un nouvel appel conserve exactement la date. Aucun événement artificiel
ni temps supplémentaire. Une nouvelle progression après clôture donne 409 ;
un doublon identique déjà écrit reste confirmable.

GET /api/playback/sessions accepte page (défaut 1), pageSize (défaut 20,
maximum 100), et aucun autre paramètre. Retour {items,page,pageSize,total},
ordre startedAt décroissant puis UUID croissant, count/liste dans une même
lecture cohérente. Seules les sessions du JWT sont lisibles. Historique vide
ou page au-delà de la fin : 200. Catalogue n’est pas requis pour cette lecture ;
le frontend résout le titre séparément et conserve les faits si le titre manque.

## Refus et limites

- 400 invalid_request : forme, UUID, entier, bornes ou position invalides.
- 401 unauthorized : JWT absent, invalide, expiré ou sujet non UUID.
- 404 session_not_found : session absente ou appartenant à un autre compte.
- 404 track_not_found : morceau non publié ou absent à l’ouverture.
- 409 progress_conflict : ordre, total décroissant, contenu divergent ou clôture.
- 503 playback_unavailable : stockage ou dépendance Catalogue indisponible,
  réponse de durée invalide comprise. Un refus ne crée aucun événement.

Le lecteur mesure le temps actif avec une horloge monotone et l’avancement
audio, coupe les intervalles sur pause/attente/seek, et distingue sauvegarde et
lecture Media. Une seule progression est en vol ; son retry conserve exactement
séquence et contenu, avec un nombre borné de tentatives. Le dernier état peut
remplacer une mesure en attente, jamais une demande déjà envoyée.

Fin/changement de piste : progression puis close. Au démontage ou à la fermeture
d’un onglet, les envois restent au mieux ; dernières secondes non reçues et
session ouverte sont possibles. Aucun worker de clôture, reprise automatique,
analytics ou royalties n’est produit. R15 reste un seuil produit ouvert :
qualified=false et countingRuleVersion=1 restent leurs valeurs existantes,
sans règle de qualification activée.
