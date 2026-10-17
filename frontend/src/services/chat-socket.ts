/**
 * Connexion temps réel du chat. Le WebSocket ne sert qu'à recevoir : tout envoi passe par le REST.
 * Le navigateur ne peut pas ajouter le jeton à un WebSocket : on demande donc d'abord un ticket à
 * usage unique, puis on ouvre la connexion avec ce ticket dans l'adresse.
 */
import { getSocketTicket } from "./chat";
import type { ChatConnection, ChatEvent } from "../types/chat";

/** Réactions de l'interface à la vie de la connexion. */
export type ChatSocketHandlers = {
  /** Un événement vient d'arriver. */
  onEvent: (event: ChatEvent) => void;
  /** La connexion change d'état. */
  onStatus: (status: ChatConnection) => void;
  /** Reconnexion après une coupure : des événements ont pu être manqués, il faut relire. */
  onReconnect: () => void;
};

/** Délai maximal entre deux tentatives de reconnexion, en millisecondes. */
const MAX_RETRY_DELAY_MS = 30_000;

/** Vérifie qu'un message reçu est bien un des trois événements connus. */
function isChatEvent(value: unknown): value is ChatEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as Record<string, unknown>;
  return (
    typeof event.conversationId === "string" &&
    (event.type === "message.created" ||
      event.type === "message.deleted" ||
      event.type === "conversation.read")
  );
}

/** Adresse du WebSocket, sur le même hôte que la page (Nginx ou le proxy de Vite). */
function socketUrl(ticket: string): string {
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  return `${protocol}://${window.location.host}/api/chat/ws?ticket=${encodeURIComponent(ticket)}`;
}

/**
 * Ouvre la connexion et la rétablit seule après une coupure, avec un délai croissant (1 s, 2 s,
 * 4 s… jusqu'à 30 s). Chaque tentative demande un nouveau ticket : un ticket ne sert qu'une fois.
 * @returns Une fonction qui ferme définitivement la connexion (déconnexion, changement de compte).
 */
export function connectChatSocket(handlers: ChatSocketHandlers): () => void {
  let socket: WebSocket | null = null;
  let timer: number | undefined;
  let attempts = 0;
  let connectedOnce = false;
  let stopped = false;

  /** Programme la prochaine tentative après une panne. */
  function retryLater() {
    if (stopped) return;
    handlers.onStatus("offline");
    const delay = Math.min(1000 * 2 ** attempts, MAX_RETRY_DELAY_MS);
    attempts++;
    timer = window.setTimeout(() => void open(), delay);
  }

  /** Demande un ticket puis ouvre la connexion. */
  async function open() {
    if (stopped) return;
    handlers.onStatus("connecting");
    let ticket: string;
    try {
      ticket = await getSocketTicket();
    } catch {
      retryLater();
      return;
    }
    if (stopped) return;
    const current = new WebSocket(socketUrl(ticket));
    socket = current;
    current.onopen = () => {
      attempts = 0;
      handlers.onStatus("online");
      if (connectedOnce) handlers.onReconnect();
      connectedOnce = true;
    };
    current.onmessage = (message) => {
      try {
        const event: unknown = JSON.parse(String(message.data));
        if (isChatEvent(event)) handlers.onEvent(event);
      } catch {
        // Un message illisible est ignoré : le REST reste la source de vérité.
      }
    };
    current.onclose = () => {
      if (socket === current) socket = null;
      retryLater();
    };
  }

  void open();
  return () => {
    stopped = true;
    window.clearTimeout(timer);
    socket?.close();
    socket = null;
  };
}
