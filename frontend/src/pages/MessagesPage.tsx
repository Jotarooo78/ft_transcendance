import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ChatThread from "../components/ChatThread";
import ConversationList from "../components/ConversationList";
import RefreshNotice from "../components/RefreshNotice";
import { useChat } from "../contexts/chat";
import { useLanguage } from "../hooks/useLanguage";
import { useResource } from "../hooks/useResource";
import { getConversations, getPeer, openConversation } from "../services/chat";
import {
  applyDeletion,
  applyMessage,
  clearUnread,
  upsertConversation,
} from "../services/chat-list";
import { translate as t, translateError } from "../services/translate";
import type { AuthenticatedUser, PublicUser } from "../types/auth";
import type { ChatConversation, ChatMessage, ChatPeer } from "../types/chat";

type MessagesPageProps = {
  user: AuthenticatedUser;
  friends: PublicUser[];
  /** Conversation ouverte depuis une autre page (bouton « Message »), affichée dès l'arrivée. */
  initialConversation: ChatConversation | null;
};

/** Messagerie : liste des conversations à gauche, fil de la conversation choisie à droite. */
export default function MessagesPage({
  user,
  friends,
  initialConversation,
}: MessagesPageProps) {
  useLanguage();
  const chat = useChat();
  const me = user.id;

  const list = useResource(
    useCallback((signal) => getConversations(signal), []),
  );
  /** La conversation demandée reste visible même si la liste n'a pas encore été relue. */
  const conversations = useMemo(() => {
    const loaded = list.data ?? [];
    return initialConversation &&
      !loaded.some((item) => item.id === initialConversation.id)
      ? upsertConversation(loaded, initialConversation)
      : loaded;
  }, [list.data, initialConversation]);
  const { update, reload } = list;

  const [selectedId, setSelectedId] = useState<string | null>(
    initialConversation?.id ?? null,
  );
  const [error, setError] = useState("");
  const [fetchedPeers, setFetchedPeers] = useState(new Map<string, ChatPeer>());

  /** Valeurs lues par les abonnements temps réel, sans les réabonner à chaque rendu. */
  const selectedRef = useRef(selectedId);
  const conversationsRef = useRef(conversations);
  useEffect(() => {
    selectedRef.current = selectedId;
    conversationsRef.current = conversations;
  }, [selectedId, conversations]);

  /** Profils des correspondants : les amis sont déjà connus, les autres sont lus une fois. */
  const peers = useMemo(() => {
    const result = new Map(fetchedPeers);
    for (const friend of friends)
      result.set(friend.id, {
        id: friend.id,
        displayName: friend.displayName,
        username: friend.username,
        avatarUrl: friend.avatarUrl,
      });
    return result;
  }, [friends, fetchedPeers]);

  useEffect(() => {
    const missing = conversations
      .map((conversation) => conversation.peerUserId)
      .filter((id) => !peers.has(id));
    if (missing.length === 0) return;
    const controller = new AbortController();
    Promise.allSettled(
      [...new Set(missing)].map((id) => getPeer(id, controller.signal)),
    ).then((results) => {
      if (controller.signal.aborted) return;
      const found = results.flatMap((result) =>
        result.status === "fulfilled" ? [result.value] : [],
      );
      if (found.length)
        setFetchedPeers((current) => {
          const next = new Map(current);
          for (const peer of found) next.set(peer.id, peer);
          return next;
        });
    });
    return () => controller.abort();
  }, [conversations, peers]);

  /** Tient la liste à jour avec les événements temps réel. */
  useEffect(() => {
    if (!chat) return;
    const unsubscribe = chat.subscribe((event) => {
      if (event.type === "message.created") {
        const next = applyMessage(conversationsRef.current, event.message, {
          me,
          openConversationId: selectedRef.current,
        });
        if (next === null) reload();
        else update(() => next);
      }
      if (event.type === "message.deleted")
        update((current) =>
          applyDeletion(current ?? [], event.conversationId, event.messageId),
        );
    });
    const stopReconnect = chat.onReconnect(reload);
    return () => {
      unsubscribe();
      stopReconnect();
    };
  }, [chat, me, update, reload]);

  /** Ouvre (ou retrouve) la conversation avec un ami puis l'affiche. */
  const start = useCallback(
    async (peerUserId: string) => {
      try {
        const conversation = await openConversation(peerUserId);
        update((current) => upsertConversation(current ?? [], conversation));
        setError("");
        setSelectedId(conversation.id);
      } catch (failure) {
        setError(
          failure instanceof Error
            ? failure.message
            : "Unable to confirm this action. Please retry.",
        );
      }
    },
    [update],
  );

  const handleSent = useCallback(
    (message: ChatMessage) => {
      const next = applyMessage(conversationsRef.current, message, {
        me,
        openConversationId: message.conversationId,
      });
      if (next) update(() => next);
    },
    [me, update],
  );

  const refreshUnread = chat?.refreshUnread;
  const handleRead = useCallback(
    (conversationId: string) => {
      update((current) => clearUnread(current ?? [], conversationId));
      refreshUnread?.();
    },
    [update, refreshUnread],
  );

  const selected =
    conversations.find((conversation) => conversation.id === selectedId) ??
    null;
  const friendIds = new Set(friends.map((friend) => friend.id));
  const selectedFriend = selected
    ? friends.find((friend) => friend.id === selected.peerUserId)
    : undefined;

  return (
    <main className="messages-page">
      <header>
        <p className="page-label">{t("Community")}</p>
        <div className="messages-title">
          <h1>{t("Messages")}</h1>
          {chat && (
            <span className={`chat-connection ${chat.connection}`}>
              <span className="status-indicator" aria-hidden="true" />
              {chat.connection === "online"
                ? t("Live")
                : chat.connection === "connecting"
                  ? t("Connecting…")
                  : t("Reconnecting…")}
            </span>
          )}
        </div>
        <p>{t("Chat in real time with your friends.")}</p>
      </header>

      <RefreshNotice
        retained={!!list.data}
        error={list.error ?? list.refreshError}
        retry={reload}
      />
      {error && (
        <p className="message error-message" role="alert">
          {translateError(error)}
        </p>
      )}

      <div
        className={
          selected ? "messages-layout has-selection" : "messages-layout"
        }
      >
        <ConversationList
          conversations={conversations}
          loading={list.loading}
          selectedId={selectedId}
          me={me}
          peers={peers}
          friends={friends}
          onSelect={(id) => {
            setError("");
            setSelectedId(id);
          }}
          onStart={(id) => void start(id)}
        />

        {selected ? (
          <ChatThread
            key={selected.id}
            conversation={selected}
            peer={peers.get(selected.peerUserId)}
            peerOnline={
              friendIds.has(selected.peerUserId)
                ? !!selectedFriend?.isOnline
                : null
            }
            me={me}
            onSent={handleSent}
            onRead={handleRead}
            onBack={() => setSelectedId(null)}
          />
        ) : (
          <section className="chat-thread chat-thread-empty">
            <p className="chat-placeholder">
              {t("Select a conversation to start chatting.")}
            </p>
          </section>
        )}
      </div>
    </main>
  );
}
