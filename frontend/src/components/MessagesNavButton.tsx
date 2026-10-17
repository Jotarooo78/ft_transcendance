import { useChat } from "../contexts/chat";
import { useLanguage } from "../hooks/useLanguage";
import { translate as t } from "../services/translate";

/** Onglet Messagerie de la navigation, avec le nombre de messages non lus. */
export default function MessagesNavButton({
  active,
  onClick,
}: {
  /** Onglet affiché en ce moment. */ active: boolean;
  onClick: () => void;
}) {
  useLanguage();
  const unread = useChat()?.unreadTotal ?? 0;
  return (
    <button
      type="button"
      className={active ? "navigation-button active" : "navigation-button"}
      aria-pressed={active}
      onClick={onClick}
    >
      {t("Messages")}
      {unread > 0 && (
        <span
          className="chat-badge navigation-badge"
          aria-label={t("Unread messages: {0}", { "0": unread })}
        >
          {unread > 99 ? "99+" : unread}
        </span>
      )}
    </button>
  );
}
