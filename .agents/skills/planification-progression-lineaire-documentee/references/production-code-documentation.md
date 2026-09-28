# Production de code, documentation et checkboxes au bon moment

Lis cette référence lorsqu'un parcours contient la création ou la modification de code, d'un script, d'une configuration ou d'un autre fichier que l'utilisateur devra produire.

## Le modèle mental : annoncer, produire, puis prouver

Une exigence peut être connue longtemps avant que son fichier existe. Ne confonds jamais ces trois états :

```text
Spécification : « le futur script devra refuser un nom inattendu »
       ↓ lorsque ses dépendances existent
Production : écrire le script et les fichiers qu'il orchestre
       ↓ après exécution réelle
Validation : « le script refuse effectivement ce nom »
```

Une étape de conception peut annoncer une contrainte future. Elle ne doit pas contenir une checkbox laissant croire que le comportement existe déjà ou doit être produit immédiatement.

Avant d'écrire le parcours, cartographie pour chaque fichier significatif :

- l'étape où son besoin est expliqué ;
- les fichiers, décisions ou services dont il dépend ;
- l'étape la plus tôt où il peut être produit sans anticiper la suite ;
- le contrôle capable de prouver son résultat ;
- les étapes qu'il débloque ensuite.

Utilise cette carte pour ordonner le cours. Ne l'affiche que si elle aide réellement le lecteur.

## Signaler exactement l'endroit où produire du code

Au moment précis où les prérequis d'un fichier sont disponibles, ajoute dans le cours un petit callout intitulé :

**🛠️ Endroit où il faut produire du code**

Place-le avant l'action de production, pas au moment où le fichier est seulement évoqué pour la première fois.

Le callout doit répondre simplement à ces questions :

1. **Que faut-il produire maintenant ?** Donne le chemin exact du fichier et son rôle immédiat.
2. **Que couvrait le code déjà montré ?** Explique si l'extrait précédent servait à comprendre un mécanisme, illustrer une forme ou fournir l'implémentation complète.
3. **L'extrait suffit-il ?** Écris explicitement l'une de ces conclusions :
   - `Le code montré dans le cours est suffisant pour cette étape. Aucun code supplémentaire n'est à inventer.`
   - `Le code montré expliquait seulement <A>, parce que <raison>. Il reste maintenant à produire <B et C>.`
4. **Que reste-t-il à produire dès cette étape ?** Limite la liste à ce qui peut et doit être réalisé maintenant avec les dépendances disponibles.
5. **Que ne faut-il pas encore produire ?** Nomme les fichiers ou comportements reportés lorsqu'ils constituent un détour plausible.
6. **Comment demander l'aide de l'agent ?** Donne une phrase directement réutilisable, par exemple : `À cet endroit, tu peux me demander de produire <fichier> en respectant <contraintes déjà comprises>.`

Le callout doit enlever une ambiguïté, pas créer un nouveau mode d'emploi parallèle. Garde le raisonnement pédagogique dans le cours et utilise le callout comme point de passage concret vers la production.

### Lorsque l'extrait du cours est complet

Dis clairement que l'utilisateur peut créer le fichier à partir de cet extrait et qu'aucune génération supplémentaire n'est requise. Indique malgré tout comment vérifier que le fichier copié correspond au chemin, au contenu et au rôle attendus.

### Lorsque l'extrait est seulement illustratif

Ne laisse jamais penser qu'il suffit à faire fonctionner l'étape. Explique :

- l'idée précise que l'extrait démontrait ;
- pourquoi le cours n'a pas affiché le fichier entier ;
- les parties encore nécessaires maintenant ;
- les contraintes déjà décidées que le code produit devra respecter ;
- le test qui permettra de savoir si la production est complète.

## Créer la documentation Notion lorsqu'un fichier est produit

Lorsqu'à la demande de l'utilisateur un fichier est réellement créé, crée aussi sa note de documentation dans Notion. Cette obligation concerne chaque fichier source, script ou configuration explicitement demandé. Elle ne s'étend pas automatiquement aux fichiers générés par un outil, aux caches, aux lockfiles ou aux artefacts de build, sauf demande explicite.

Crée la documentation une fois le contenu du fichier suffisamment stabilisé pour être décrit fidèlement. Si le fichier change encore pendant la même intervention, mets la note à jour avant de considérer le travail terminé.

### Découvrir les conventions avant d'écrire

Avant la première documentation du workflow :

1. inspecte la base Notion utilisée pour les notes `Documentation` ;
2. inspecte ses templates et une note existante représentative ;
3. identifie le template adapté au type de fichier ;
4. identifie les propriétés et relations canoniques vers l'Action ou la sous-action ;
5. réutilise les conventions réelles de titre, statut et relations sans inventer de propriété.

Crée une note par fichier explicitement demandé, sauf instruction contraire de l'utilisateur. Relie-la à la sous-action où le fichier est produit ; utilise l'Action parente uniquement si le fichier concerne réellement plusieurs sous-actions ou si le modèle de données l'impose.

### Écrire dans le premier callout marron

Dans la page créée depuis le template, parcours les blocs de haut en bas et écris le contenu documentaire dans le **premier callout marron** rencontré. Préserve le reste du template.

N'utilise pas un autre callout ou une section arbitraire comme solution de repli. Si aucun premier callout marron ne peut être identifié avec certitude, n'écris pas au mauvais endroit : signale l'ambiguïté et demande où placer le contenu.

La documentation doit expliquer uniquement ce qui permet de comprendre, utiliser et maintenir le fichier :

- son chemin et sa responsabilité ;
- sa place dans le flux de la sous-action ;
- ce qu'il reçoit et ce qu'il produit ;
- ses dépendances importantes ;
- les choix structurants déjà validés ;
- comment il est appelé ou exécuté ;
- comment vérifier son comportement ;
- les limites utiles et ce qui est volontairement reporté.

Adapte cette liste au fichier. N'ajoute pas des rubriques vides ou du contexte général qui ne l'aide pas à remplir son rôle.

### Citer le code sans recopier le fichier

Place les extraits exacts au moment où ils illustrent une idée précise :

- cite le chemin source ;
- conserve seulement les lignes nécessaires ;
- introduis l'extrait par ce qu'il faut observer ;
- explique juste après ce que ces lignes font dans ce fichier ;
- utilise `Avant` et `Après` seulement si la transformation elle-même est importante ;
- masque les secrets et ne copie jamais des identifiants sensibles.

Pour un petit fichier dont chaque ligne est nécessaire à la compréhension, le contenu complet peut être pertinent. Pour un fichier volumineux, ne le réécris jamais entièrement dans Notion : le dépôt reste la source de vérité et la documentation sélectionne les passages qui expliquent son fonctionnement.

N'invente aucun extrait. Si le fichier n'a pas encore été produit ou inspecté, indique que la documentation ne peut pas encore citer son code final.

### Relier la documentation au cours

Après avoir créé la note :

1. retourne à la page de la sous-action ;
2. trouve le callout **Endroit où il faut produire du code** correspondant ;
3. ajoute le lien de documentation au plus près de l'action ou de la checkbox `Produire <fichier>` ;
4. préserve l'ordre du cours et le contenu déjà présent ;
5. ne duplique pas un lien existant.

Le lecteur doit rencontrer le lien au moment où il produit le fichier, pas dans une liste lointaine sans contexte.

Après l'écriture, re-fetch les deux pages et vérifie :

- que le contenu se trouve dans le premier callout marron du template ;
- que la relation pointe vers la bonne Action ou sous-action ;
- que les extraits correspondent au fichier réellement produit ;
- que le lien apparaît près du point de production dans le cours ;
- que la note ne prétend pas qu'un contrôle non exécuté a réussi.

Si Notion est indisponible, prépare la note complète et le lien à insérer, puis indique précisément les opérations restantes. Ne prétends pas avoir créé ou relié la documentation.

## Placer les checkboxes sans anticiper la suite

Une checkbox est une promesse locale : le lecteur doit pouvoir accomplir ou vérifier ce qu'elle dit au moment où il la rencontre.

Avant d'ajouter une checkbox, applique le **test de localité** :

1. L'objet mentionné existe-t-il déjà ou doit-il être produit dans cette étape ?
2. Toutes ses dépendances ont-elles été introduites et produites ?
3. Peut-on satisfaire la checkbox sans exécuter une étape ultérieure ?
4. Le résultat est-il observable maintenant ?
5. Existe-t-il un contrôle permettant de décider honnêtement si elle peut être cochée ?

Si une seule réponse est non, la checkbox arrive trop tôt. Déplace-la vers l'étape de production ou de vérification appropriée. À l'étape actuelle, transforme l'idée en phrase de spécification future, sans case à cocher.

### Distinguer les trois formulations

Pendant la conception :

```markdown
Le futur `run.sh` devra refuser tout nom de projet différent de `transcendence_per`.
```

Au moment de produire le fichier :

```markdown
- [ ] Produire `tests/per/run.sh` avec une garde sur le nom du projet.
```

Après avoir exécuté le test pertinent :

```markdown
- [ ] Vérifier qu'un nom inattendu est refusé avec un code de sortie non nul.
```

Ne pré-coche la dernière case que si le test a réellement été exécuté et si sa preuve est connue. Dans une planification, toutes les validations futures restent décochées.

### Empêcher une checkbox de provoquer une cascade prématurée

Avant de placer une case, demande : « Si l'utilisateur essaie de la cocher maintenant, quels fichiers serait-il obligé de produire ? »

Si la réponse inclut des fichiers prévus dans des étapes suivantes, la case doit être déplacée. Par exemple, prouver trop tôt une garde dans `run.sh` peut obliger à produire aussi tous les scripts SQL qu'il orchestre. L'étape de conception doit seulement annoncer la garde ; la preuve appartient à l'étape où `run.sh` et ses dépendances existent.

Si l'utilisateur demande de produire des dépendances futures uniquement parce qu'une checkbox mal placée semble l'exiger :

1. explique que la case anticipe la progression ;
2. corrige son emplacement ou sa formulation ;
3. indique ce qui suffit réellement pour terminer l'étape courante ;
4. ne produis pas automatiquement toute la chaîne future, sauf demande explicite d'élargir le périmètre.

### Checkboxes de fin d'étape

Chaque étape numérotée doit se terminer par au moins une checkbox. La fin d'une étape ne contient que des cases portant sur :

- les décisions prises à cette étape ;
- les artefacts effectivement produisibles à cette étape ;
- les observations et preuves exécutables immédiatement ;
- la compréhension minimale qu'il est possible de reformuler à ce stade ;
- les conditions nécessaires pour passer à l'étape suivante.

Pour une étape théorique qui ne produit encore rien, utilise une case de reformulation précise, par exemple :

```markdown
- [ ] Je sais expliquer pourquoi le rôle de bootstrap doit exister avant les rôles applicatifs et pourquoi il n'est pas transmis aux services HTTP.
```

Évite les cases décoratives telles que « J'ai lu cette étape », les exigences lointaines et les formulations impossibles à vérifier. Chaque case doit aider le lecteur à savoir s'il peut avancer sans le pousser à anticiper le reste du parcours.

## Contrôle final de la progression

Avant de livrer ou de mettre à jour le cours, relis chaque étape dans l'ordre et vérifie :

- qu'un fichier est seulement annoncé avant que ses dépendances existent ;
- que le callout de production apparaît exactement quand il devient produisible ;
- que le cours dit si ses extraits sont complets ou illustratifs ;
- que chaque fichier demandé possède sa documentation liée après sa production ;
- que la documentation est écrite dans le premier callout marron ;
- que les extraits de code sont exacts, courts et placés au bon endroit ;
- que chaque étape numérotée se termine par au moins une checkbox locale ;
- qu'aucune checkbox ne requiert un artefact ou une preuve d'une étape future ;
- qu'aucune case n'est cochée sans résultat réellement vérifié.
