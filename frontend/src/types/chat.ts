/** Formes échangées avec chat-service ; voir backend/docs/IMPLEMENTER_LE_CHAT.md, section 3. */

/** Message d'une conversation ; `body` vaut null une fois le message supprimé. */
export type ChatMessage = {
  /** Numéro croissant : sert d'ordre, de curseur et de repère « lu jusqu'ici ». */
  id: number;
  conversationId: string;
  senderUserId: string;
  body: string | null;
  createdAt: string;
  deletedAt: string | null;
};

/** Conversation vue par le compte connecté. */
export type ChatConversation = {
  id: string;
  /** L'autre personne ; son nom et son avatar se lisent via user-service. */
  peerUserId: string;
  lastMessage: ChatMessage | null;
  /** Messages de l'autre que le compte connecté n'a pas encore lus. */
  unreadCount: number;
  lastMessageAt: string | null;
  createdAt: string;
};

/** Page d'historique : `hasMore` indique qu'il reste des messages à charger. */
export type ChatMessagePage = { items: ChatMessage[]; hasMore: boolean };

/** Événements poussés par le serveur sur le WebSocket. */
export type ChatEvent =
  | { type: "message.created"; conversationId: string; message: ChatMessage }
  | { type: "message.deleted"; conversationId: string; messageId: number }
  | {
      type: "conversation.read";
      conversationId: string;
      byUserId: string;
      lastReadMessageId: number;
    };

/** État de la connexion temps réel, affiché discrètement dans la messagerie. */
export type ChatConnection = "connecting" | "online" | "offline";

/** Profil minimal d'un correspondant, lu sur la route publique de user-service. */
export type ChatPeer = {
  id: string;
  displayName: string;
  username: string;
  avatarUrl: string | null;
};
