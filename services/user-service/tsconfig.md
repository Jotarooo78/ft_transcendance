# Configuration TypeScript du user-service

Ce document explique le rôle du fichier `tsconfig.json` du microservice
`user-service` et les choix effectués pour le projet Transcendence.

## Ressource vidéo

La configuration s'appuie sur les principes présentés dans
[The TSConfig Cheat Sheet — Matt Pocock](https://www.youtube.com/watch?v=eJXVEju3XLM).

La vidéo présente plusieurs contextes possibles. Ici, seules les options utiles à
un service backend exécuté avec Node.js 22 ont été conservées.

## Rôle de tsconfig.json

`tsconfig.json` indique au compilateur TypeScript :

- où trouver les fichiers source ;
- quelles vérifications effectuer ;
- quelle version de JavaScript produire ;
- comment gérer les modules ;
- où placer les fichiers compilés.

Le flux de compilation est le suivant :

```text
src/*.ts
   ↓ npm run build
tsc lit tsconfig.json
   ↓
dist/*.js
   ↓
Node.js exécute le JavaScript
```

## Environnement Node.js

- `target: "ES2022"` produit du JavaScript moderne compatible avec Node.js 22.
- `lib: ["ES2022"]` fournit les API JavaScript sans ajouter les API du
  navigateur comme `document` ou `window`.
- `module: "NodeNext"` et `moduleResolution: "NodeNext"` reproduisent le
  fonctionnement des modules de Node.js.
- `types: ["node"]` ajoute les types de `process`, `Buffer` et des modules
  natifs de Node.js.

Ces réglages sont cohérents avec `"type": "module"` dans `package.json`.

## Sources et fichiers générés

- `rootDir: "./src"` définit le dossier du code TypeScript.
- `outDir: "./dist"` définit le dossier du JavaScript généré.
- `sourceMap: true` permet de relier les erreurs JavaScript au TypeScript
  original pendant le débogage.
- `noEmitOnError: true` empêche la génération de JavaScript si TypeScript
  détecte une erreur.

Seuls les fichiers `src/**/*.ts` sont compilés. Les dossiers `node_modules`
et `dist` sont ignorés.

## Vérifications strictes

- `strict: true` active les principales vérifications de types.
- `noUncheckedIndexedAccess: true` ajoute undefined au type d’une valeur obtenue par index (array[i] ou object[key]) lorsque TypeScript ne peut pas garantir qu’elle existe. Cela oblige à vérifier la valeur avant de l’utiliser.
- `noImplicitOverride: true` exige le mot-clé `override` lorsqu'une méthode
  héritée est redéfinie.
- `forceConsistentCasingInFileNames: true` détecte les différences de
  majuscules et minuscules dans les chemins, ce qui évite des erreurs sous
  Linux et dans Docker.

## Modules et outils

- `esModuleInterop: true` facilite l'utilisation de dépendances CommonJS
  depuis les modules modernes.
- `resolveJsonModule: true` autorise l'import de fichiers JSON.
- `moduleDetection: "force"` traite chaque fichier comme un module.
- `isolatedModules: true` garantit que chaque fichier peut être transformé
  indépendamment, notamment par `tsx`.
- `verbatimModuleSyntax: true` conserve une séparation claire entre les
  imports exécutés et les imports de types.
- `skipLibCheck: true` évite de revérifier les déclarations de types des
  dépendances ; le code du service reste vérifié strictement.

## Commandes utiles

Vérifier les types sans produire de JavaScript :

```bash
npm run typecheck
```

Compiler le service dans `dist/` :

```bash
npm run build
```

La commande de compilation définie dans `package.json` est :

```bash
tsc -p tsconfig.json
```

## État actuel et prochaine étape

Le dossier `src/` n'existe pas encore. Le premier fichier applicatif pourra
être créé sous la forme `src/index.ts`.

Après compilation, son résultat sera `dist/index.js`. À ce moment-là, le
script de démarrage devra viser ce fichier :

```json
"start": "node dist/index.js"
```
