import type { PublicUser } from "../types/auth";

export const mockUsers: PublicUser[] = [
  {
    id: "user-2",
    username: "Alice",
    bio: "Electronic music enthusiast.",
    avatarUrl: null,
    isOnline: true,
  },
  {
    id: "user-3",
    username: "Bob",
    bio: "I create ambient playlists.",
    avatarUrl: null,
    isOnline: false,
  },
  {
    id: "user-4",
    username: "Charlie",
    bio: "Independent music producer.",
    avatarUrl: null,
    isOnline: true,
  },
];
