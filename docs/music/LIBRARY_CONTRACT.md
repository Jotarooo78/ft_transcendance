# Contrat des playlists privées — LIB-1

Une playlist appartient au sujet `sub` du JWT Auth vérifié par Library.
Le navigateur ne choisit ni propriétaire ni visibilité : cette API crée et
modifie exclusivement des playlists privées du compte authentifié. Les routes
techniques health/ready/metrics restent séparées de cette authentification.
Library ne lit que son schéma ; les références Catalogue passent par HTTP.

## Identités et représentation

Playlist : `{ id, name, description, version, items }`. Description absente
en SQL est normalisée en chaîne vide. Version est un entier JSON sûr positif,
issu du BigInt SQL après contrôle ; une valeur non représentable donne 503.
Chaque item est `{ id, trackId, position }`, ordonné par position croissante.
L’id d’item identifie une occurrence ; deux items peuvent partager trackId.
Playlist vide autorisée. Les UUID sont canoniques, insensibles à la casse.

La position est un entier SQL strictement positif. L’ajout utilise max+1 sous
verrou de playlist ; les suppressions laissent des trous sans réordonner.
Au-delà de la borne int32, l’ajout est refusé en 409 sans mutation.
Le contrat ne propose pas encore de réorganisation, partage ou favoris.

## Routes HTTPS et corps

Préfixe public `/api/library`, routes internes sans ce préfixe.

| Méthode et route | Corps ou paramètres | Succès |
| --- | --- | --- |
| GET /playlists | page défaut 1, pageSize défaut 20, maximum 100 | 200 `{items: Playlist[], total, page, pageSize}` |
| GET /playlists/:id | aucun | 200 Playlist |
| POST /playlists | name, description facultative | 201 Playlist, version 1, items vides |
| PATCH /playlists/:id | expectedVersion, name et/ou description | 200 Playlist confirmée |
| DELETE /playlists/:id | expectedVersion | 204, aucun corps |
| POST /playlists/:id/items | trackId, expectedVersion | 200 Playlist confirmée |
| DELETE /playlists/:id/items/:itemId | expectedVersion | 200 Playlist confirmée |

DELETE utilise un corps JSON explicite comme les autres mutations. Noms
trimés de 1 à 100 caractères Unicode ; descriptions trimées jusqu’à 2000.
Corps objet uniquement, champs inattendus refusés : ownerUserId, visibility,
id ou version ne sont jamais acceptés du client. PATCH exige au moins un
champ modifiable. expectedVersion est un entier positif sûr. Pagination :
entiers décimaux positifs sûrs, doublons et paramètres inconnus refusés.
Les listes sont triées par updatedAt décroissant puis UUID croissant et
filtrées par propriétaire, avec compte et page dans le même instantané SQL.

## Autorisation, transaction et répétition

JWT absent, expiré, signature incorrecte ou sub non UUID : 401 avant lecture
métier. Une ressource inconnue ou appartenant à un autre compte répond 404.
Le propriétaire est contrôlé avant l’appel Catalogue d’un ajout. Catalogue
doit renvoyer une piste publiée correspondante ; 404 donne track_not_found,
panne/timeout/corps invalide donne 503. Timeout de deux secondes.

Chaque mutation existante verrouille la ligne Playlist avec SELECT FOR UPDATE,
revérifie propriétaire et version puis écrit dans la même transaction. Deux
mutations concurrentes sur la même version ne peuvent pas réussir toutes deux.
L’ajout vérifie Catalogue avant la transaction, puis répète les contrôles
locaux sous verrou ; un retrait Catalogue ultérieur peut rendre une occurrence
indisponible sans la supprimer automatiquement. Aucun appel réseau sous verrou.

Une mutation effective incrémente version et updatedAt atomiquement. Version
périmée : 409, aucune écriture ; le client recharge puis demande une nouvelle
action consciente. Même valeur lors d’un PATCH valide compte comme mutation.

Retrait : contrôle version avant recherche de l’item. Item absent ou appartenant
à une autre playlist : 404, aucune modification. Répéter la demande avec l’ancienne
version après un succès donne donc 409 ; avec la version courante, 404. Ce refus
explicite évite de prétendre avoir supprimé une seconde occurrence.

Suppression de playlist : 204 après confirmation sous verrou ; répétition après
succès donne 404. La FK locale retire ses items. Aucun appel de suppression à
Catalogue ou Media ; les morceaux et les octets restent intacts.

| Statut | Code JSON d’erreur |
| --- | --- |
| 400 | invalid_request |
| 401 | unauthorized |
| 404 | playlist_not_found, item_not_found ou track_not_found |
| 409 | version_conflict ou playlist_limit |
| 503 | library_unavailable |

Les réponses d’erreur ne révèlent ni propriétaire étranger, ni détail SQL,
ni secret. Les réponses métier privées utilisent Cache-Control: no-store.

## Transition de l’interface

Les anciennes données localStorage et leurs fichiers restent intacts, mais ne
sont plus chargés ni enregistrés une fois LIB-8 raccordé. Aucun import implicite
n’est possible : l’ancienne clé ne prouve pas le compte propriétaire.
Les mutations encore locales sont désactivées jusqu’à leur raccord progressif.
L’interface attend le DTO confirmé, préserve saisie/état sur échec et ignore les
réponses d’une identité précédente. Les occurrences résolvent leur morceau via
Catalogue ; une piste retirée reste une ligne indisponible que l’on peut retirer.

## Vérification documentaire

Relu contre Playlist, PlaylistItem et les contraintes SQL : nom 100, description
2000, version BigInt, position positive unique par playlist, doublons trackId
autorisés et cascade locale. Ce contrat ne prouve pas encore les routes Library.
# Bibliothèque personnelle — contrat de l’évolution

La bibliothèque regroupe titres aimés, projets enregistrés, artistes suivis,
playlists et uploads du propriétaire. Aimer un titre, enregistrer un projet et
suivre un artiste sont trois actions indépendantes. Le suivi d’un artiste est
unilatéral et ne modifie pas les relations d’amitié de Users.

La création d’une playlist propose privé/public avec privé sélectionné. Une
modification ultérieure de visibilité demande une confirmation ; l’annulation
ne déclenche aucune écriture. Le succès est affiché après confirmation serveur.
Le propriétaire retrouve et édite ses playlists quelle que soit leur visibilité.
Une lecture publique expose uniquement une playlist actuellement publique ;
repasser en privé interdit les lectures suivantes sans promettre d’effacer une
copie déjà reçue par un visiteur. Une adresse stable permet de consulter la
playlist. Les mutations restent réservées au propriétaire et versionnées.

Les favoris et références enregistrées persistent côté serveur. Les opérations
d’ajout répétées convergent sans doublon. Une référence devenue indisponible ne
bloque pas la liste et ne révèle pas de données privées. L’historique conserve
ses sessions distinctes, du plus récent au plus ancien.

Ces règles sont la cible de la branche `feat/music-projects-library` ; la
validation fonctionnelle sera consignée après exécution réelle des contrôles.
