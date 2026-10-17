-- File de nettoyage liée au projet ; ne contient que les UUID Media définitivement retirés.
ALTER TABLE catalog.releases ADD COLUMN pending_cleanup uuid[] NOT NULL DEFAULT ARRAY[]::uuid[];
