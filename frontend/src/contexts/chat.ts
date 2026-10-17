import { createContext, useContext } from "react";
import type { ChatConnection, ChatEvent } from "../types/chat";

/** Ce que la messagerie partage avec toute l'application connectée. */
export type ChatState = {
  /** Nombre total de messages non lus, pour le badge de la navigation. */
  unreadTotal: number;
  /** État de la connexion temps réel. */
  connection: ChatConnection;
  /** Relit le nombre de non-lus, par exemple après avoir marqué une conversation comme lue. */
  refreshUnread: () => void;
  /** Reçoit les événements temps réel ; renvoie la fonction de désabonnement. */
  subscribe: (listener: (event: ChatEvent) => void) => () => void;
  /** Prévient après une reconnexion ; renvoie la fonction de désabonnement. */
  onReconnect: (listener: () => void) => () => void;
};

/** Absent hors session : aucune fonction de messagerie n'est alors disponible. */
export const ChatContext = createContext<ChatState | null>(null);

/** Accède à la messagerie du compte connecté. */
export function useChat() {
  return useContext(ChatContext);
}
