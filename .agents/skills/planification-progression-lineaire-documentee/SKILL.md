---
name: planification-progression-lineaire-documentee
description: Transformer une action en chaîne ordonnée de sous-actions unitaires, pédagogiques et vérifiables, et placer puis activer les choix X vs Y au moment réellement atteint. Utiliser pour préparer ou réécrire un plan d'exécution détaillé, notamment dans Notion. Ne pas utiliser pour créer en série des Ressources IA, un rapport post-action ou une question théorique isolée.
---

# Planification de progression linéaire et documentée

Ce skill transforme chaque page de sous-action en support principal d'une seule étape de travail. Le lecteur doit pouvoir y comprendre, agir, contrôler, diagnostiquer et prouver le résultat local sans reconstruire les éléments manquants. La page de l'action parente organise la progression ; elle ne duplique pas le détail exécutable des sous-actions.

Il planifie le travail. Il n'autorise pas à l'exécuter, à modifier d'autres pages ou à présenter une vérification comme réussie si l'utilisateur ne l'a pas demandé et si elle n'a pas réellement eu lieu.

## Résultat recherché

Produis un chemin unique et continu :

```text
état de départ → compréhension utile → action → contrôle → diagnostic → preuve finale
```

La théorie, les décisions, les commandes et les contrôles arrivent au moment où ils deviennent utiles. Évite de les répartir dans des sections ou rapports que le lecteur devrait consulter en parallèle.

Le niveau de détail doit permettre d'avancer sans devoir deviner :

- ce qu'il faut faire ensuite ;
- où le faire ;
- pourquoi cette étape existe ;
- quel résultat observer ;
- quoi examiner si le résultat diffère ;
- quand il est sûr de continuer.

## Établir le terrain réel avant d'écrire

Avant de rédiger ou de réécrire le parcours :

1. Lis entièrement l'action et toutes les sous-actions concernées.
2. Situe chacune dans la chaîne globale : entrée réelle, résultat propre, dépendances et étape suivante.
3. Inspecte le dépôt, la configuration, les migrations, les tests et la documentation strictement nécessaires.
4. Relève les vrais noms de fichiers, services, variables, routes, tables, scripts et commandes.
5. Distingue les faits observés, les déductions raisonnables, les décisions à prendre et les inconnues.
6. Repère les opérations risquées, les données à préserver et les possibilités d'environnement jetable.

N'invente jamais un fichier, un comportement, un résultat de commande ou un état du système. Si une information ne peut être connue avant l'exécution, place dans le parcours la commande ou l'observation qui permettra de la découvrir, puis explique comment les chemins possibles se rejoignent.

## Construire la progression

Commence par donner le cap en langage simple :

- ce qui fonctionnera à la fin ;
- pourquoi cette sous-action existe ;
- son point de départ vérifié ;
- ce qu'elle transmet à la suite ;
- ce qui reste volontairement hors périmètre.

Donne ensuite le modèle mental minimal du système. Lorsqu'il existe un flux, représente-le simplement, par exemple :

```text
requête → service responsable → traitement → stockage → réponse
```

Puis déroule le travail dans son ordre réel. Fais apparaître une notion juste avant sa première utilisation, une commande à l'endroit où elle doit être lancée et un contrôle immédiatement après ce qu'il vérifie.

Le parcours global se lit dans l'ordre des sous-actions. À l'intérieur de chaque sous-action, l'étape unique se lit de haut en bas comme une seule procédure. N'impose pas au lecteur de sauter entre une partie « théorie », une partie « commandes », une annexe de dépannage et une liste de preuves.

## Garantir que le parcours atteint la promesse de l'action

Avant de découper les sous-actions, formule la **promesse de l'action parente** à partir de son titre, de son résultat attendu et de son périmètre. Distingue les actions qui promettent seulement de comprendre ou de décider de celles qui promettent une transformation réelle du système.

Si l'action promet de créer, corriger, migrer, homogénéiser ou rendre fonctionnel quelque chose, sa chaîne ne peut pas se terminer sur un audit, une cartographie ou un arbitrage. Ces étapes préparent le changement ; elles ne l'accomplissent pas. Le parcours doit conduire explicitement jusqu'à :

```text
comprendre → décider si nécessaire → produire le changement → traiter l'existant → renforcer les garanties → prouver le résultat final
```

Adapte ces phases au besoin réel : n'ajoute pas une migration ou une contrainte lorsqu'elles sont hors périmètre. En revanche, ne déclare jamais le plan complet si aucun maillon ne produit le résultat promis ou si aucune dernière sous-action ne peut le prouver.

Un checkpoint juste-à-temps limite le **niveau de détail** disponible après la décision ; il ne coupe jamais la représentation du parcours. Lorsque l'option retenue est encore inconnue :

1. conserve le checkpoint à l'endroit où la décision devient nécessaire ;
2. fais tout de même apparaître après lui les phases invariantes nécessaires pour atteindre la promesse ;
3. crée leurs sous-actions lorsque leur objectif, leur ordre et leur résultat local sont déjà certains ;
4. indique dans ces pages quelles commandes, valeurs ou modifications exactes seront adaptées après le choix ;
5. n'invente ni branche retenue, ni migration finale, ni preuve déjà réussie.

Si même les phases invariantes ne peuvent pas encore être identifiées, présente explicitement la chaîne comme **incomplète jusqu'au checkpoint** ou renomme l'action parente pour refléter une simple exploration. Ne laisse jamais une action de transformation paraître entièrement planifiée alors que sa chaîne s'arrête à « choisir ».

### Overview obligatoire dans l'action parente

Place dans l'action parente une overview courte, lisible avant le détail, qui montre toute la progression jusqu'au résultat promis. Utilise par défaut un flux vertical simple plutôt qu'un tableau :

```text
SOUS-ACTION-1 : comprendre le terrain
        ↓
SOUS-ACTION-2 : mesurer le risque
        ↓
SOUS-ACTION-3 : choisir la stratégie
        ↓
SOUS-ACTION-4 : produire le changement
        ↓
SOUS-ACTION-5 : prouver le résultat final
```

Chaque ligne nomme la sous-action et son résultat local en langage courant. L'overview doit rendre immédiatement visibles le premier passage à l'action, les éventuelles étapes de migration ou de renforcement, et la preuve finale. Ajoute ensuite les mentions ou liens vers les pages pour permettre la navigation, sans recopier leur contenu opérationnel.

Après toute création, suppression ou réorganisation de sous-actions, actualise cette overview et vérifie qu'elle correspond exactement aux relations `previous` et `next in line`. Si le dernier élément visible est encore un diagnostic ou une décision alors que la promesse est une transformation, le plan est incomplet.

## Granularité et échelles d'organisation dans Notion

La **sous-action est l'unité d'action exécutable**. Une sous-action contient exactement une étape significative, avec son résultat propre, ses actions, ses contrôles, son diagnostic et ses checkboxes locales. Si une page contient plusieurs étapes numérotées qui peuvent être franchies séparément, scinde-les en autant de sous-actions. Si une étape reste trop large pour être exécutée et validée comme un seul passage, affine encore le découpage.

Les autres objets organisent le travail à des échelles différentes :

- le **GPR** porte la finalité ou le projet global ;
- le **groupe d'action** rassemble plusieurs actions cohérentes ;
- l'**action parente** porte le résultat commun, le périmètre, la carte et l'ordre du parcours ;
- la **sous-action** porte une étape unique et exécutable.

Dans la base Notion `Actions` :

1. inspecte le schéma réel et le template nommé `sub action` avant toute création ;
2. crée chaque sous-action depuis ce template, sans reconstruire manuellement ses blocs de statut ou de navigation ;
3. écris tout le contenu rédigé de la sous-action dans l'emplacement canonique du template : immédiatement sous les trois premiers boutons de statut, donc après le bouton `waiting`, et au-dessus de la vue inline `notes` ;
4. préserve les boutons et la vue `notes` fournis par le template : ne les recrée pas, ne les duplique pas et ne répartis pas le contenu rédigé ailleurs dans la page ;
5. laisse les boutons et les relations du template porter la navigation : ne répète pas au début du contenu rédigé des lignes `Action parente`, `Action suivante` ou `Étape suivante` ;
6. relie chaque sous-action à l'action parente avec les propriétés canoniques observées, notamment `Parent` et `Parent item` lorsqu'elles existent ;
7. recopie les relations `GPR` et `groupe d'action` de l'action parente sur chaque sous-action ;
8. relie la chaîne avec `previous` et `next in line` : la première n'a pas de `previous`, la dernière n'a pas de `next in line`, et chaque relation intermédiaire est réciproque ;
9. vérifie les relations inverses de la page parente, par exemple `Sub-item` ou `enfants`, sans les inventer ni les forcer si Notion les maintient automatiquement ;
10. conserve dans l'action parente une carte courte de la séquence, les limites communes et la condition de réussite globale, mais aucune étape d'exécution détaillée.
11. dans Notion, active toujours l’option **Renvoyer à la ligne** pour chaque bloc de code, en particulier lorsqu’il contient du texte naturel comme un prompt, une consigne ou une note. Si l’outil d’écriture ne permet pas de régler cette option, n’utilise pas un long bloc de code non replié : place le texte dans un callout ou des paragraphes qui se renvoient naturellement à la ligne, puis active l’option dans l’interface dès qu’elle est accessible.

Si le template `sub action` a changé et qu'une page existante doit être actualisée, conserve d'abord son contenu rédigé et ses propriétés, retire les anciens blocs de template pour éviter les doublons, applique la dernière version du template canonique, attends que son contenu soit effectivement disponible, puis réinsère le contenu rédigé dans cet emplacement canonique. Relis ensuite la page et vérifie que le statut, les relations et la chaîne n'ont pas été altérés.

Ne duplique pas commandes, diagnostics ou checkboxes entre l'action parente et ses sous-actions. La page parente sert à s'orienter ; la sous-action sert à agir. Lors d'une réécriture, déplace le détail existant vers les sous-actions au lieu de le laisser dans les deux niveaux.

## Contrat d'une étape

Dans Notion, ce contrat s'applique à l'étape unique portée par une sous-action. Une page de sous-action ne doit donc contenir qu'une seule étape numérotée, même si cette étape comporte plusieurs manipulations étroitement liées nécessaires à un même résultat local.

### Notions de cours et raisonnements clés

Immédiatement après le titre de l'étape numérotée et avant sa première explication ou manipulation, ajoute une checklist courte intitulée **Ressources IA à demander — ces cases ne valident pas l'étape :**. Elle inventorie les notions de cours que cette étape fait réellement rencontrer et constitue une entrée réutilisable par le skill local `creation-ressources-ia-liees`.

Écris chaque sujet comme un intitulé court, précis et autonome qui pourrait devenir le titre d'une Ressource IA. Garde le style direct observé dans PER-2 et n'ajoute aucun préfixe systématique comme `Vocabulaire —`, `Concept —`, `Nom technique —` ou `Raisonnement —`.

```markdown
**Ressources IA à demander — ces cases ne valident pas l'étape :**

- [ ] Collision après normalisation
- [ ] Transaction PostgreSQL en lecture seule
- [ ] `lower(btrim(username))`
```

Le nombre de sujets reste flexible et dépend de l'étape. N'ajoute que les termes, mécanismes, outils ou modèles nécessaires pour comprendre, exécuter ou diagnostiquer le travail local. Écarte les domaines trop larges et les approfondissements futurs.

Laisse une case décochée tant que la ressource correspondante n'a pas réellement été créée ou réutilisée. Cette checklist reste un inventaire simple : n'y ajoute ni lien, ni mention de page, ni explication longue. Préserve exactement ses libellés, son ordre et l'état de ses cases lorsqu'un autre skill s'en sert.

Ne confonds pas cette checklist d'entrée avec les checkboxes de passage placées à la fin de l'étape : les premières recensent les notions de cours disponibles à la capture ; les secondes prouvent que le résultat local de l'étape est atteint.

Lorsqu'une étape révèle une manière de penser transférable, une caractéristique importante du système, une pratique professionnelle ou une règle métier, ne transforme pas cette idée en long intitulé de checklist. Explique-la dans le déroulé, au moment exact où elle éclaire l'action, dans un callout pédagogique.

Utilise par défaut un callout `💡` jaune intitulé **Raisonnement clé**. Si la nature de l'enseignement l'exige, adapte seulement le titre en **Caractéristique à retenir** ou **Règle métier**, sans créer une taxonomie supplémentaire dans la checklist.

```markdown
<callout icon="💡" color="yellow_bg">
	**Raisonnement clé**
	Ce qu'on fait ici, c'est auditer avant de migrer. Une transformation apparemment simple peut créer des collisions ou perdre de l'information. Dans ce projet, l'audit mesure ce risque avant toute écriture. Cette pratique est courante lorsqu'une migration touche des données existantes.
</callout>
```

Le callout explique en quelques phrases : ce qui est fait ici, pourquoi ce raisonnement ou cette règle compte, comment il s'applique concrètement au projet et dans quelle mesure il est utilisé en pratique professionnelle. Distingue toujours ce qui est déjà employé dans le dépôt, ce qui est seulement planifié et ce qui relève d'une pratique générale.

N'ajoute pas un callout par habitude. Omet-le lorsqu'aucun enseignement transférable ne mérite d'être mis en évidence. N'affirme jamais qu'une pratique est courante, rare ou professionnelle sans base raisonnable ; formule l'incertitude ou reste factuel.

Chaque étape significative doit intégrer naturellement les informations utiles parmi celles-ci :

1. **But immédiat** — le petit résultat observable à obtenir maintenant.
2. **Modèle mental** — ce qu'il faut comprendre pour ne pas appliquer la consigne aveuglément.
3. **Point de départ** — l'état ou le code réellement observé.
4. **Choix** — l'approche retenue, sa raison et le compromis important.
5. **Action exacte** — fichier, emplacement, modification ou manipulation.
6. **Commande située** — dossier de départ, prérequis, commande et paramètres déterminants.
7. **Résultat attendu** — sortie, état, fichier, réponse ou comportement concret.
8. **Portée de la preuve** — ce que le contrôle démontre et ce qu'il ne démontre pas encore.
9. **Diagnostic immédiat** — causes probables et prochaine observation si le résultat diffère.
10. **Point de passage** — condition claire permettant de poursuivre.

Ne transforme pas systématiquement ces éléments en dix sous-sections. Intègre-les dans un déroulé naturel, assez riche pour ne laisser aucun trou opérationnel.

Ne remplace jamais une étape par une formule vague comme « configure correctement », « lance les migrations » ou « vérifie que cela fonctionne ». Donne la procédure permettant réellement de le faire.

### Produire un mini-rapport d'observation

Pour une étape d'audit, de cartographie, de normalisation ou d'inventaire transversal, répartis le travail ainsi :

```text
agent : inspection exhaustive du périmètre défini + sélection des preuves utiles + synthèse
utilisateur : observation des extraits + compréhension du problème + validation de la direction générale
```

L'inspection doit être exhaustive en arrière-plan dans le périmètre défini. En revanche, la restitution doit rester courte et sélective. Ne demande pas à l'utilisateur de remplir un inventaire, de produire une matrice exhaustive ou de revérifier manuellement chaque constat déjà examiné par l'agent.

Présente par défaut un mini-rapport plutôt qu'un grand tableau. Choisis le plus petit nombre d'extraits suffisant pour rendre le problème observable et préparer l'action suivante. Pour chaque observation retenue :

1. indique brièvement son emplacement réel ;
2. montre seulement les lignes nécessaires ;
3. explique en langage courant ce que fait l'extrait, notamment les termes, méthodes, opérateurs ou contraintes qui bloqueraient la compréhension ;
4. formule la conclusion que cet extrait permet de tirer pour le problème courant.

Utilise une structure légère comme celle-ci, sans en faire un moule rigide :

````markdown
#### Observation — [nom court]

**Emplacement :** `[fichier, route, table ou test]`

**Extrait observé**

```[langage]
[fragment minimal]
```

**Ce qu'on voit**
[explication simple du comportement et des éléments techniques utiles]

**Ce qu'on en conclut**
[lien avec le problème courant]
````

Dans Notion, lorsqu'un mini-rapport comporte plusieurs observations, applique la grammaire visuelle suivante pour rendre le raisonnement lisible sans transformer le rapport en tableau :

- numérote les observations dans leur ordre de lecture ;
- place chaque observation entière dans un callout `🤖` bleu ;
- place l'emplacement et l'extrait dans un callout brun portant l'icône code, avec le titre souligné **Emplacement** ; indique d'abord le rôle humain de l'emplacement, puis le chemin exact et enfin un ou plusieurs véritables blocs de code dans les langages appropriés ;
- dans ce même callout **Emplacement**, ajoute pour chaque observation issue d'une codebase une courte commande de lecture seule, à lancer depuis un dossier explicitement indiqué, qui permet de retrouver rapidement les lignes citées ; cible les fichiers et motifs de l'observation plutôt qu'une recherche globale, et présente toujours cette commande comme facultative ;
- place l'explication dans un callout `➡️` jaune intitulé **Ce qu'on voit ici** ; définis brièvement les opérations ou termes techniques nécessaires à la compréhension ;
- place l'interprétation dans un callout `✅` vert intitulé **Ce qu'on en conclut** ; relie explicitement l'extrait au problème courant ;
- garde les extraits minimaux et active **Renvoyer à la ligne** pour leurs blocs de code conformément aux règles Notion de ce skill.

Maintiens une traçabilité stricte entre l'extrait et l'explication : chaque comportement, opérateur, expression régulière, contrainte ou absence de traitement décrit dans **Ce qu'on voit ici** doit être directement observable dans les lignes affichées dans **Emplacement**. Si l'explication dépend de passages éloignés ou de plusieurs fichiers, montre plusieurs extraits courts et identifie leur chemin au plus près ; ne décris jamais comme visible un détail absent du code cité. La commande facultative sert à élargir le contexte de ces extraits, pas à réparer une preuve incomplète dans la page.

Le titre de la première observation peut simplement annoncer le premier fait :

```markdown
Observation 1 — Auth fabrique une valeur canonique
```

À partir de la deuxième observation, utilise un connecteur logique seulement s'il exprime une relation précise avec ce qui précède. Le connecteur indique la relation ; un référent explicite indique sa portée. N'écris donc pas un titre ambigu comme `Or, observation 3`. Nomme ce à quoi l'observation s'oppose, ce qu'elle ajoute ou le niveau qu'elle élargit :

```markdown
Cependant, contrairement à Auth, observation 2 — Users suppose que le username est déjà canonique

De plus, côté frontend, observation 3 — Les règles restent partielles et locales

Enfin, au-delà de ces différences entre points d'entrée, observation 4 — Le stockage ne garantit pas tout le contrat
```

Ne force pas une conjonction lorsqu'aucune relation précise ne mérite d'être annoncée. Après la dernière observation, synthétise leur effet commun avec une formulation comme **Ainsi, prises ensemble, ces observations montrent que…**. Introduis ensuite le pont vérifié vers l'action suivante par **Donc, …** afin de distinguer clairement la conclusion du rapport de la direction de la suite.

N'utilise un tableau que s'il rend une comparaison courte matériellement plus claire. Ne reproduis pas tous les fichiers inspectés : conserve seulement les observations qui changent la compréhension ou la décision. L'exhaustivité appartient au travail de l'agent, pas au volume imposé au lecteur.

Une commande de lecture seule peut rester disponible pour permettre à l'utilisateur de regarder le terrain s'il le souhaite. Présente-la comme facultative : son exécution n'est ni une tâche personnelle obligatoire, ni une condition de passage, ni une demande de revérification systématique.

Lorsque l'agent peut inspecter le terrain pendant la planification, rédige directement le mini-rapport à partir des faits observés. Sinon, insère un callout `🤖` intitulé **Production agentique** demandant à l'agent d'effectuer l'inspection exhaustive, de sélectionner les extraits nécessaires et de produire cette synthèse sans modifier le code ni les données.

Termine le rapport par **Ce qu'on retient pour la suite** : quelques phrases indiquant le problème principal compris, les divergences réellement importantes et la direction générale qui rend l'action suivante pertinente.

Avant d'écrire ce pont, inspecte la page Notion courante et sa relation `next in line`. Si elle contient exactement une action suivante, ouvre et lis réellement cette page ; fonde le pont sur son titre, son contenu et son résultat attendu observables. N'infère jamais la prochaine action depuis le seul contexte du dépôt ou depuis une séquence supposée.

Si `next in line` est vide, multiple, inaccessible ou insuffisamment documenté, signale l'incertitude et formule seulement ce qui reste à déterminer. Ne présente pas une action ou une solution comme vérifiée.

Anticipe la direction, pas l'exécution : explique ce que l'action suivante cherchera à obtenir, quelle partie du problème elle prendra en charge et, si la page le permet, le principe général de la réponse. Garde pour l'action suivante les fichiers à modifier, les commandes, l'implémentation détaillée et les arbitrages techniques.

Les checkboxes de passage portent seulement sur la compréhension et la continuité vérifiée, par exemple :

- [ ] Je peux expliquer simplement le problème observé.
- [ ] Je comprends ce que l'action suivante vérifiée dans Notion devra résoudre et son orientation générale.

Si aucune action suivante n'a pu être vérifiée, adapte la seconde case à la situation réelle, par exemple : « Je sais ce qui reste à déterminer avant de poursuivre ». N'ajoute jamais une case demandant de refaire l'inventaire ou de vérifier manuellement toutes les preuves déjà examinées par l'agent.

Termine **chaque étape numérotée** par une ou plusieurs checkboxes qui matérialisent son point de passage. Même une étape principalement théorique doit se conclure par une vérification locale de compréhension ou d'observation, par exemple : « Je sais expliquer pourquoi ces deux phases sont séparées » ou « J'ai identifié quelle identité exécute chacune des deux phases ».

Ces cases ne sont jamais décoratives. Elles doivent porter uniquement sur ce que le lecteur peut comprendre, décider, produire ou vérifier à la fin de cette étape, sans utiliser une dépendance introduite plus tard. Une étape est terminée lorsque ses propres cases peuvent être cochées honnêtement ; les exigences futures restent formulées comme des spécifications sans checkbox.

## Lorsque le parcours contient de la production de code ou de fichiers

Si une étape prévoit de créer ou de modifier du code, un script, une configuration ou un autre fichier demandé à l'utilisateur, lis entièrement puis applique [Production de code, documentation et checkboxes au bon moment](references/production-code-documentation.md).

Cette référence impose trois séparations essentielles :

```text
spécifier une exigence → produire l'artefact quand ses dépendances sont prêtes → vérifier son comportement
```

Elle définit également le callout qui signale l'endroit où produire du code, la documentation Notion à créer lorsqu'un fichier est réellement produit et le test empêchant une checkbox d'anticiper une étape future.

## Enseigner au moment utile

Lorsqu'un terme ou un mécanisme apparaît pour la première fois :

1. définis-le simplement ;
2. explique son rôle général en quelques phrases ;
3. relie-le immédiatement au fichier ou au flux concret ;
4. indique l'erreur de raisonnement ou le risque qu'il aide à éviter.

Sélectionne les connaissances nécessaires pour comprendre l'étape, réaliser l'action ou diagnostiquer son échec. Signale brièvement les approfondissements secondaires comme « à apprendre plus tard » puis reviens au chemin principal.

Une question de prédiction ou de reformulation peut aider le lecteur à tester son modèle mental. Elle ne doit pas bloquer artificiellement la progression lorsque l'utilisateur demande un parcours directement exécutable.

## Expliquer les choix sans ouvrir de rabbit hole

Pour une décision technique, explique :

- le problème auquel elle répond ;
- pourquoi l'approche convient à l'état réel du projet ;
- l'alternative importante uniquement si elle éclaire la décision ;
- le compromis ou la limite acceptée ;
- la condition qui ferait reconsidérer ce choix.

Écarte explicitement les détours plausibles mais inutiles pour cette sous-action. Ne transforme pas la page en comparaison exhaustive de toutes les solutions possibles.

## Checkpoints d'arbitrage juste-à-temps

La conception du parcours va plus vite que la progression réelle de l'utilisateur. Lorsqu'un choix modifiera plus tard la suite, sépare donc deux moments : **repérer le carrefour pendant la conception**, puis **l'activer seulement lorsque l'utilisateur l'atteint**.

Réserve ce mécanisme aux vrais embranchements : architecture, périmètre, niveau d'isolation, compromis de sécurité, stratégie de migration ou autre décision produisant des étapes différentes. Ne l'utilise pas pour un détail sans conséquence ou lorsqu'une seule option respecte clairement le besoin déjà validé.

### Pendant la conception : placer le checkpoint

Repère les futurs choix en inspectant toute la progression, mais ne les présente pas tous immédiatement à l'utilisateur. À l'endroit exact où une première étape commencera à dépendre du choix, insère seulement un checkpoint court :

```markdown
> ⏸️ **Checkpoint d'arbitrage — à activer lorsque tu arrives ici**
>
> À ce stade, il faudra choisir la manière d'isoler les propriétaires PostgreSQL. Ne décide rien maintenant : le choix sera expliqué à partir de l'état réel obtenu après les étapes précédentes.
```

Pendant cette phase :

- ne crée pas encore la Ressource IA `X vs Y vs Z` ;
- ne demande pas encore de cocher une option ;
- ne force pas l'utilisateur à comprendre un choix encore lointain ;
- ne présente pas toutes les décisions futures au début du parcours ;
- ne rédige pas plusieurs branches détaillées « au cas où ».

Détaille entièrement les étapes communes qui précèdent le checkpoint. Si la décision est indispensable pour déterminer la suite, arrête le détail opérationnel à ce point et indique seulement le résultat général qui sera planifié après le choix. Ne transforme pas une hypothèse en fausse décision pour donner l'impression que tout le parcours est déjà figé.

### Pendant l'exécution : activer le checkpoint atteint

Active un checkpoint lorsque l'utilisateur indique qu'il y est arrivé, demande la suite ou fournit les résultats des étapes qui le précèdent. Relis alors l'état actuel du projet et les preuves obtenues : le comparatif doit reposer sur la situation présente, pas seulement sur les hypothèses de la conception initiale.

Crée ou réutilise à ce moment une courte Ressource IA d'arbitrage intitulée **`X vs Y`** ou **`X vs Y vs Z`**. Elle contient uniquement ce qui est nécessaire pour décider maintenant :

1. le problème commun que les options cherchent à résoudre ;
2. chaque option définie avec des mots courants ;
3. une image mentale ou une métaphore courte si elle simplifie réellement le choix ;
4. ce que chaque option permet maintenant, la complexité qu'elle ajoute et le besoin futur qui la rendrait utile ;
5. un avis contextualisé fondé sur le besoin et l'état réel, sans décider à la place de l'utilisateur ;
6. ce qu'il n'est pas nécessaire de comprendre ou d'implémenter maintenant ;
7. des cases mutuellement exclusives, écrites à la première personne et accompagnées de la raison du choix.

Cette ressource suit une progression simple : définition, théorie minimale, métaphore utile, illustration directe dans le projet, puis choix. Elle ne devient jamais une étude exhaustive des solutions.

Exemple au moment où le checkpoint est réellement atteint :

```markdown
### Deux rôles propriétaires vs owners NOLOGIN

Les deux options séparent Auth de Users. La différence est surtout la facilité avec laquelle on pourra remplacer plus tard l'identité utilisée par les migrations.

- **Deux rôles propriétaires** : moins de rôles et moins d'étapes maintenant. Suffisant si le besoin actuel est seulement d'isoler le DDL Auth et Users.
- **Owners NOLOGIN + logins de migration** : une couche supplémentaire utile si l'identité de connexion doit être remplacée sans transférer les objets.

Dans l'état actuel du projet, la première option suffit. La rotation indépendante des logins peut attendre qu'elle devienne un besoin réel.

Coche une seule réponse et renvoie-la-moi :

- [ ] **Je choisis les deux rôles propriétaires**, car je veux isoler le DDL sans ajouter une couche qui ne sert pas encore.
- [ ] **Je choisis les owners NOLOGIN**, car j'ai maintenant besoin de remplacer séparément les identités de migration.
```

Après avoir présenté les cases, arrête-toi et attends le choix. N'écris pas la suite comme si une option avait été validée.

Dans Notion, cette comparaison devient à ce moment une véritable note `Ressource IA`, car elle est nécessaire pour prendre la décision courante. Réutilise le template, les propriétés et les relations réellement observés, et évite de dupliquer une comparaison existante.

Insère son lien dans le premier callout bleu des Ressources IA, jamais dans `Échange IA`. Remplace le checkpoint du cours par un point de décision contenant le lien, l'avis contextualisé, les cases et l'indication que la suite sera adaptée après la réponse. Si la note Notion ne peut pas être créée, insère provisoirement le comparatif au checkpoint et indique l'opération restante.

### Après le choix : rendre à nouveau le parcours linéaire

Lorsque l'utilisateur renvoie son choix :

1. reformule brièvement ce qu'il apporte maintenant ;
2. indique les options reportées et le besoin futur qui justifierait de les rouvrir ;
3. inscris la décision à l'endroit exact du checkpoint ;
4. coche l'option retenue et laisse les autres explicitement non retenues pour maintenant ;
5. rédige ou adapte toutes les étapes, commandes, fichiers et preuves qui dépendent du choix ;
6. retire les branches devenues inutiles ;
7. vérifie les sous-actions suivantes pour supprimer les traces de l'ancienne hypothèse ;
8. reprends la progression jusqu'au prochain checkpoint réellement atteint.

Conserve dans la page de cours le choix et sa conséquence concrète. La Ressource IA sert à comprendre l'arbitrage ; la page de cours doit suffire pour suivre le chemin retenu sans rouvrir la comparaison.

## Situer les commandes et modifications

Pour chaque commande importante, indique :

- depuis quel dossier elle est lancée ;
- quels services, fichiers ou variables doivent déjà exister ;
- ce que font la commande principale et les options qui changent le résultat ;
- l'effet attendu ;
- la sortie ou l'état qui confirme le succès ;
- le premier point de diagnostic en cas d'échec.

Pour une modification de code ou de configuration, donne le chemin réel et assez de contexte pour trouver le bon emplacement. Utilise un extrait court lorsqu'il clarifie le passage de l'état actuel à l'état visé. Marque clairement tout pseudocode et toute proposition non exécutée.

## Construire une échelle de preuves

Après chaque changement, utilise le contrôle le moins coûteux capable de détecter l'erreur probable. Fais progresser les preuves lorsque le risque le justifie :

1. présence et cohérence des fichiers ;
2. validation de syntaxe, génération ou compilation ;
3. inspection de la configuration effectivement chargée ;
4. test local ciblé ;
5. test d'intégration par le vrai chemin d'exécution ;
6. test négatif prouvant qu'une opération interdite échoue pour la bonne raison ;
7. contrôle de non-régression ;
8. nouvelle exécution sur un état vierge si la reproductibilité est essentielle.

Pour chaque preuve, précise comment éviter les faux positifs. Un refus provoqué par une table inexistante ne prouve pas une permission refusée ; une réponse issue d'un mock ne prouve pas le trajet réel jusqu'au backend ; un conteneur démarré ne prouve pas que l'application fonctionne.

Ne marque une preuve comme réussie qu'après son exécution réelle. Dans une planification, emploie « résultat attendu » et laisse les cases de validation non cochées.

## Prévoir les échecs sans noyer le lecteur

Place le dépannage juste après le résultat attendu auquel il se rapporte. Couvre les erreurs plausibles révélées par l'inspection du projet, pas un catalogue générique.

Lorsque l'état observé ne satisfait pas un prérequis :

1. arrête la progression à cet endroit ;
2. donne l'observation qui permettra d'identifier la cause ;
3. indique la correction sûre ou la décision nécessaire ;
4. explique comment revenir ensuite sur le chemin principal.

Pour une opération destructive ou une migration, utilise si possible un environnement jetable, identifie explicitement la cible, ajoute une garde et donne la condition d'arrêt. Ne dirige jamais une preuve destructive vers des données de travail ou de production.

## Coordonner plusieurs sous-actions

Lorsque l'action contient plusieurs sous-actions :

1. comprends toute la chaîne avant de réécrire une page ;
2. crée une sous-action par étape avec le template `sub action` ;
3. donne à chaque sous-action un résultat propre et vérifiable ;
4. relie-la à l'action parente, au même GPR et au même groupe d'action ;
5. ordonne la chaîne avec `previous` et `next in line`, puis vérifie les deux sens ;
6. évite les répétitions et contradictions entre les pages ;
7. rends chaque page exécutable depuis son véritable état de départ ;
8. termine-la par la transition concrète vers la suivante ;
9. conserve tout le détail opérationnel dans les sous-actions ;
10. limite la page parente à la carte globale et aux critères communs.

Chaque page doit être autonome pour son exécution, tout en s'inscrivant dans la progression commune.

## Modifier une destination existante

N'écris dans Notion ou dans un autre système que si l'utilisateur a demandé la création ou la réécriture du parcours à cet endroit.

Dans une page Notion existante :

- mets à jour la page d'action ou de sous-action plutôt que de créer un rapport parallèle ;
- préserve son titre, ses propriétés, son statut, ses relations et ses enfants sauf demande contraire ;
- ne coche pas et ne clôture pas une action planifiée ;
- vérifie après toute réécriture structurelle que le contenu est complet et non tronqué ;
- indique explicitement ce qui est planifié mais pas encore exécuté.

Si la destination demandée est indisponible, fournis le contenu prêt à insérer et précise l'opération restante. Ne prétends pas avoir effectué une mise à jour impossible à vérifier.

## Terminer par une vraie condition de clôture

La fin du parcours doit réunir :

- la preuve fonctionnelle finale à obtenir ;
- les tests négatifs ou de non-régression indispensables ;
- l'état attendu des fichiers et services ;
- les critères exacts permettant de considérer la sous-action terminée ;
- la transition vers l'étape suivante ;
- quelques questions courtes permettant au lecteur de vérifier qu'il sait expliquer le flux, le choix principal et le premier diagnostic.

Le lecteur doit pouvoir répondre sans ambiguïté : « Est-ce terminé, et sur quelles preuves ? »

## Contrôle qualité avant livraison

Relis le parcours de haut en bas comme si tu découvrais le projet. Il est prêt seulement si :

- le point de départ repose sur des faits inspectés ;
- aucune étape nécessaire n'est implicite ;
- chaque notion apparaît au moment utile ;
- les commandes sont situées et leurs résultats observables ;
- chaque contrôle suit l'action qu'il vérifie ;
- chaque étape exécutable possède sa propre sous-action créée depuis le template canonique ;
- chaque sous-action contient exactement une étape et porte les relations parent, GPR, groupe d'action, précédente et suivante attendues ;
- le contenu rédigé de chaque sous-action se trouve après le bouton `waiting` et avant la vue `notes` du template courant ;
- tous les blocs de code Notion ont **Renvoyer à la ligne** activé ; aucun prompt, consigne ou note longue ne nécessite un défilement horizontal ;
- aucune ligne `Action parente`, `Action suivante` ou `Étape suivante` ne duplique au début du contenu la navigation déjà fournie par le template ;
- chaque étape commence par une checklist courte de notions de cours au format PER-2, sans préfixes de catégorie, distincte des cases de validation finales et directement réutilisable par `creation-ressources-ia-liees` ;
- chaque raisonnement, caractéristique ou règle métier réellement transférable est expliqué au moment utile dans un callout pédagogique approprié, sans affirmation professionnelle inventée ;
- chaque cartographie restitue un mini-rapport digeste fondé sur le plus petit nombre d'extraits suffisant pour comprendre le problème ;
- dans Notion, les observations d'un mini-rapport sont numérotées et utilisent les callouts bleu, brun, jaune et vert pour séparer le fait, l'emplacement, l'explication et la conclusion sans alourdir la lecture ;
- chaque affirmation de **Ce qu'on voit ici** est directement traçable à un ou plusieurs extraits affichés dans **Emplacement**, quitte à employer plusieurs blocs de code courts ;
- chaque bloc **Emplacement** fondé sur une codebase contient une commande de lecture seule, facultative, située et ciblée, permettant de retrouver rapidement les lignes citées ;
- chaque connecteur logique entre deux observations nomme explicitement son référent ou sa portée ; aucun `or`, `cependant`, `donc` ou équivalent ambigu ne laisse deviner à quelles observations il se rapporte ;
- l'inspection est exhaustive en arrière-plan dans le périmètre défini, mais aucune case ne demande à l'utilisateur de refaire l'inventaire ou de revérifier systématiquement les preuves ;
- toute commande de lecture seule destinée à regarder le terrain reste explicitement facultative et n'est jamais une condition de passage ;
- le pont vers la suite repose sur la relation Notion `next in line` et sur la lecture de la page liée ; il anticipe la direction générale, jamais l'exécution détaillée ni une solution inventée ;
- l'action parente ne duplique pas le détail opérationnel des sous-actions ;
- l'action parente contient une overview verticale courte couvrant toute la chaîne réelle jusqu'à la promesse et à sa preuve finale ; cette overview correspond aux relations `previous` et `next in line` ;
- une action de transformation ne s'arrête jamais sur une cartographie, un audit ou un checkpoint : au moins une sous-action produit le changement promis et une dernière sous-action permet de le prouver ;
- chaque étape numérotée se termine par au moins une checkbox locale permettant de savoir si elle est franchie ;
- le dépannage ramène au chemin principal ;
- les détours non nécessaires sont écartés ;
- les prévisions ne sont jamais présentées comme des résultats ;
- la preuve finale répond exactement au résultat annoncé au début ;
- le lecteur n'a pas besoin d'un document parallèle pour avancer.
