---
name: creation-ressources-ia-liees
description: Créer dans Notion des notes Ressource IA à partir d'une liste de sujets déjà choisie, les placer en statut « to review », les relier par leurs propriétés à leur Action ou sous-action et au GPR d'origine, puis insérer une mention de page Notion native colorée en bleu dans la phrase où chaque notion intervient réellement. Utiliser lorsque l'utilisateur fournit directement les notions à documenter. Ne pas générer de checklist de vocabulaire, d'index de ressources dans le plan ni de relation Topic.
---

# Création de Ressources IA liées

Ce skill transforme une liste de sujets fournie par l'utilisateur en petites notes pédagogiques directement rattachées au travail en cours. Il ne cherche pas d'autres notions à apprendre et ne demande pas de remplir une checklist préalable.

## Entrée attendue

Pars de la liste de sujets donnée par l'utilisateur et de l'Action ou sous-action dont chacun provient. Si plusieurs pages sont concernées, établis le rattachement de chaque sujet à partir du plan réel. N'invente pas un rattachement ambigu : inspecte les pages et demande une précision seulement si deux destinations restent également plausibles.

Une demande comme « crée des ressources sur rôle PostgreSQL, `GRANT` et SQLSTATE 42501 pour PER-2 et PER-4 » autorise la création de ces notes et l'insertion de leurs liens dans les plans concernés. Elle n'autorise pas à élargir la liste.

## Découvrir les conventions Notion

Avant la première création du lot :

1. inspecte la base Notion qui contient les notes `Ressource IA` ;
2. inspecte son template adapté et une note existante représentative ;
3. inspecte l'Action ou la sous-action source et son GPR ;
4. relève les noms exacts des propriétés et relations ;
5. recherche une ressource équivalente avant d'en créer une nouvelle.

Réutilise une note existante si son sujet, son niveau et son contexte répondent déjà au besoin. Ne crée pas de doublon sous un titre légèrement différent.

## Propriétés à remplir

Pour chaque note créée :

- donne-lui un titre clair correspondant au sujet ;
- applique le type ou le template canonique `Ressource IA` observé dans la base ;
- règle son statut sur `to review`, jamais sur `Done` : la création de la ressource ne vaut pas validation par l'utilisateur ;
- relie-la à l'Action ou à la sous-action précise d'où provient le sujet ;
- relie-la au GPR de cette page ;
- conserve les valeurs obligatoires ou automatiques imposées par le template sans inventer d'information.

Parmi les relations de connaissance, remplis seulement **Action ou sous-action** et **GPR**. Ne renseigne aucune propriété `Topic`, `Topic Plus Précis` ou relation équivalente, même si elle existe dans la base. Ne rattache pas la note à une autre Action par commodité.

Si une note existante est réutilisée, ne modifie pas son statut par défaut : la règle `to review` concerne les ressources nouvellement créées par ce skill.

## Contenu de la note

Crée la note depuis le template approprié. Pour toute note nouvellement créée par ce skill à partir d'une liste de sujets, supprime le **premier callout vert** hérité du template, situé avant le premier callout bleu. Cet encadré est réservé au prompt de l'utilisateur lorsqu'une Ressource IA naît d'une question individuelle ; il n'a pas de fonction dans ce workflow fondé sur une liste.

Supprime uniquement ce premier encadré vert de prompt. Ne supprime jamais l'encadré vert situé sous `# échange ia`, ni les autres blocs verts du template. Ne modifie pas non plus ce premier encadré dans une note existante simplement réutilisée par le skill.

Parcours ensuite les blocs de haut en bas et écris la ressource dans le **premier callout bleu** rencontré. Préserve le reste du template.

Si aucun premier callout bleu ne peut être identifié avec certitude, n'écris pas dans une autre section par défaut. Signale l'ambiguïté et demande où placer le contenu.

La ressource doit aider à reprendre immédiatement le plan. Elle suit ce mouvement simple, sans forcément créer cinq rubriques visibles :

1. définition en mots courants ;
2. théorie minimale nécessaire à l'étape ;
3. métaphore courte seulement si elle clarifie réellement ;
4. illustration exacte dans le projet, la commande, le fichier ou la preuve concernée ;
5. ce qu'il faut retenir pour continuer.

Écris avec des phrases courtes et une idée principale par paragraphe. Explique immédiatement le jargon indispensable. N'ajoute ni histoire complète de la technologie, ni alternatives avancées, ni liste de liens, ni connaissance secondaire qui ouvrirait un rabbit hole.

Une ressource peut contenir un petit exemple réel ou une confusion fréquente si cela empêche une erreur dans l'étape. Toute notion non nécessaire est omise ou signalée brièvement comme « à voir plus tard ».

## Insérer le lien dans le plan d'origine

Après avoir créé ou réutilisé la note, ajoute aussi un lien visible dans le contenu de l'Action ou de la sous-action source. Ce lien de contenu est obligatoire en plus des relations de propriétés ; l'un ne remplace pas l'autre.

La checklist de notions placée au début d'une étape sert seulement d'inventaire et d'entrée pour ce skill. Ne transforme jamais ses libellés en liens et n'ajoute pas les liens sur ses lignes. Préserve exactement ses noms, son ordre et l'état de ses cases.

Place plutôt chaque lien dans la phrase du déroulé où la notion est expliquée ou utilisée pour la première fois de manière utile. Le lecteur doit rencontrer la ressource au moment où une question peut réellement apparaître, sans revenir à la checklist. Si la notion apparaît uniquement dans un bloc de code, n'insère rien dans le code : ajoute le lien dans la phrase qui introduit ou explique cette ligne.

Crée une **mention de page native Notion**, équivalente à celle obtenue en tapant `[[Nom de la page]]` dans l'éditeur. N'utilise jamais un lien Markdown `[titre](URL)` pour une ressource Notion : ce lien ordinaire ne conserve pas toutes les interactions natives, notamment l'ouverture de la page en panneau latéral.

Le bleu est le code couleur réservé à ce qui est lié à l'IA. Colore donc en bleu le texte de chaque mention de page qui pointe vers une note `Ressource IA`. Cette convention ne s'applique pas aux mentions de documentation ou aux autres pages Notion.

Cette couleur construit des repères visuels stables dans le cours : en parcourant la page, l'utilisateur doit reconnaître immédiatement les moments où une ressource pédagogique accompagne l'action. Applique-la de façon constante à toutes les Ressources IA, et seulement à elles, afin que les séquences du déroulé restent faciles à photographier mentalement et à reprendre.

Avec le connecteur ou l'API Notion, n'écris pas les deux crochets comme du texte brut. Utilise une mention native enveloppée dans une couleur de texte bleue en Enhanced Markdown :

```markdown
Les mots de passe arriveront par variables `psql` (<span color="blue"><mention-page url="URL_DE_LA_NOTE"/></span>) et ne seront jamais écrits dans Git.
```

La balise `<mention-page .../>` doit produire dans Notion la vraie mention de page créée par `[[…]]`, avec l'icône et le titre résolus par Notion. Le conteneur `<span color="blue">...</span>` doit rendre cette mention bleue sans la convertir en lien Markdown. Intègre-la à une phrase naturelle ; ne la pose pas seule sur une ligne. Conserve le reste du texte, de la progression et des cases déjà présentes. Ne crée pas une seconde occurrence dans le même contexte si la bonne mention existe déjà.

Ne crée jamais de callout bleu, de section globale ou d'index `Ressources IA` dans une Action ou une sous-action. La règle du **premier callout bleu** s'applique uniquement à l'intérieur de chaque note `Ressource IA`, pour déterminer où écrire le contenu pédagogique de cette note.

N'insère jamais le lien dans `Échange IA`, qui reste réservé aux questions posées pendant le travail. Si le bloc source exact ne peut pas être identifié, signale l'ambiguïté au lieu de ranger le lien ailleurs par défaut.

## Vérification obligatoire

Après toutes les créations et insertions, relis chaque note et chaque plan modifiés. Vérifie que :

- chaque sujet demandé possède exactement une note créée ou réutilisée ;
- chaque note nouvellement créée possède le statut `to review` et non `Done` ;
- le premier callout vert de prompt a été supprimé de chaque note nouvellement créée par ce skill, tandis que le callout vert d'`échange ia` a été conservé ;
- le contenu se trouve dans le premier callout bleu de la note ;
- la note est reliée à la bonne Action ou sous-action ;
- la note est reliée au bon GPR ;
- aucune propriété Topic n'a été renseignée ;
- la checklist de notions du plan est restée une checklist simple, sans lien ;
- le plan source contient chaque lien dans la phrase où la notion est réellement expliquée ou utilisée ;
- chaque lien contextuel est une mention de page Notion native créée avec `[[…]]` dans l'interface ou `<mention-page .../>` via le connecteur, jamais un lien Markdown `[titre](URL)` ;
- chaque mention vers une `Ressource IA` possède une couleur de texte bleue, sans colorer les mentions de documentation ou les autres liens Notion ;
- aucun callout bleu ni index global de ressources n'a été créé dans l'Action ou la sous-action ;
- aucun lien n'a été ajouté dans `Échange IA` ;
- aucune notion absente de la liste n'a été créée.

Termine par une liste courte des ressources créées et réutilisées, regroupées par Action ou sous-action. Ne redonne pas une nouvelle checklist à l'utilisateur.
