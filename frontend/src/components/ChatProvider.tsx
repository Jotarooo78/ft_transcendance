import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ChatContext } from "../contexts/chat";
import { useVisibleRefresh } from "../hooks/useVisibleRefresh";
import { getUnreadTotal } from "../services/chat";
import { connectChatSocket } from "../services/chat-socket";
import type {
  ChatConnection,
  ChatConversation,
  ChatEvent,
} from "../types/chat";
import type { Track } from "../types/music";
import ShareTrackDialog from "./ShareTrackDialog";

/**
 * Ouvre une seule connexion temps réel pour tout le compte connecté et la partage : la navigation y
 * lit le badge des non-lus, la messagerie s'abonne aux événements. Doit être remonté (clé du compte)
 * à chaque changement de compte, pour fermer l'ancienne connexion.
 */
export default function ChatProvider({
  userId,
  onOpenConversation,
  children,
}: {
  /** Compte connecté : ses propres messages ne comptent pas comme non lus. */ userId: string;
  /** Affiche la messagerie sur une conversation (après un partage de morceau). */ onOpenConversation: (
    conversation: ChatConversation,
  ) => void;
  children: ReactNode;
}) {
  const [unreadTotal, setUnreadTotal] = useState(0);
  const [connection, setConnection] = useState<ChatConnection>("connecting");
  const listeners = useRef(new Set<(event: ChatEvent) => void>());
  const reconnectListeners = useRef(new Set<() => void>());
  /** Morceau en cours de partage ; la fenêtre de partage est affichée tant qu'il est défini. */
  const [sharing, setSharing] = useState<Track | null>(null);
  const shareTrack = useCallback((track: Track) => setSharing(track), []);

  /** Relit le compteur ; une panne garde simplement la dernière valeur connue. */
  const refreshUnread = useCallback(() => {
    getUnreadTotal().then(setUnreadTotal, () => undefined);
  }, []);

  useVisibleRefresh(refreshUnread);

  useEffect(() => {
    return connectChatSocket({
      onEvent: (event) => {
        if (
          event.type === "message.created" &&
          event.message.senderUserId !== userId
        )
          setUnreadTotal((total) => total + 1);
        if (event.type === "message.deleted") refreshUnread();
        for (const listener of listeners.current) listener(event);
      },
      onStatus: setConnection,
      onReconnect: () => {
        refreshUnread();
        for (const listener of reconnectListeners.current) listener();
      },
    });
  }, [userId, refreshUnread]);

  const subscribe = useCallback((listener: (event: ChatEvent) => void) => {
    listeners.current.add(listener);
    return () => {
      listeners.current.delete(listener);
    };
  }, []);

  const onReconnect = useCallback((listener: () => void) => {
    reconnectListeners.current.add(listener);
    return () => {
      reconnectListeners.current.delete(listener);
    };
  }, []);

  return (
    <ChatContext.Provider
      value={{
        unreadTotal,
        connection,
        refreshUnread,
        subscribe,
        onReconnect,
        shareTrack,
      }}
    >
      {children}
      {sharing && (
        <ShareTrackDialog
          key={sharing.id}
          track={sharing}
          onClose={() => setSharing(null)}
          onOpenConversation={onOpenConversation}
        />
      )}
    </ChatContext.Provider>
  );
}
