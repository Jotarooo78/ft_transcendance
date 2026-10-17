/** Client REST de chat-service : chaque réponse est vérifiée avant d'être utilisée par l'interface. */
import { RequestError, jsonCommand, requestJson } from "./request-json";
import type {
  ChatConversation,
  ChatMessage,
  ChatMessagePage,
  ChatPeer,
} from "../types/chat";

/** Préfixe public du service ; Nginx le retire avant de transmettre. */
const base = "/api/chat";
/** Nombre de messages chargés à l'ouverture d'une conversation et à chaque « plus anciens ». */
export const HISTORY_PAGE_SIZE = 30;
/** Longueur maximale d'un message, identique à celle du serveur. */
export const MAX_MESSAGE_LENGTH = 2000;

/** Messages affichables associés aux codes d'erreur du contrat du chat. */
const errorMessages: Record<string, string> = {
  not_friends: "You can only message your friends.",
  conversation_not_found: "This conversation is no longer available.",
  message_not_found: "This message is no longer available.",
  invalid_message: "A message must contain between 1 and 2000 characters.",
  cannot_chat_with_yourself: "You cannot message yourself.",
  chat_unavailable: "Messaging is temporarily unavailable. Please retry.",
};

/** Remplace le message générique d'un refus par celui de son code métier, quand il est connu. */
function explain(error: unknown): never {
  if (error instanceof RequestError && error.code && errorMessages[error.code])
    throw new RequestError(error.status, errorMessages[error.code], error.code);
  throw error;
}

/** Exécute une requête du chat en traduisant ses refus connus. */
async function request(path: string, options: RequestInit = {}) {
  try {
    return await requestJson(base + path, options);
  } catch (error) {
    explain(error);
  }
}

/** Vérifie la forme d'un message avant de l'afficher. */
function isMessage(value: unknown): value is ChatMessage {
  if (!value || typeof value !== "object") return false;
  const m = value as Record<string, unknown>;
  return (
    typeof m.id === "number" &&
    Number.isSafeInteger(m.id) &&
    typeof m.conversationId === "string" &&
    typeof m.senderUserId === "string" &&
    (typeof m.body === "string" || m.body === null) &&
    typeof m.createdAt === "string" &&
    (typeof m.deletedAt === "string" || m.deletedAt === null)
  );
}

/** Vérifie la forme d'une conversation avant de l'afficher. */
function isConversation(value: unknown): value is ChatConversation {
  if (!value || typeof value !== "object") return false;
  const c = value as Record<string, unknown>;
  return (
    typeof c.id === "string" &&
    typeof c.peerUserId === "string" &&
    (c.lastMessage === null || isMessage(c.lastMessage)) &&
    typeof c.unreadCount === "number" &&
    (typeof c.lastMessageAt === "string" || c.lastMessageAt === null) &&
    typeof c.createdAt === "string"
  );
}

/** Refuse une réponse inattendue plutôt que d'afficher des données incohérentes. */
function invalid(): never {
  throw new Error("Unable to confirm this action. Please retry.");
}

/** Lit toutes les conversations du compte, la plus récente d'abord (100 suffisent largement ici). */
export async function getConversations(
  signal?: AbortSignal,
): Promise<ChatConversation[]> {
  const page = await request("/conversations?pageSize=100", { signal });
  if (
    !page ||
    typeof page !== "object" ||
    !("items" in page) ||
    !Array.isArray(page.items) ||
    !page.items.every(isConversation)
  )
    invalid();
  return page.items;
}

/** Ouvre la conversation avec un ami, ou renvoie celle qui existe déjà. */
export async function openConversation(
  peerUserId: string,
): Promise<ChatConversation> {
  const conversation = await request(
    "/conversations",
    jsonCommand("POST", { peerUserId }),
  );
  if (!isConversation(conversation)) invalid();
  return conversation;
}

/** Lit une page d'historique : `before` remonte dans le temps, `after` rattrape ce qui a été manqué. */
export async function getMessages(
  conversationId: string,
  cursor: { before?: number; after?: number },
  signal?: AbortSignal,
): Promise<ChatMessagePage> {
  const query = new URLSearchParams({ limit: String(HISTORY_PAGE_SIZE) });
  if (cursor.before !== undefined) query.set("before", String(cursor.before));
  if (cursor.after !== undefined) query.set("after", String(cursor.after));
  const page = await request(
    `/conversations/${conversationId}/messages?${query}`,
    { signal },
  );
  if (
    !page ||
    typeof page !== "object" ||
    !("items" in page) ||
    !("hasMore" in page) ||
    !Array.isArray(page.items) ||
    !page.items.every(isMessage) ||
    typeof page.hasMore !== "boolean"
  )
    invalid();
  return { items: page.items, hasMore: page.hasMore };
}

/** Envoie un message ; le serveur le renvoie avec son numéro définitif. */
export async function sendMessage(
  conversationId: string,
  body: string,
): Promise<ChatMessage> {
  const message = await request(
    `/conversations/${conversationId}/messages`,
    jsonCommand("POST", { body }),
  );
  if (!isMessage(message)) invalid();
  return message;
}

/** Supprime un de ses messages ; le serveur renvoie le message sans texte. */
export async function deleteMessage(
  conversationId: string,
  messageId: number,
): Promise<ChatMessage> {
  const message = await request(
    `/conversations/${conversationId}/messages/${messageId}`,
    { method: "DELETE" },
  );
  if (!isMessage(message)) invalid();
  return message;
}

/** Marque la conversation comme lue jusqu'à un message ; le repère ne recule jamais. */
export async function markConversationRead(
  conversationId: string,
  upToMessageId: number,
): Promise<void> {
  await request(
    `/conversations/${conversationId}/read`,
    jsonCommand("POST", { upToMessageId }),
  );
}

/** Nombre total de messages non lus, pour le badge de la navigation. */
export async function getUnreadTotal(signal?: AbortSignal): Promise<number> {
  const result = await request("/unread", { signal });
  if (
    !result ||
    typeof result !== "object" ||
    !("total" in result) ||
    typeof result.total !== "number"
  )
    invalid();
  return result.total;
}

/** Ticket à usage unique (30 s) qui autorise l'ouverture d'un WebSocket. */
export async function getSocketTicket(): Promise<string> {
  const result = await request("/ws-ticket", { method: "POST" });
  if (
    !result ||
    typeof result !== "object" ||
    !("ticket" in result) ||
    typeof result.ticket !== "string"
  )
    invalid();
  return result.ticket;
}

/** Lit le nom et l'avatar d'un correspondant ; la route est publique et ne dépend pas de l'amitié. */
export async function getPeer(
  userId: string,
  signal?: AbortSignal,
): Promise<ChatPeer> {
  const profile = await requestJson(`/api/users/profile/${userId}`, {
    signal,
  });
  if (
    !profile ||
    typeof profile !== "object" ||
    !("userId" in profile) ||
    !("username" in profile) ||
    !("displayName" in profile) ||
    typeof profile.userId !== "string" ||
    typeof profile.username !== "string" ||
    typeof profile.displayName !== "string"
  )
    invalid();
  const avatarUrl =
    "avatarUrl" in profile && typeof profile.avatarUrl === "string"
      ? profile.avatarUrl
      : null;
  return {
    id: profile.userId,
    displayName: profile.displayName,
    username: profile.username,
    avatarUrl,
  };
}
