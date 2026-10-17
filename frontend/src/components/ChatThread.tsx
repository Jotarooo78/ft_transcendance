import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { getAvatarSource } from "../avatar";
import SharedTrack from "./SharedTrack";
import { useChat } from "../contexts/chat";
import { useLanguage } from "../hooks/useLanguage";
import {
  MAX_MESSAGE_LENGTH,
  deleteMessage,
  getMessages,
  markConversationRead,
  sendMessage,
} from "../services/chat";
import { formatClock, formatDay, formatFull } from "../services/chat-format";
import { mergeMessages } from "../services/chat-list";
import { translate as t, translateError } from "../services/translate";
import type { ChatConversation, ChatMessage, ChatPeer } from "../types/chat";

type ChatThreadProps = {
  conversation: ChatConversation;
  /** Nom et avatar du correspondant ; absent tant qu'ils ne sont pas chargés. */
  peer?: ChatPeer;
  /** Présence du correspondant s'il est ami ; null quand elle est inconnue. */
  peerOnline: boolean | null;
  /** Compte connecté. */
  me: string;
  /** Un message vient d'être envoyé : la liste des conversations le reprend. */
  onSent: (message: ChatMessage) => void;
  /** La conversation vient d'être marquée comme lue. */
  onRead: (conversationId: string) => void;
  /** Revient à la liste (petits écrans). */
  onBack: () => void;
};

/** Écart, en pixels, sous lequel on considère que l'utilisateur lit le bas du fil. */
const NEAR_BOTTOM_PX = 120;

/** Message d'erreur affichable à partir d'un refus. */
function errorText(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Unable to confirm this action. Please retry.";
}

/**
 * Fil d'une conversation : historique paginé, réception en direct par le WebSocket, envoi par le REST.
 * Il est remonté à chaque changement de conversation (clé), ce qui repart d'un état propre.
 */
export default function ChatThread({
  conversation,
  peer,
  peerOnline,
  me,
  onSent,
  onRead,
  onBack,
}: ChatThreadProps) {
  useLanguage();
  const chat = useChat();
  const conversationId = conversation.id;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [attempt, setAttempt] = useState(0);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  /** Dernier message que le correspondant a lu, appris par le temps réel. */
  const [peerReadUpTo, setPeerReadUpTo] = useState(0);

  const listRef = useRef<HTMLOListElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  /** Défilement à appliquer après le prochain rendu du fil. */
  const scrollPlan = useRef<"bottom" | { keepFrom: number } | null>("bottom");
  /** Dernier numéro connu, pour rattraper les messages manqués après une coupure. */
  const lastIdRef = useRef(0);
  /** Dernier message déjà signalé comme lu, pour ne pas répéter l'appel. */
  const markedRef = useRef(0);

  /** Lecture initiale : les 30 derniers messages, affichés du plus ancien au plus récent. */
  useEffect(() => {
    const controller = new AbortController();
    getMessages(conversationId, {}, controller.signal).then(
      (page) => {
        scrollPlan.current = "bottom";
        setMessages([...page.items].reverse());
        setHasMore(page.hasMore);
        setStatus("ready");
      },
      (failure) => {
        if (controller.signal.aborted) return;
        setError(errorText(failure));
        setStatus("error");
      },
    );
    return () => controller.abort();
  }, [conversationId, attempt]);

  useEffect(() => {
    lastIdRef.current = messages.at(-1)?.id ?? 0;
  }, [messages]);

  /** Applique le défilement prévu : bas du fil, ou position conservée après « plus anciens ». */
  useLayoutEffect(() => {
    const list = listRef.current;
    const plan = scrollPlan.current;
    scrollPlan.current = null;
    if (!list || !plan) return;
    list.scrollTop =
      plan === "bottom" ? list.scrollHeight : list.scrollHeight - plan.keepFrom;
  }, [messages]);

  /** Événements temps réel de cette conversation. */
  useEffect(() => {
    if (!chat) return;
    return chat.subscribe((event) => {
      if (event.conversationId !== conversationId) return;
      if (event.type === "message.created") {
        const list = listRef.current;
        const nearBottom =
          !list ||
          list.scrollHeight - list.scrollTop - list.clientHeight <
            NEAR_BOTTOM_PX;
        if (nearBottom || event.message.senderUserId === me)
          scrollPlan.current = "bottom";
        setMessages((current) => mergeMessages(current, [event.message]));
      }
      if (event.type === "message.deleted")
        setMessages((current) =>
          current.map((message) =>
            message.id === event.messageId
              ? { ...message, body: null }
              : message,
          ),
        );
      if (event.type === "conversation.read" && event.byUserId !== me)
        setPeerReadUpTo((value) => Math.max(value, event.lastReadMessageId));
    });
  }, [chat, conversationId, me]);

  /** Après une coupure du WebSocket, rattrape ce qui a été envoyé entre-temps. */
  useEffect(() => {
    if (!chat) return;
    return chat.onReconnect(() => {
      getMessages(conversationId, { after: lastIdRef.current }).then(
        (page) => {
          if (page.items.length) scrollPlan.current = "bottom";
          setMessages((current) => mergeMessages(current, page.items));
        },
        () => undefined,
      );
    });
  }, [chat, conversationId]);

  /** Marque comme lu dès qu'un message de l'autre est affiché dans un onglet visible. */
  useEffect(() => {
    const latestFromPeer = [...messages]
      .reverse()
      .find((message) => message.senderUserId !== me);
    if (!latestFromPeer) return;
    function markIfVisible() {
      const upTo = lastIdRef.current;
      if (
        document.visibilityState !== "visible" ||
        markedRef.current >= latestFromPeer!.id ||
        !upTo
      )
        return;
      markedRef.current = upTo;
      markConversationRead(conversationId, upTo).then(
        () => onRead(conversationId),
        () => {
          markedRef.current = 0;
        },
      );
    }
    markIfVisible();
    document.addEventListener("visibilitychange", markIfVisible);
    return () =>
      document.removeEventListener("visibilitychange", markIfVisible);
  }, [messages, conversationId, me, onRead]);

  /** Charge la page précédente en gardant le message lu à la même place à l'écran. */
  async function loadOlder() {
    const oldest = messages[0];
    if (!oldest || loadingOlder) return;
    setLoadingOlder(true);
    setError("");
    try {
      const page = await getMessages(conversationId, { before: oldest.id });
      const list = listRef.current;
      scrollPlan.current = list
        ? { keepFrom: list.scrollHeight - list.scrollTop }
        : null;
      setMessages((current) => mergeMessages(current, page.items));
      setHasMore(page.hasMore);
    } catch (failure) {
      setError(errorText(failure));
    } finally {
      setLoadingOlder(false);
    }
  }

  /** Envoie le brouillon ; il n'est effacé qu'une fois le message confirmé par le serveur. */
  async function send(event?: FormEvent) {
    event?.preventDefault();
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setError("");
    try {
      const message = await sendMessage(conversationId, { body });
      scrollPlan.current = "bottom";
      setMessages((current) => mergeMessages(current, [message]));
      setDraft("");
      onSent(message);
    } catch (failure) {
      setError(errorText(failure));
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }

  /** Entrée envoie ; Maj + Entrée va à la ligne. */
  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      void send();
    }
  }

  /** Supprime un de ses messages après confirmation. */
  async function remove(message: ChatMessage) {
    if (!window.confirm(t("Delete this message?"))) return;
    setError("");
    try {
      const deleted = await deleteMessage(conversationId, message.id);
      setMessages((current) => mergeMessages(current, [deleted]));
    } catch (failure) {
      setError(errorText(failure));
    }
  }

  const name = peer?.displayName ?? t("Unknown user");
  const lastSeenMine = messages
    .filter(
      (message) => message.senderUserId === me && message.id <= peerReadUpTo,
    )
    .at(-1)?.id;
  const length = [...draft.trim()].length;

  return (
    <section
      className="chat-thread"
      aria-label={t("Conversation with {0}", { "0": name })}
    >
      <header className="chat-thread-header">
        <button
          type="button"
          className="chat-back-button"
          onClick={onBack}
          aria-label={t("Back to conversations")}
        >
          ‹
        </button>
        <img
          className="chat-avatar"
          src={getAvatarSource(peer?.avatarUrl ?? null)}
          alt=""
        />
        <div className="chat-thread-identity">
          <h2>{name}</h2>
          {peer && <p>@{peer.username}</p>}
        </div>
        {peerOnline !== null && (
          <span
            className={
              peerOnline ? "user-status online" : "user-status offline"
            }
          >
            <span className="status-indicator" aria-hidden="true" />
            {peerOnline ? t("Online") : t("Offline")}
          </span>
        )}
      </header>

      {status === "loading" && (
        <p className="chat-placeholder">{t("Loading messages…")}</p>
      )}

      {status === "error" && (
        <div className="chat-placeholder">
          <p>{translateError(error)}</p>
          <button
            type="button"
            className="cancel-edit-button"
            onClick={() => {
              setError("");
              setStatus("loading");
              setAttempt((value) => value + 1);
            }}
          >
            {t("Retry")}
          </button>
        </div>
      )}

      {status === "ready" && (
        <ol className="chat-messages" ref={listRef} aria-live="polite">
          {hasMore && (
            <li className="chat-older">
              <button
                type="button"
                className="cancel-edit-button"
                disabled={loadingOlder}
                onClick={() => void loadOlder()}
              >
                {loadingOlder
                  ? t("Loading messages…")
                  : t("Load earlier messages")}
              </button>
            </li>
          )}
          {messages.length === 0 && (
            <li className="chat-empty">{t("No messages yet. Say hello!")}</li>
          )}
          {messages.map((message, index) => {
            const mine = message.senderUserId === me;
            const day = formatDay(message.createdAt);
            const newDay =
              index === 0 || formatDay(messages[index - 1].createdAt) !== day;
            return (
              <li
                key={message.id}
                className={mine ? "chat-message mine" : "chat-message"}
              >
                {newDay && <p className="chat-day">{day}</p>}
                <div className="chat-bubble">
                  {message.body === null ? (
                    <em className="chat-deleted">{t("Message deleted")}</em>
                  ) : (
                    <>
                      {message.trackId && (
                        <SharedTrack trackId={message.trackId} />
                      )}
                      {message.body && <p>{message.body}</p>}
                    </>
                  )}
                </div>
                <div className="chat-meta">
                  <time
                    dateTime={message.createdAt}
                    title={formatFull(message.createdAt)}
                  >
                    {formatClock(message.createdAt)}
                  </time>
                  {message.id === lastSeenMine && <span>· {t("Seen")}</span>}
                  {mine && message.body !== null && (
                    <button
                      type="button"
                      className="chat-delete-button"
                      onClick={() => void remove(message)}
                      aria-label={t("Delete message")}
                      title={t("Delete message")}
                    >
                      <svg
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                        focusable="false"
                      >
                        <path d="M9 3h6l1 2h4v2H4V5h4l1-2Zm-3 6h12l-1 12H7L6 9Zm4 2v8h2v-8h-2Zm4 0v8h-2v-8h2Z" />
                      </svg>
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {error && status === "ready" && (
        <p className="message error-message chat-error" role="alert">
          {translateError(error)}
        </p>
      )}

      <form className="chat-composer" onSubmit={(event) => void send(event)}>
        <label className="chat-composer-field">
          <span className="visually-hidden">{t("Message")}</span>
          <textarea
            ref={inputRef}
            value={draft}
            rows={1}
            maxLength={MAX_MESSAGE_LENGTH * 2}
            placeholder={t("Write a message…")}
            disabled={status !== "ready"}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={handleKeyDown}
          />
        </label>
        <button
          type="submit"
          disabled={
            status !== "ready" ||
            sending ||
            length === 0 ||
            length > MAX_MESSAGE_LENGTH
          }
        >
          {sending ? t("Sending…") : t("Send")}
        </button>
        {length > MAX_MESSAGE_LENGTH - 200 && (
          <p className="character-count chat-count">
            {length}/{MAX_MESSAGE_LENGTH}
          </p>
        )}
      </form>
    </section>
  );
}
