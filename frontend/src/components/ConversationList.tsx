import { useState, type FormEvent } from "react";
import { getAvatarSource } from "../avatar";
import { useLanguage } from "../hooks/useLanguage";
import { formatListTime } from "../services/chat-format";
import { translate as t } from "../services/translate";
import type { ChatConversation, ChatPeer } from "../types/chat";
import type { PublicUser } from "../types/auth";

type ConversationListProps = {
  conversations: ChatConversation[];
  /** Conversations en cours de première lecture. */
  loading: boolean;
  selectedId: string | null;
  me: string;
  /** Profils connus des correspondants, par identifiant de compte. */
  peers: Map<string, ChatPeer>;
  /** Amis à qui l'on peut écrire. */
  friends: PublicUser[];
  onSelect: (conversationId: string) => void;
  onStart: (friendId: string) => void;
};

/** Colonne de gauche : démarrer une conversation avec un ami, puis choisir parmi les existantes. */
export default function ConversationList({
  conversations,
  loading,
  selectedId,
  me,
  peers,
  friends,
  onSelect,
  onStart,
}: ConversationListProps) {
  useLanguage();
  const [friendId, setFriendId] = useState("");

  function start(event: FormEvent) {
    event.preventDefault();
    if (!friendId) return;
    onStart(friendId);
    setFriendId("");
  }

  return (
    <aside className="conversation-panel" aria-label={t("Conversations")}>
      <form className="new-conversation" onSubmit={start}>
        <label>
          {t("New message")}
          <select
            value={friendId}
            onChange={(event) => setFriendId(event.target.value)}
            disabled={friends.length === 0}
          >
            <option value="">
              {friends.length === 0
                ? t("Add friends to start chatting")
                : t("Choose a friend")}
            </option>
            {friends.map((friend) => (
              <option key={friend.id} value={friend.id}>
                {friend.username}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" disabled={!friendId}>
          {t("Open")}
        </button>
      </form>

      {loading && conversations.length === 0 ? (
        <p className="chat-placeholder">{t("Loading conversations…")}</p>
      ) : conversations.length === 0 ? (
        <p className="empty-friends-message">
          {t("No conversations yet. Start one with a friend.")}
        </p>
      ) : (
        <ul className="conversation-list">
          {conversations.map((conversation) => {
            const peer = peers.get(conversation.peerUserId);
            const last = conversation.lastMessage;
            const preview =
              last === null
                ? t("No messages yet")
                : last.body === null
                  ? t("Message deleted")
                  : last.senderUserId === me
                    ? t("You: {0}", { "0": last.body || t("Shared a track") })
                    : last.body || t("Shared a track");
            const selected = conversation.id === selectedId;
            return (
              <li key={conversation.id}>
                <button
                  type="button"
                  className={
                    selected ? "conversation-item active" : "conversation-item"
                  }
                  aria-current={selected ? "true" : undefined}
                  onClick={() => onSelect(conversation.id)}
                >
                  <img
                    className="chat-avatar"
                    src={getAvatarSource(peer?.avatarUrl ?? null)}
                    alt=""
                  />
                  <span className="conversation-text">
                    <strong>{peer?.username ?? t("Unknown user")}</strong>
                    <span className="conversation-preview">{preview}</span>
                  </span>
                  <span className="conversation-side">
                    <time dateTime={conversation.lastMessageAt ?? undefined}>
                      {formatListTime(conversation.lastMessageAt)}
                    </time>
                    {conversation.unreadCount > 0 && (
                      <span
                        className="chat-badge"
                        aria-label={t("Unread messages: {0}", {
                          "0": conversation.unreadCount,
                        })}
                      >
                        {conversation.unreadCount}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}
