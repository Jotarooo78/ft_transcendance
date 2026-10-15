# Publication de morceaux

Depuis la racine : `bash tests/publication/run.sh` avec Docker Compose, Node 22
et Chromium installé par `npm ci --prefix tests/files && npm run install:browser --prefix tests/files`.
La pile `transcendence_publication` utilise le port local HTTPS 4445 et trois
volumes dédiés. Elle refuse les ressources préexistantes et supprime uniquement
celles qu’elle crée. Aucun `.env` de développement n’est chargé.

Le scénario crée de vrais comptes, envoie les octets et vérifie les écritures
PostgreSQL : propriété de l’audio, publication répétée sans doublon, refus d’une
identité fournie par le client, pochettes publiques uniquement après publication,
nom actuel de l’artiste, playlist d’un second compte, expiration des uploads et
publication concurrente avec une suppression. Chromium utilise ensuite les vrais
formulaires pour publier, écouter et consulter le profil artiste. Le retrait et
le remplacement de pochette, le mobile, la correction après un refus explicite,
une réponse perdue après publication,
les fichiers corrompus et la persistance après redémarrage sont aussi vérifiés.

Les deux MP3 signalés par l’utilisateur sont lus depuis leurs chemins Windows
montés lorsqu’ils existent ; ils ne sont ni copiés dans le dépôt ni publiés hors
de la pile locale isolée. Sur une autre machine, des témoins synthétiques les
remplacent. Les captures restent dans `/tmp/publication-{desktop,mobile}.png`.
Ces tests ne prouvent pas toutes les charges ni tous les codecs.

Pour mettre la fonctionnalité en service dans la pile de développement :
construire Media, Catalogue, Users, frontend et Nginx, ainsi que les images de
migration Media et Catalogue ; sauvegarder la base avant les migrations, appliquer
les permissions, recréer les conteneurs concernés, puis vérifier les identifiants
d’images actifs et le parcours HTTPS. Un simple redémarrage conserve l’ancienne
image et ne livre donc pas le nouveau code.
