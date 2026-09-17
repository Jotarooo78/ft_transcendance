---
name: rapport-prevision-action-notion
description: Créer dans Notion un rapport pédagogique de prévision avant l'exécution d'une action suivie dans la base Action. Utiliser quand l'utilisateur demande d'expliquer à l'avance ce qui sera fait, le raisonnement, les extraits de code concernés, les connaissances mobilisées et le plan de vérification. Ne pas utiliser pour documenter une action déjà exécutée.
---

# Rapport de prévision d'une action dans Notion

Ce skill transforme un todo d'action en plan pédagogique vérifiable avant toute modification. Il décrit une intention et ne prétend jamais que le travail a déjà été réalisé.

Lis complètement [le modèle du rapport de prévision](references/rapport-prevision.md) avant de créer ou rédiger le rapport.

## Workflow

1. Retrouve la page Action et le todo exact correspondant au travail prévu.
2. Inspecte uniquement ce qui est nécessaire pour comprendre l'état initial et citer des preuves fiables. Une inspection en lecture seule ne vaut pas exécution de l'action.
3. Si le travail a déjà été effectué, n'utilise pas ce rapport : crée un rapport post-action avec le skill prévu à cet effet.
4. Crée directement le rapport dans la base Notion `Notes` avec l'API et le template `rapport d’action`.
   - Conserve la structure, l'icône et les valeurs préremplies par le template.
   - Renseigne `Category = WORK`, `GPR = transcendance` et `actions = <Action concernée>`.
   - Laisse les propriétés de topic vides : l'utilisateur les complète lui-même.
   - Vérifie après création que le template est appliqué et que les trois propriétés sont correctes.
5. Donne au rapport le titre `Rapport de prévision d'action — <résultat visé>`.
6. Rédige le rapport selon le modèle, à partir de l'état observé et sans présenter le code proposé comme déjà appliqué.
7. Laisse le todo **non coché** : un rapport de prévision ne termine jamais l'action.
8. Lorsque l'action sera exécutée, crée un rapport post-action séparé avec le même template et compare la prévision au résultat réel.

## Règles de vérité

- Utilise le futur pour les opérations prévues et le présent uniquement pour l'état réellement observé.
- Marque chaque extrait proposé comme `Prévision — non exécuté`.
- Cite le code actuel exactement lorsqu'il a été inspecté. Indique son fichier et limite l'extrait aux lignes utiles.
- Si le code futur dépend encore d'un choix, donne un pseudocode explicitement nommé au lieu d'inventer une implémentation définitive.
- Pour chaque socle de connaissance, donne une définition simple, son rôle général et son application à l'action prévue.
- Explique les raisons, les risques et les compromis sans transformer une recommandation en décision déjà prise.
- Décris à l'avance comment le résultat sera vérifié, mais ne marque aucune vérification comme réussie avant son exécution.
- Rends chaque prérequis actionnable : explique comment le satisfaire ou le contrôler.
- Explique chaque commande prévue et chacun de ses paramètres : commande principale, sous-commande, options, valeurs, chemins ou cibles, puis résultat attendu.
- Crée un autre todo si la prévision révèle une décision préalable réellement indépendante.

## Indisponibilité de Notion ou de l'API

Si Notion ou l'API n'est pas accessible :

- ne prétends pas avoir créé ou relié la page ;
- prépare le contenu complet, prêt à être collé ;
- indique le titre exact, le template, les propriétés attendues et le todo concerné ;
- laisse le todo non coché.
