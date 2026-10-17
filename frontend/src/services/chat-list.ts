/** Mises à jour locales de la liste des conversations, sans requête : fonctions pures et testables. */
import type { ChatConversation, ChatMessage } from "../types/chat";

/** Trie du message le plus récent au plus ancien ; les conversations vides viennent en dernier. */
export function sortConversations(
  conversations: ChatConversation[],
): ChatConversation[] {
  return [...conversations].sort((a, b) => {
    const left = a.lastMessageAt ? Date.parse(a.lastMessageAt) : -Infinity;
    const right = b.lastMessageAt ? Date.parse(b.lastMessageAt) : -Infinity;
    return right - left;
  });
}

/**
 * Applique un nouveau message à la liste : il devient le dernier message de sa conversation, qui
 * remonte en tête. Le nombre de non-lus n'augmente que pour un message de l'autre dans une
 * conversation qui n'est pas affichée. Rejouer le même message ne change rien.
 * @returns La liste mise à jour, ou null si la conversation est inconnue (il faut alors relire).
 */
export function applyMessage(
  conversations: ChatConversation[],
  message: ChatMessage,
  options: { me: string; openConversationId: string | null },
): ChatConversation[] | null {
  const target = conversations.find(
    (conversation) => conversation.id === message.conversationId,
  );
  if (!target) return null;
  if (target.lastMessage && target.lastMessage.id >= message.id)
    return conversations;
  const counts =
    message.senderUserId !== options.me &&
    message.conversationId !== options.openConversationId;
  const updated: ChatConversation = {
    ...target,
    lastMessage: message,
    lastMessageAt: message.createdAt,
    unreadCount: counts ? target.unreadCount + 1 : target.unreadCount,
  };
  return sortConversations(
    conversations.map((conversation) =>
      conversation.id === target.id ? updated : conversation,
    ),
  );
}

/** Retire le texte d'un message supprimé s'il est le dernier affiché d'une conversation. */
export function applyDeletion(
  conversations: ChatConversation[],
  conversationId: string,
  messageId: number,
): ChatConversation[] {
  return conversations.map((conversation) =>
    conversation.id === conversationId &&
    conversation.lastMessage?.id === messageId
      ? {
          ...conversation,
          lastMessage: { ...conversation.lastMessage, body: null },
        }
      : conversation,
  );
}

/** Ajoute ou remplace une conversation (ouverture depuis la page Utilisateurs). */
export function upsertConversation(
  conversations: ChatConversation[],
  conversation: ChatConversation,
): ChatConversation[] {
  const others = conversations.filter((item) => item.id !== conversation.id);
  return sortConversations([conversation, ...others]);
}

/** Remet à zéro les non-lus d'une conversation que l'on vient de lire. */
export function clearUnread(
  conversations: ChatConversation[],
  conversationId: string,
): ChatConversation[] {
  return conversations.map((conversation) =>
    conversation.id === conversationId
      ? { ...conversation, unreadCount: 0 }
      : conversation,
  );
}

/** Ajoute des messages à un fil trié par numéro, sans doublon (réponse REST + événement). */
export function mergeMessages(
  current: ChatMessage[],
  incoming: ChatMessage[],
): ChatMessage[] {
  const byId = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) byId.set(message.id, message);
  return [...byId.values()].sort((a, b) => a.id - b.id);
}
