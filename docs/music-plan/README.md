# Suivi des quatre parcours musicaux

Le [plan Notion](https://app.notion.com/p/3f241a23495481b5a93dfbd600a8d0c4)
est la source canonique des consignes, statuts et critères de compréhension.
L'exécution autorisée du 7 octobre 2026 se trouve sur `feat/music-journeys`,
dans `/home/ange/common_core/transcendence/music-journeys`.

Les parcours suivent CAT → MED → LIB → ECO. Le
[journal d'exécution](../music/EXECUTION.md) conserve les contrôles, limites et
synchronisations après chaque sous-action ; les
[commandes reproductibles](../../tests/music/README.md) utilisent exclusivement
le projet Docker `transcendence_music`, HTTPS 3443 et ses trois volumes jetables.
PCE utilise séparément `transcendence_e2e` et le port 2443.

- [CAT Catalogue](https://app.notion.com/p/3f241a23495481fba0eac0a27dece2ca) : catalogue PostgreSQL filtré et paginé.
- [MED Audio](https://app.notion.com/p/3f241a2349548166a3d7d4fd3fd51404) : octets, plages HTTP et vraie lecture.
- [LIB Playlists](https://app.notion.com/p/3f241a23495481ffb9acdbb2befebf70) : playlists privées persistantes.
- [ECO Écoute](https://app.notion.com/p/3f241a23495481bc8b3fd1369e1b3a55) : sessions, progression et historique privé.

## Vérification de toute la file ECO

| Sous-actions | Résultat à contrôler | Preuves |
| --- | --- | --- |
| ECO-1 | Contrat, unités et limites, sans qualification R15 | [PLAYBACK_CONTRACT.md](../music/PLAYBACK_CONTRACT.md), schéma SQL |
| ECO-2 | Ouverture liée au JWT et à la durée Catalogue | Tests Playback, HTTPS, SQL et panne Catalogue |
| ECO-3 à ECO-4 | Transaction, bornes, ordre et effet unique | Tests Playback, courses HTTPS réelles, recalcul SQL |
| ECO-5 | Clôture idempotente et refus de nouvelle progression | Tests Playback, HTTPS/SQL, fin audio Chromium |
| ECO-6 à ECO-7 | Historique privé et routes HTTPS | Pagination, droits A/B, métriques 403, redémarrages |
| ECO-8 à ECO-9 | Mesure active et file ordonnée avec retry | Dix tests frontend, pause/seek et perte de réponse Chromium |
| ECO-10 | History relu après reconnexion | Même ID/temps/position que SQL ; pagination, erreurs et réponse périmée |
| ECO-11 | Persistance et invariants réels | HTTP et oracle SQL avant/après redémarrages séparés |
| ECO-12 | Vraie lecture, SQL et historique | Deux scénarios Playback Chromium, sans succès simulé |
| ECO-13 | Deux campagnes neuves et non-régression PCE | Résultats détaillés dans le journal d'exécution |

ECO-10, ECO-11 et ECO-12 sont publiés (`7e5fed2`, `e59aba7`, `0630f76`).
ECO-13 est validé par deux campagnes musicales neuves et PCE, tous réussis
avec nettoyage. Les critères de compréhension restent
personnels et ne sont pas cochés par les tests. Les notes Documentation par
fichier sont liées dans les sous-actions Notion.

Une session ouverte peut survivre à la fermeture brutale du navigateur ;
le temps confirmé peut être inférieur au temps local. Pas d'antifraude absolue,
de qualification, de reprise automatique ni de statistiques commerciales.
