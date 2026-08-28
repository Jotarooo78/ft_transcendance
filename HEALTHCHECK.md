# Healthcheck PostgreSQL

## Objectif

Le service `db` possède un healthcheck Docker Compose qui exécute régulièrement
`pg_isready`. Il permet de distinguer un conteneur simplement démarré d'une instance
PostgreSQL prête à accepter des connexions.

Docker marque le conteneur `healthy` lorsque le test réussit. Au démarrage, une période
de grâce de 10 secondes est accordée, puis le test est exécuté toutes les 5 secondes.
Après 5 échecs consécutifs, le conteneur est marqué `unhealthy`.

## Vérification

```bash
docker-compose up -d db
docker-compose ps db
```

La colonne `STATUS` doit contenir `(healthy)`. Pour exécuter manuellement le même type
de vérification :

```bash
docker-compose exec db sh -c 'pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
```

Le résultat attendu contient `accepting connections`.

## Que se passe-t-il si le service devient `unhealthy` ?

Le healthcheck produit d'abord un **état** : `starting`, `healthy` ou `unhealthy`.
Dans la configuration actuelle, Docker Compose affiche cet état, mais ne redémarre pas
automatiquement le conteneur uniquement parce qu'il est `unhealthy`. La politique
`restart: unless-stopped` intervient lorsque le processus du conteneur s'arrête, pas
lorsque son healthcheck échoue alors qu'il continue de tourner.

Cet état peut cependant être utilisé par les autres services pour prendre une décision.
Par exemple, un service dépendant peut attendre que PostgreSQL soit réellement prêt :

```yaml
depends_on:
  db:
    condition: service_healthy
```

La décision devient alors :

- tant que `db` n'est pas `healthy`, le service dépendant ne démarre pas ;
- dès que `db` devient `healthy`, Docker Compose peut démarrer ce service.

Dans une future infrastructure de production, le même principe peut servir à retirer
une instance du trafic, la redémarrer ou déclencher une alerte. Le healthcheck est donc
le **signal** utilisé pour décider ; la réaction dépend de l'outil qui consomme ce signal.

## Ce que ce healthcheck ne garantit pas

Ce test indique que PostgreSQL répond et accepte les connexions. Il ne vérifie pas :

- la présence des tables ou des migrations attendues ;
- la validité fonctionnelle des données ;
- les performances, l'espace disque ou la charge du serveur ;
- la connexion complète d'un service applicatif avec `DATABASE_URL` ;
- la surveillance et les alertes de production.

Un statut `unhealthy` n'entraîne pas à lui seul un redémarrage automatique du conteneur.
Les politiques `restart` agissent lorsque le processus du conteneur s'arrête. Le
healthcheck fournit donc un état exploitable par Docker Compose, par les futurs services
dépendants et, plus tard, par l'infrastructure de déploiement.
