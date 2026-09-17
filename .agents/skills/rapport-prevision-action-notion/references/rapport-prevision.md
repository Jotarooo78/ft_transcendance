# Modèle du rapport de prévision d'action

Utilise ce modèle avant l'exécution. Le rapport explique ce qui devrait être fait, pourquoi et comment le résultat sera contrôlé. Il ne contient aucun résultat inventé.

## `<résultat visé> en une phrase`

Commence par le changement attendu, en termes simples et observables.

> Exemple : Signup utilisera le client Prisma d'Auth pour créer un compte dans `auth.accounts`, sans écrire directement dans les données de profil de Users.

## Le point de départ

Présente brièvement :

- l'état actuel réellement inspecté ;
- le problème ou l'écart à résoudre ;
- les preuves utiles, avec leurs fichiers ou sources ;
- les inconnues qui pourraient encore modifier le plan.

Lorsque du code actuel explique le problème, cite un petit extrait exact :

```markdown
**Code actuel — vérifié dans `<fichier>`**

\`\`\`ts
await app.pg.query("INSERT INTO users ...");
\`\`\`
```

## Ce qui sera fait

Décris les étapes prévues dans leur ordre logique. Pour chaque étape importante :

1. explique le changement attendu ;
2. montre le petit extrait actuel concerné ;
3. donne l'extrait envisagé, clairement marqué `Prévision — non exécuté` ;
4. explique le passage de l'un à l'autre et le résultat observable attendu.

Exemple :

```markdown
**Prévision — non exécuté**

\`\`\`ts
await prisma.account.create({
  data: { email, passwordHash },
});
\`\`\`

Le client Prisma appliquerait le mapping du modèle `Account` vers la table propriétaire `auth.accounts`.
```

Ne produis pas un diff exhaustif. Garde seulement les lignes nécessaires au raisonnement.

## Les socles de connaissance mobilisés

Présente un toggle Notion par connaissance importante :

```markdown
<details>
<summary><strong>Propriété des données</strong></summary>

Un service modifie uniquement les données dont il est responsable. Pour cette action, Auth peut créer `auth.accounts`, mais la création de `users.profiles` doit passer par le protocole du service Users.
</details>
```

Chaque toggle contient une définition simple, son rôle général, son application concrète et le risque qu'il aide à éviter.

## Les choix prévus

Présente un toggle par décision technique envisagée. Explique brièvement l'approche, sa raison, l'alternative importante et la condition qui pourrait faire changer ce choix.

Utilise le futur ou le conditionnel : le rapport prépare la décision, il ne la déclare pas exécutée.

## Le plan d'exécution

Donne une séquence courte et ordonnée. Sépare les étapes qui produisent des résultats observables. Mentionne les fichiers ou services concernés et les points d'arrêt en cas d'échec.

## Comment le résultat sera vérifié

Présente chaque contrôle prévu sous forme d'un toggle distinct, toujours marqué comme non exécuté :

```markdown
<details>
<summary><strong>À vérifier — Compilation TypeScript</strong></summary>

Depuis le dossier du service :

\`\`\`bash
# Génère le client Prisma puis compile le serveur.
npm run build
\`\`\`

Résultat attendu : code de sortie `0`. Ce contrôle prouvera la cohérence des imports et des types, mais pas encore l'écriture dans une base active.
</details>
```

Dans chaque toggle :

1. explique comment satisfaire ou vérifier les prérequis ;
2. donne les commandes dans leur ordre d'exécution ;
3. explique la commande principale, sa sous-commande et chaque option, paramètre, chemin, image ou service ciblé ;
4. indique le résultat attendu et comment reconnaître une réussite ;
5. précise ce que le contrôle prouvera et ce qu'il ne prouvera pas.

Ne laisse jamais un prérequis abstrait comme « construire l'image » ou « démarrer la base » sans procédure concrète.

## Risques, limites et points encore ouverts

Distingue les risques couverts, les limites hors périmètre, les décisions ou autorisations nécessaires et le comportement prévu en cas d'échec ou d'état partiel.

## Ce qu'il faut retenir

Termine par trois à cinq idées permettant au lecteur d'expliquer le changement prévu, le raisonnement, les connaissances mobilisées, les principaux extraits de code, le plan de vérification et les incertitudes restantes.

## Critères de complétude du rapport

Le rapport de prévision est complet lorsque :

- l'état initial est fondé sur des preuves ;
- les changements sont décrits sans être présentés comme exécutés ;
- les extraits actuels et prévus sont clairement distingués ;
- les connaissances et choix sont expliqués pédagogiquement ;
- le plan de vérification est reproductible ;
- les risques et inconnues sont explicites ;
- le rapport a été créé avec le template `rapport d’action`, relié par la propriété `actions`, et ses propriétés `Category`, `GPR` et `actions` ont été vérifiées ;
- le todo d'action reste non coché.
