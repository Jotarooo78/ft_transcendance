/** Contrats des pochettes rattachées aux audios ; une ancienne représentation reste suivie jusqu’à son nettoyage. */
import type { CoverVariant as FileVariant, ValidatedFile } from './file.js'

/** Accès SQL atomiques pour remplacer/retirer une pochette et reprendre ses fichiers après panne. */
export type CoverStore = {
  /** Remplace la pochette après verrouillage de l’audio ready du propriétaire ; conserve les anciens chemins comme variantes retirées. */
  replace: (
    audioId: string,
    owner: string,
    image: ValidatedFile,
    storageKey: string
  ) => Promise<FileVariant>
  /** Détache la pochette sous le même contrôle propriétaire/état ; une absence de pochette est un succès. */
  remove: (audioId: string, owner: string) => Promise<void>
  /** Vérifie si une clé a été confirmée dans une variante avant de retirer les liens temporaires. */
  hasStorageKey: (key: string) => Promise<boolean>
  /** Liste bornée des seuls fichiers de pochettes retirées ; les variantes actives restent exclues. */
  retired: (maximum: number) => Promise<FileVariant[]>
  /** Efface les métadonnées d’une représentation retirée après suppression de ses octets. */
  forgetRetired: (key: string) => Promise<void>
}
