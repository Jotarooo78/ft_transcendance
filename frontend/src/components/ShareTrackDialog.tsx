import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { getAvatarSource } from "../avatar";
import { useLanguage } from "../hooks/useLanguage";
import { useResource } from "../hooks/useResource";
import {
  MAX_MESSAGE_LENGTH,
  openConversation,
  sendMessage,
} from "../services/chat";
import { translate as t, translateError } from "../services/translate";
import { getFriends } from "../services/users";
import type { ChatConversation } from "../types/chat";
import type { Track } from "../types/music";

type ShareTrackDialogProps = {
  track: Track;
  onClose: () => void;
  /** Affiche la conversation dans laquelle le morceau vient d'être partagé. */
  onOpenConversation: (conversation: ChatConversation) => void;
};

/**
 * Partage d'un morceau avec un ami : choisir l'ami, ajouter un mot si on veut, envoyer. Le message
 * part dans la conversation avec cet ami (créée si besoin) ; seuls les amis sont proposés.
 */
export default function ShareTrackDialog({
  track,
  onClose,
  onOpenConversation,
}: ShareTrackDialogProps) {
  useLanguage();
  const dialog = useRef<HTMLDialogElement>(null);
  const friends = useResource(useCallback((signal) => getFriends(signal), []));
  const [query, setQuery] = useState("");
  const [friendId, setFriendId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState<{
    conversation: ChatConversation;
    username: string;
  } | null>(null);

  /** Le dialogue natif gère le focus ; à la fermeture, le focus revient au menu d'origine. */
  useEffect(() => {
    const origin = document.activeElement;
    dialog.current?.showModal();
    return () => {
      if (origin instanceof HTMLElement && origin.isConnected) origin.focus();
    };
  }, []);

  const list = (friends.data ?? []).filter((friend) =>
    friend.username
      .toLocaleLowerCase()
      .includes(query.trim().toLocaleLowerCase()),
  );
  const chosen = friends.data?.find((friend) => friend.id === friendId);
  const noteLength = [...note.trim()].length;

  /** Ouvre (ou retrouve) la conversation avec l'ami, puis y envoie le morceau. */
  async function share(event: FormEvent) {
    event.preventDefault();
    if (!chosen || busy) return;
    setBusy(true);
    setError("");
    try {
      const conversation = await openConversation(chosen.id);
      const body = note.trim();
      await sendMessage(conversation.id, {
        trackId: track.id,
        ...(body ? { body } : {}),
      });
      setSent({ conversation, username: chosen.username });
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Unable to confirm this action. Please retry.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog
      ref={dialog}
      className="playlist-dialog share-dialog"
      aria-labelledby="share-track-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <h2 id="share-track-title">
        {t("Share “{0}” with a friend", { "0": track.title })}
      </h2>

      {sent ? (
        <>
          <p className="message success-message" role="status">
            {t("Sent to {0}.", { "0": sent.username })}
          </p>
          <div className="share-actions">
            <button
              type="button"
              onClick={() => {
                onOpenConversation(sent.conversation);
                onClose();
              }}
            >
              {t("Open conversation")}
            </button>
            <button
              type="button"
              className="cancel-edit-button"
              onClick={onClose}
            >
              {t("Close")}
            </button>
          </div>
        </>
      ) : (
        <form onSubmit={(event) => void share(event)}>
          <label>
            {t("Find a friend")}
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>

          <div className="share-friend-list">
            {friends.loading && !friends.data ? (
              <p className="chat-placeholder">{t("Loading friends…")}</p>
            ) : friends.error ? (
              <p className="message error-message" role="alert">
                {translateError(friends.error)}
              </p>
            ) : list.length === 0 ? (
              <p className="empty-friends-message">
                {(friends.data ?? []).length === 0
                  ? t("You have no friends yet.")
                  : t("No friend matches this search.")}
              </p>
            ) : (
              list.map((friend) => (
                <button
                  key={friend.id}
                  type="button"
                  className={
                    friend.id === friendId
                      ? "share-friend active"
                      : "share-friend"
                  }
                  aria-pressed={friend.id === friendId}
                  onClick={() => setFriendId(friend.id)}
                >
                  <img
                    className="chat-avatar"
                    src={getAvatarSource(friend.avatarUrl)}
                    alt=""
                  />
                  <span>{friend.username}</span>
                  <span
                    className={
                      friend.isOnline
                        ? "user-status online"
                        : "user-status offline"
                    }
                  >
                    <span className="status-indicator" aria-hidden="true" />
                    {friend.isOnline ? t("Online") : t("Offline")}
                  </span>
                </button>
              ))
            )}
          </div>

          <label>
            {t("Add a message (optional)")}
            <textarea
              value={note}
              rows={2}
              onChange={(event) => setNote(event.target.value)}
            />
          </label>

          {error && (
            <p className="message error-message" role="alert">
              {translateError(error)}
            </p>
          )}

          <div className="share-actions">
            <button
              type="submit"
              disabled={!chosen || busy || noteLength > MAX_MESSAGE_LENGTH}
            >
              {busy ? t("Sending…") : t("Send")}
            </button>
            <button
              type="button"
              className="cancel-edit-button"
              disabled={busy}
              onClick={onClose}
            >
              {t("Close")}
            </button>
          </div>
        </form>
      )}
    </dialog>
  );
}
