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
avec décalage (page-1)*pageSize au plus 2147483647 pour le stockage.
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

## Lecteur commun et file musicale

Les pages transmettent leur sélection au `MusicPlayerProvider`. Le moteur
`AudioPlayer` reste unique et ses événements réels déterminent lecture, pause,
chargement, position et durée. `PlayerBar`, `QueuePanel`, `MusicTrackRow` et
`TrackQueueActions` utilisent le même contexte ; aucun écran ne crée son lecteur.
`TrackDetails`, conservé pour compatibilité, utilise également ce contexte.

`services/music-queue.ts` contient uniquement les règles d’enchaînement. Une
occurrence possède sa propre identité, même lorsque plusieurs places portent
le même morceau. `entries` conserve l’ordre initial et les ajouts manuels,
`order` l’ordre réellement joué, `history` les 500 dernières transitions et
`forward` les retours en avant après précédent. Ces tableaux appartiennent au
lecteur : retirer un élément de la file ne modifie jamais une playlist serveur.
`services/playback-queue.ts` reste exclusivement la file d’envoi des mesures.

- Répétition désactivée : arrêt après la dernière occurrence.
- Répétition de file : retour au début ; un nouveau mélange est produit à chaque
  tour si l’aléatoire est actif, sans répétition immédiate de la même occurrence
  lorsqu’il existe plusieurs places.
- Répétition de morceau : une fin naturelle ouvre une nouvelle écoute de la même
  occurrence ; suivant manuel passe au prochain et s’arrête au dernier.
- Précédent après trois secondes revient au début. Avant ce seuil, il revient
  sur l’occurrence réellement écoutée précédemment ; sans historique il revient
  au début du morceau courant. Un retour au début conserve l’état lecture/pause.
- Activer l’aléatoire conserve le courant et mélange les suivants. Le désactiver
  restaure l’ordre initial autour du courant. Les doublons restent distincts.
- Lire ensuite insère immédiatement après le courant ; ajouter à la file place
  l’occurrence à la fin, dans l’ordre initial et dans l’ordre de lecture.

Une sélection d’album, EP, mixtape, single ou playlist conserve la liste entière
et démarre à la place cliquée. Les titres aimés chargent toutes les références,
puis leurs détails avec au plus huit requêtes simultanées, avant d’afficher les
lignes disponibles. La file dépasse donc les 24 lignes visibles ; sur une très
grande bibliothèque, le chargement initial attend ces détails. Le changement de
page visuelle ne relit pas les détails déjà obtenus. Recherche et historique
lancent un seul titre ; le hub et la page artiste lancent leurs titres affichés.
Une recherche, une navigation ou un filtre ne réécrit pas une file déjà lancée.

Le clic sur une ligne lance ou reprend le titre ; s’il est déjà en lecture, il
ne le recommence pas. Les doublons explicites des playlists ciblent leur place.
Boutons, menus, liens, champs et sélection de texte restent indépendants.
Entrée et espace activent une ligne focalisée ; espace commande aussi le lecteur
hors des éléments interactifs et des dialogues. Échap ferme la file et restaure
le focus du bouton d’ouverture. Les animations respectent la réduction des
mouvements. La hauteur réelle de la barre fixe réserve de la place dans les pages.

## Reprise locale et indisponibilités

`storage/player-storage.ts` valide un document versionné par compte dans
`localStorage` : identifiants et ordre des occurrences, parcours récent, source,
position en secondes, volume, sourdine, répétition et mélange. Aucun jeton, profil
ou URL audio n’est sauvegardé. Le stockage est limité à 10 000 occurrences ;
une erreur de quota ou un document invalide n’empêche pas la lecture en mémoire.
Les invités conservent leur état uniquement pendant la navigation courante.

Après reconnexion au même compte dans le même navigateur, les métadonnées sont
relues auprès de Catalogue et la position est bornée à la durée réelle après
chargement. La reprise reste en pause et n’ouvre aucune session d’écoute avant
lecture effective. Une nouvelle sélection invalide toute restauration en cours.
Un autre compte ne charge jamais la reprise du précédent. Fermer le lecteur
vide la file sauvegardée mais conserve volume et modes. Il n’y a pas de
synchronisation entre appareils ni de changement de persistance de connexion.

Un 404 confirmé pendant la restauration retire la référence ; une panne réseau
ou serveur conserve la copie locale et propose une nouvelle tentative. Pendant
la lecture, un fichier illisible est sauté. Chaque occurrence en échec est
mémorisée pour arrêter une file entièrement indisponible, y compris en répétition.
Une panne réseau ou un refus de lecture automatique demande une action explicite.
Les erreurs de suivi d’écoute restent visibles avec leur reprise indépendante ;
les messages techniques de sauvegarde réussie n’encombrent pas la barre.

## Vérifications du lecteur

Depuis `frontend` : `npm run lint`, `npm run build`, `npm run test:music`.
Les tests sans navigateur couvrent l’horloge, les envois de suivi, les transitions
et la validation du stockage. Depuis la racine : `bash tests/projects/run.sh`
exécute les parcours projets, puis `verify-player.mjs`, dans la seule pile jetable
`transcendence_projects` sur le port 5445. Les prérequis Chromium sont ceux de
`tests/files`. Le runner reconstruit les images et supprime uniquement sa pile.
Les anciens parcours avec témoins PostgreSQL restent dans `tests/music`.

Le scénario lecteur utilise de vrais comptes, playlists, audios et sessions.
Les 127 références de titres aimés et leurs détails sont simulés pour vérifier
les deux niveaux de pagination ; les octets audio restent réels. Les pannes
HTTP et réseau sont injectées explicitement dans le navigateur de test. Ces
preuves ne constituent pas un test de charge ni une synchronisation multiappareil.

### Chargement sans déplacement

Le bouton central passe en lavande pendant le chargement. Un anneau décoratif
apparaît après 200 ms, sans changer la taille du bouton ni de la barre. Son animation
est supprimée avec son élément au changement de titre ou à la fin de l’attente ;
la préférence de réduction des mouvements conserve seulement l’anneau fixe.
Le statut reste annoncé aux lecteurs d’écran. Les erreurs et leur reprise restent visibles.

### Pochettes absentes

`EmptyArtwork` fournit une croche SVG commune aux titres, projets, playlists,
formulaires et lecteur. Le contexte fixe la taille et la couleur ; l’icône occupe
la moitié centrale de la boîte, sans métrique de police ni marge sous la vignette.
Les images privées passent toujours par une lecture authentifiée ; une image
absente, en attente ou illisible conserve la boîte de remplacement.
