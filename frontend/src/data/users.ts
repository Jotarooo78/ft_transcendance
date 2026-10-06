import type { PublicUser } from "../types/auth";

export const mockUsers: PublicUser[] = [
  {
    id: "user-2",
    displayName: "Alice",
    username: "Alice",
    bio: "Electronic music enthusiast.",
    avatarUrl: null,
    isOnline: true,
  },
  {
    id: "user-3",
    displayName: "Bob",
    username: "Bob",
    bio: "I create ambient playlists.",
    avatarUrl: null,
    isOnline: false,
  },
  {
    id: "user-4",
    displayName: "Charlie",
    username: "Charlie",
    bio: "Independent music producer.",
    avatarUrl: null,
    isOnline: true,
  },
];
