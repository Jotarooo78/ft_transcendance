# Interface FT Music

L’interface React et TypeScript utilise Vite. Elle propose le français, l’anglais
et l’espagnol sur les pages publiques et dans l’espace connecté, sans dépendance
de traduction supplémentaire ni appel à un service de traduction.

## Choix de langue

Le choix suit cet ordre :

- préférence valide enregistrée sous `ft-music-language` dans le stockage local du navigateur ;
- première langue prise en charge dans les préférences du navigateur ;
- anglais si aucune préférence ne correspond.

Les variantes régionales sont reconnues : `fr-CA` utilise le français et `es-MX`
l’espagnol. Une préférence enregistrée invalide est ignorée. Si le stockage est
interdit ou plein, le choix reste utilisable en mémoire pendant la visite.

Le sélecteur **Français · English · Español** est présent sur les pages
connexion/inscription, les liens publics et les pages du compte. Le choix est
propre au navigateur et reste actif après déconnexion ; il n’est pas enregistré
dans le compte. La langue déclarée dans le document HTML suit le choix.

Changer de langue conserve les composants montés : la navigation, les saisies,
les brouillons en cours, le transfert d’un fichier et le moteur audio continuent.
Les titres, biographies, descriptions et noms saisis par les utilisateurs sont
conservés dans leur langue d’origine.

## Organisation des fichiers

| Emplacement dans `src/` | Responsabilité |
| --- | --- |
| `translations/en.ts`, `fr.ts`, `es.ts` | 583 textes par langue, avec les mêmes clés et paramètres. L’anglais définit le contrat commun vérifié par TypeScript. |
| `services/language.ts` | Détection, préférence locale, langue du document et notifications de changement. |
| `hooks/useLanguage.ts` | Abonnement React au choix de langue, sans recréer les composants. |
| `services/translate.ts` | Traduction, interpolation des valeurs, erreurs connues, pluriels, dates et nombres. |
| `services/validate-form-language.ts` | Messages de validation des champs HTML dans la langue choisie. |
| `components/LanguageSelector.tsx` | Sélecteur commun accessible au clavier. |
| `main.tsx` | Application de la langue et installation des validations avant le premier affichage. |

Les composants traduisent les textes au moment de l’affichage. Les services
conservent leurs messages et codes de réponse existants : une erreur déjà
visible peut ainsi changer de langue sans refaire la requête. Les erreurs
connues sont traduites, y compris les messages variables ; une erreur inconnue
reçoit un message générique traduit.

Les dates d’écoute utilisent la langue sélectionnée et le fuseau du navigateur.
Les dates de publication sans heure sont formatées en UTC pour conserver leur
jour. Les nombres et pluriels suivent les règles de la langue choisie.

Les sections de bibliothèque regroupent les playlists créées et enregistrées,
les favoris et l’historique. Les nouveaux formulaires, tris, sélections multiples,
pochettes, confirmations de doublons et actions d’annulation utilisent les mêmes
dictionnaires. Les noms des playlists et morceaux restent inchangés. Les erreurs
déjà visibles et les saisies du formulaire suivent le changement de langue sans
recommencer une création ou un envoi.

La file de lecture distingue une origine applicative à traduire, comme
« History », d’un titre utilisateur identique. Cette distinction est conservée
avec la file. Une ancienne sauvegarde sans cette information garde son libellé
original jusqu’à une nouvelle sélection ; ses morceaux et préférences restent
utilisables.

## Ajouter ou modifier un texte

1. Ajouter la phrase anglaise dans `translations/en.ts`, puis sa traduction sous
   la même clé dans `fr.ts` et `es.ts`.
2. Utiliser des paramètres entre accolades pour les valeurs variables, afin de
   conserver les titres et autres données utilisateur :

   ```tsx
   t("Artwork for {0}", { "0": track.title })
   ```

3. Abonner le composant avec `useLanguage()` et appeler `translate` à
   l’affichage. Utiliser `translateCount` pour les nombres de morceaux, amis et
   secondes, `formatNumber` pour les quantités et `formatDate` pour les dates.
4. Pour un message conservé dans un état React, garder sa forme d’origine et
   appeler `translateError` à l’affichage. Cette fonction couvre aussi les
   notifications connues de réussite. Ajouter les nouveaux messages variables
   au dictionnaire et à leurs vérifications.
5. Traduire également les noms accessibles, aides, infobulles, confirmations,
   erreurs et états vides. Les clés techniques des services et les valeurs
   envoyées au serveur restent stables.
6. Exécuter les contrôles ci-dessous.

Les paramètres sont rendus comme du texte React ; aucune traduction n’injecte
une chaîne HTML dans la page. Les dictionnaires sont chargés avec l’application.
Les fenêtres du système de fichiers et les boutons natifs des boîtes de
confirmation dépendent du navigateur ; le texte de confirmation fourni par
l’application et les validations des champs sont traduits.

## Vérifications locales

Depuis la racine du dépôt, avec les dépendances frontend installées :

```sh
npm ci --prefix frontend
npm run build --prefix frontend
npm run lint --prefix frontend
npm run test:languages --prefix frontend
npm run test:music --prefix frontend
```

Les tests de langue couvrent la priorité des préférences, les variantes
régionales, le repli anglais, le stockage indisponible, la correspondance des
clés et paramètres, les erreurs, les pluriels et les formats. Le contrôle de
couverture inspecte 48 fichiers visuels : textes JSX, attributs accessibles et
clés explicites. Les expressions dynamiques et la qualité rédactionnelle
nécessitent aussi les scénarios navigateur et une relecture.

## Parcours navigateur

Les scénarios utilisent Chromium et la pile Docker jetable existante sur
`https://127.0.0.1:5445`. Ils créent leurs propres comptes et fichiers, sans lire
le `.env` de développement. Le runner refuse les ressources de test déjà
présentes et nettoie uniquement celles qu’il a créées, même après un échec.

```sh
npm ci --prefix tests/files
npm run install:browser --prefix tests/files
bash tests/projects/run.sh languages
```

La campagne ciblée `languages` est autonome. Pour exécuter également les
parcours de publication, bibliothèque, lecteur et actualisation :

```sh
bash tests/projects/run.sh
```

| Parcours contrôlé dans chaque langue | Preuve attendue |
| --- | --- |
| Inscription et connexion | Champs et validations traduits ; erreur réelle d’identifiants incorrects ; saisie conservée après changement de langue. |
| Profil et communauté | Modification du profil confirmée ; titres utilisateur conservés ; page des utilisateurs traduite. |
| Bibliothèque, playlists et recherche | État vide traduit, création réelle, brouillon conservé entre langues, erreur de pochette retraduite, sélection conservée et confirmation de doublons ; recherche sans résultat. |
| Historique et liens publics | Page d’historique traduite et erreur de projet inexistant traduite. |
| Publication | Un seul transfert réel malgré le changement de langue pendant l’attente ; publication confirmée. |
| Lecteur | Même élément audio, toujours en lecture, avec progression conservée après changement de langue. |
| Préférences et accessibilité | Détection, rechargement, déconnexion, stockage bloqué, sélecteur au clavier et bibliothèque sans débordement à 390 pixels. |

## Résultats vérifiés

Le 15 octobre 2026 : compilation, analyse ESLint, tests de langue, contrôle des
42 fichiers visuels et tests du lecteur réussis. Les suites existantes
`verify-projects`, `verify-player`, `verify-interface` et `verify-refresh` ont
passé sur la pile isolée. Après correction des attentes du nouveau scénario,
`bash tests/projects/run.sh languages` a terminé avec succès pour le français,
l’anglais et l’espagnol, nettoyage compris.

Les scénarios conservent la distinction entre services réels et pannes ou
réponses simulées : le nouveau scénario utilise des comptes, transferts et
publications réels ; il retarde volontairement une réponse de transfert pour
observer le changement de langue pendant l’attente. Les simulations des suites
existantes restent signalées dans leurs messages de résultat.

Après intégration de `feat/library-playlists-refresh`, le 15 octobre 2026 :
la compilation, ESLint, les tests de langue (583 clés, 48 fichiers visuels) et
les tests du lecteur et du tri des playlists passent. La campagne complète
`bash tests/projects/run.sh` a terminé avec succès, nettoyage compris :
publication, actions atomiques et pochettes de bibliothèque, lecteur,
actualisation et parcours français, anglais et espagnol. Les vérifications de
langue incluent désormais les nouveaux formulaires, les erreurs de pochette,
les sélections et confirmations de doublons. La bibliothèque reste contenue
dans la largeur de 390 pixels ; les onglets reviennent à la ligne, la pochette
passe au-dessus du texte et les actions des morceaux restent accessibles.
