-- Un message peut partager un morceau du catalogue : on garde seulement son identifiant (référence),
-- jamais une copie de son titre ou de sa pochette. Si le morceau est retiré, le client affiche
-- « morceau indisponible ».
ALTER TABLE "chat"."messages" ADD COLUMN "track_id" UUID;

-- Un message contient du texte, un morceau, ou les deux. Le texte d'un message qui ne partage qu'un
-- morceau est une chaîne vide.
ALTER TABLE "chat"."messages" DROP CONSTRAINT "messages_body_check";
ALTER TABLE "chat"."messages" ADD CONSTRAINT "messages_content_check"
    CHECK (
        char_length(btrim("body")) <= 2000
        AND (char_length(btrim("body")) >= 1 OR "track_id" IS NOT NULL)
    );
