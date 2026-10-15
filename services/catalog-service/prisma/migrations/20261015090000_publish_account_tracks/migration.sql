-- Présentation des morceaux publiés depuis un compte ; les données historiques sont conservées.
ALTER TABLE catalog.tracks ADD COLUMN description TEXT;
ALTER TABLE catalog.tracks ADD CONSTRAINT tracks_description_check
  CHECK (description IS NULL OR char_length(description) <= 5000);
-- Un audio ajouté par un compte produit un seul morceau, y compris après une réponse réseau perdue.
CREATE UNIQUE INDEX tracks_account_audio_key ON catalog.tracks(audio_asset_id)
  WHERE created_by_user_id IS NOT NULL AND audio_asset_id IS NOT NULL;
