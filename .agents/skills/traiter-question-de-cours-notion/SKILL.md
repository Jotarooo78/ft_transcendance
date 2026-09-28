---
name: traiter-question-de-cours-notion
description: "Traiter automatiquement une question d'apprentissage reliée à une note, une Action, une étape ou un fichier identifiable : vérifier les sources, réutiliser ou créer la bonne trace pédagogique dans Notion, corriger la planification si la réponse révèle une erreur, puis propager uniquement ses conséquences directes. Utiliser même si l'utilisateur ne nomme pas le skill. Ne pas modifier le code ni trancher un choix à sa place sur la seule base d'une question."
---

# Traiter une question et ses conséquences dans Notion

Ce skill fait de la conversation l'entrée du système d'apprentissage et d'action. Une question reçoit d'abord une réponse simple et exacte. Elle produit ensuite, lorsque c'est utile, toutes les traces cohérentes qui en découlent : question/réponse locale, Ressource IA créée ou réutilisée, correction du cours, mentions contextuelles et ajustement borné de la progression.

Le but n'est pas de multiplier les pages. Le but est que Notion reste aligné avec ce qui vient d'être compris et que le parcours de travail ne continue pas sur une hypothèse devenue fausse.

## Quand l'activer

Utilise ce skill lorsqu'une question d'apprentissage est reliée sans ambiguïté à au moins un de ces éléments :

- une note, une Ressource IA ou une page `📄Documentation` donnée par lien ou par nom ;
- une Action, une sous-action ou une étape du parcours en cours ;
- un fichier, une commande ou une preuve appartenant à une Action identifiable ;
- le contexte immédiat d'une conversation qui vient de désigner cette cible.

Une question générale sans ancrage Notion identifiable reçoit une réponse normale et ne déclenche pas d'écriture. Si deux pages sont également plausibles, demande seulement laquelle est la source.

Lorsque la cible et les conséquences sont claires, la question autorise les écritures Notion nécessaires à ce workflow d'apprentissage : conserver la réponse, créer ou réutiliser une ressource, insérer ses relations et mentions, et réparer la planification directement concernée. Elle n'autorise pas à modifier le code, exécuter une migration, changer une architecture ni étendre la correction à un autre projet.

## Établir la réponse avant de modifier Notion

Avant toute écriture :

1. récupère la page source, son Action ou sa sous-action, son GPR et les étapes voisines utiles ;
2. inspecte son cours, sa section `# échange ia`, ses relations et ses Ressources IA déjà liées ;
3. recherche dans la base de notes les ressources dont le titre **ou le contenu** pourrait répondre, y compris dans un autre contexte technique ;
4. ouvre les candidates et vérifie qu'elles répondent réellement à la question au bon niveau : un mot commun dans le titre ne suffit pas ;
5. inspecte les fichiers, commandes, sorties ou preuves du projet lorsque la réponse porte sur le comportement concret ;
6. distingue les faits observés, les déductions, les préférences et les décisions encore ouvertes.

Conserve la question le plus près possible des mots de l'utilisateur. Garde son ton, son incertitude et son vocabulaire. Retire seulement les instructions adressées à l'agent qui ne font pas partie de la question. Ne corrige une faute que si elle empêche de comprendre.

Commence toujours la réponse pédagogique par le modèle mental le plus simple, puis relie-le au cas concret. N'introduis que les détails nécessaires pour comprendre la réponse, décider ou poursuivre l'étape.

## Construire le petit ensemble de sorties approprié

Une question peut nécessiter plusieurs sorties complémentaires. Choisis seulement celles qui ont une fonction distincte.

### Réutiliser une connaissance existante

Si une Ressource IA existante répond correctement au besoin :

- ne crée pas de doublon ;
- complète-la uniquement si l'information manquante appartient réellement à son sujet central ;
- ajoute dans la page d'Action ou de sous-action la mention contextuelle qui manquait ;
- conserve son statut existant par défaut ;
- n'ajoute pas de relation vers une nouvelle Action sans vérifier que la ressource y est réellement utilisée.

Une ressource seulement apparentée, trop liée à un autre domaine ou incapable de répondre sans longue adaptation n'est pas considérée comme équivalente.

### Conserver une précision locale dans Échange IA

Utilise une question/réponse locale lorsque la question confirme une conséquence, un exemple, une commande ou l'application concrète du cours, sans nécessiter un modèle mental autonome et réutilisable.

Chaque question possède ses deux blocs propres et contigus :

```markdown
<callout color="green_bg">
	QUESTION_PRESERVEE
</callout>
<details color="blue_bg">
<summary>réponse</summary>
	REPONSE_PEDAGOGIQUE
</details>
```

- utilise la première paire vide sous `# échange ia` pour la première question ;
- ajoute les suivantes dans l'ordre chronologique, avant les boutons ou la section `ce que j'ai compris / ce que j'en tire` ;
- garde exactement le résumé `réponse` en minuscules ;
- ne rassemble jamais plusieurs questions dans les mêmes blocs ;
- si la question existe déjà, corrige ou complète sa réponse au lieu de la dupliquer.
- lorsqu'une page `📄Documentation` est la source explicite de la question, conserve la paire question/réponse dans la section `# échange ia` de cette documentation elle-même ; ne la range pas uniquement dans l'Action liée ou dans une Ressource IA voisine.

### Créer une Ressource IA issue de la question

Crée une ressource lorsque la réponse demande un modèle mental autonome, réutilisable dans plusieurs étapes, ou une distinction conceptuelle que le lecteur risque de rencontrer de nouveau. Une réponse longue n'est pas à elle seule un motif de création.

Lis et applique le skill voisin [`creation-ressources-ia-liees`](../creation-ressources-ia-liees/SKILL.md) pour les propriétés, les relations, le statut `to review`, la pédagogie et les mentions natives bleues, avec ces adaptations obligatoires :

- la ressource provient d'une question individuelle : **conserve** le premier callout vert du template et écris-y la question originale presque inchangée ;
- écris le cours dans le premier callout bleu ;
- relie la ressource à l'Action ou sous-action source et à son GPR, sans relation Topic ;
- insère une mention de page native bleue dans la phrase exacte du parcours où la notion devient utile, jamais dans la checklist de notions ;
- si la question vient d'une autre note et qu'aucune mention contextualisée n'y convient, ajoute juste avant `# échange ia` :

```markdown
<span color="gray">*Cette question nécessite un prérequis séparé :*</span> <span color="blue"><mention-page url="URL_DE_LA_RESSOURCE"/></span>
```

La création est automatique lorsque la cible est certaine et que le critère de ressource est clairement rempli. Ne demande une confirmation que si le nouveau découpage est discutable, si une ressource existante pourrait être fusionnée de plusieurs façons ou si le sujet dépasse l'Action en cours.

### Corriger le cours ou la planification

Si la réponse montre qu'un passage est faux, trompeur, incomplet sur un point central ou placé au mauvais moment, corrige sa source au lieu d'empiler une explication contradictoire dans `Échange IA`.

Applique la modification minimale capable de rendre le parcours vrai et continu. Préserve le ton, l'ordre général, les propriétés et les blocs non concernés. Une Ressource IA peut être créée **et** le passage erroné corrigé dans la même intervention : ces routes ne sont pas exclusives lorsque chacune remplit une fonction différente.

## Calculer et appliquer la cascade de planification

Après avoir établi la réponse, parcours les conséquences directes dans cet ordre :

1. le passage où la confusion est née ;
2. l'action, le résultat attendu, la preuve ou la checkbox de l'étape courante ;
3. les étapes suivantes qui dépendent explicitement de cette affirmation ;
4. la transition vers la sous-action suivante ;
5. la page parente uniquement si elle porte une carte globale devenue fausse.

Pour chaque élément, pose une seule question : **resterait-il exact et exécutable si on conservait son texte actuel ?** S'il reste exact, ne le modifie pas. Sinon, ajuste-le juste assez pour rétablir une progression linéaire.

Lorsqu'une modification de progression est nécessaire, lis et respecte [`planification-progression-lineaire-documentee`](../planification-progression-lineaire-documentee/SKILL.md), ainsi que sa référence de production si le passage concerné prévoit un fichier. En particulier :

- ne déplace pas une notion loin de sa première utilisation ;
- ne transforme pas une spécification future en travail immédiat ;
- ne laisse aucune checkbox exiger une dépendance située plus tard ;
- ne coche jamais une nouvelle preuve sans exécution réelle ;
- si une correction invalide réellement une case cochée, remets-la à vérifier et explique-le dans le bilan ;
- conserve les étapes et preuves qui ne dépendent pas de la réponse ;
- ne réécris pas toute l'Action pour une correction locale.

La cascade est terminée dès que les pages directement dépendantes redeviennent cohérentes. Ne suis pas les relations Notion de proche en proche sans preuve d'une dépendance réelle.

## Arrêter la cascade devant un choix ou de la production

Une question peut révéler qu'une décision doit être prise. Dans ce cas :

1. explique simplement les options utiles maintenant ;
2. crée ou réutilise, si nécessaire, la ressource `X vs Y` prévue par le skill de planification ;
3. place le checkpoint au premier endroit qui dépend du choix ;
4. attends la réponse de l'utilisateur ;
5. n'adapte pas les étapes dépendantes comme si une option avait déjà été choisie.

Une question seule n'autorise pas une modification du dépôt. Si elle révèle un défaut de code ou un fichier à changer, corrige la compréhension et la planification, ajoute au besoin un point de production **non coché** à l'endroit approprié, puis indique clairement que la production reste à demander. Si l'utilisateur demande aussi de corriger ou produire, le travail de code et sa documentation peuvent alors être exécutés selon le skill de planification.

## Vérifier l'ensemble après écriture

Relis toutes les pages modifiées et vérifie que :

- la réponse en conversation reste compréhensible sans ouvrir Notion ;
- aucune ressource équivalente n'a été dupliquée ;
- la question originale a été conservée au bon endroit ;
- une nouvelle Ressource IA est en statut `to review`, liée à la bonne Action ou sous-action et au bon GPR, sans Topic ;
- son prompt se trouve dans le premier callout vert et son cours dans le premier callout bleu ;
- chaque mention de Ressource IA est une mention de page native colorée en bleu et intégrée au contexte ;
- aucun lien de ressource n'a remplacé une ligne de la checklist de notions ;
- les corrections de planification suivent seulement des conséquences démontrées ;
- les checkboxes et preuves restent honnêtes et locales ;
- aucun choix n'a été tranché et aucun code n'a été modifié sans demande correspondante.

Termine par un bilan court distinguant :

- la réponse à retenir ;
- les notes créées, réutilisées ou complétées ;
- les passages de planification corrigés et la raison ;
- l'éventuel choix ou travail de production qui attend encore l'utilisateur.
