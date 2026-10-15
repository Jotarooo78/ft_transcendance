# Tests des audios privés et de leurs pochettes

La campagne suit le [contrat des fichiers](../../docs/music/FILES_CONTRACT.md) :
un audio obligatoire, une pochette facultative, des lectures réservées au
propriétaire et des originaux conservés sans modification.

## Lancer la campagne

Depuis la racine du dépôt, avec Node 22, npm et Docker Compose disponibles :

```bash
tests/files/run.sh
```

Le runner compose `tests/music/compose.yml` et `tests/files/compose.yml`, sans
lire le `.env` de développement. Il construit les images, applique les six
migrations et les permissions, crée deux comptes par les vraies routes
d’inscription puis exécute les tests. Les identifiants de cette configuration
sont publics et réservés à cette base jetable.

| Cible | Valeur |
| --- | --- |
| Projet Compose | `transcendence_audio_cover` |
| HTTPS | `https://127.0.0.1:4443` |
| Base dans ce projet | `transcendence_music` |
| Volumes | `transcendence_audio_cover_music_{db,media,avatar}_data` |
| Réseau | `transcendence_audio_cover_default` |

Le runner refuse les ressources préexistantes de ce projet, même un volume
portant le nom attendu sans label Compose. Il vérifie les noms résolus et le
port local avant de créer les ressources. Sa sortie nettoie seulement sa pile
et ses trois volumes. La pile `common_repo` continue à fonctionner pendant
la campagne. Aucun déploiement ni remplacement de ses volumes n’est effectué.

Les journaux de construction, comptes jetables, UUID et empreintes restent
dans un dossier `/tmp/transcendence-files-*` privé. Les jetons ne sont pas
écrits dans ces témoins. Playwright conserve une capture locale seulement en
cas d’échec ; ces artefacts et les dépendances sont ignorés par Git.

## Preuves complémentaires

Les tests Media exécutent de vrais FFmpeg et Sharp, le décodeur image. Leurs
doublures SQL sont signalées dans les fichiers de test. Ils vérifient les
formats WAV, FLAC, MP3, AAC/M4A, Ogg et Opus, les images PNG/JPEG/WebP, les
budgets de temps/mémoire, les annulations, les collisions de fichiers et la
reprise d’un résultat SQL incertain. Une vraie vidéo reste refusée.

`verify-files.mjs` utilise HTTPS, PostgreSQL et le volume réellement monté :

- MP3 avec PNG ou JPEG intégrés ; MP3 valide avec pixels de pochette
  corrompus ou dimensions excessives : l’audio reste disponible et la pochette
  échouée produit un avertissement séparé.
- Image seule refusée ; ajout, remplacement et retrait d’une pochette ;
  remplacement manuel prioritaire sur la pochette extraite ; refus conservant
  l’ancienne pochette. Les empreintes de l’original et de l’aperçu audio restent
  identiques.
- Compte B visant les UUID connus de A : refus des lectures, changements de
  pochette et suppressions. Les métadonnées SQL et les octets correspondent.
- Redémarrage Media puis PostgreSQL : UUID, pochettes, aperçus et empreintes
  persistants. Des marqueurs d’interruption contrôlés prouvent la conservation
  d’une image confirmée en SQL et le nettoyage d’une installation non confirmée
  ou d’une image retirée.
- Remplacement de pochette et suppression audio réellement bloqués ensemble
  sur une ligne PostgreSQL : aucune association tardive ni octet orphelin après
  libération du verrou.
- Suppression concurrente/idempotente ; refus lorsqu’une référence Catalogue
  existe ou que son contrôle est indisponible. Après nettoyage, seuls les trois
  originaux WAV de démonstration restent sur le volume.
- Non-régression des avatars, du catalogue, des playlists privées et du suivi
  d’écoute. Un upload seul ne devient pas public ; la publication exige une opération Catalogue distincte.

`browser.spec.mjs` vérifie le nouveau formulaire avant publication : pochette
intégrée et annulation, image optionnelle invalide sans perte audio, refus des
images seules et audios corrompus, puis changement de session pendant l’envoi.
Un scénario avec événements XHR et réponses simulés contrôle aussi le passage
de 99 % à la préparation animée, le conseil après huit secondes, les champs
éditables, les animations réduites et l’annulation. La publication reste bloquée
jusqu’à une confirmation de fichier prêt ; ce scénario ne teste pas le serveur.
Le parcours public complet est couvert par `tests/publication/run.sh` : vrais
comptes, publication, artiste actuel, pochettes, lecture et playlists.

Pour relire un témoin pendant une campagne en cours, les phases disponibles
sont `initial`, `verify`, `catalog-down`, `non-regression` et `delete`. Elles
visent uniquement la pile isolée et n’initialisent pas les données à elles
seules. Ne pas exécuter une phase en parallèle du runner qui la gère déjà.

## Relier les fichiers

`register-file-upload.ts` reçoit les audios et les images associées.
`decode-file.ts` contrôle toute la piste audio ; les en-têtes des images
attachées sont lus sans décoder leurs pixels pendant cette validation.
`extract-audio-cover.ts` extrait et valide la pochette séparément sous budget.

La pochette est une `Variant` de l’audio avec `renditionKey=cover`, pas un asset
image indépendant. `database/save-audio-cover.ts` verrouille la ligne audio
avant toute modification. `save-audio-cover.ts` installe les octets sous une
clé aléatoire, conserve les marqueurs de reprise et nettoie les anciennes
variantes `retired-cover-*`. `delete-file.ts` relit les variantes après passage
à `deleting`, lorsque toute nouvelle association est interdite.

Le frontend confirme l’audio avant de transférer la pochette manuelle. Il
présente une erreur de pochette séparée et permet de la remplacer ou de
continuer sans image avant publication. `AudioCover.tsx` et `FilePreview.tsx` téléchargent des octets authentifiés,
révoquent leurs URL Blob locales et refusent les réponses d’un ancien compte.

## Portée des résultats

Une campagne ne prouve pas tous les codecs ni toutes les charges. Les limites
500 Mo audio, 25 Mo image, 300 s/512 Mio audio et 30 s/256 Mio pochette restent
les bornes du contrat ; un contenu doit aussi être entièrement valide. Les
tests ne valident pas la compréhension de l’utilisateur et ne publient aucun
morceau utilisateur dans Catalogue.

La campagne complète a réussi le 14 octobre 2026 : 26 tests Media, 10 tests
d’écoute frontend, lint/compilation, toutes les phases HTTPS et quatre parcours
Chromium, avec suppression des fixtures et nettoyage des trois volumes vérifiés.
Outils observés : Node 22.23.2, FFmpeg 8.1.2 et Playwright 1.63.0 avec Chromium.
La révision de base affichée par cette exécution était `3d52753` ; les corrections
et scénarios validés ont été publiés dans `4ef162c` sur `fix/audio-cover-upload`.
