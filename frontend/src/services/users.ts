import type {
  AvatarUploadResponse,
  ProfileResponse,
  PublicUser,
  UpdateProfileRequest,
  UserDirectoryResponse,
  FriendsResponse,
} from "../types/auth";

import { authenticatedFetch } from "./api";

export async function updateMyProfile(
  request: UpdateProfileRequest,
): Promise<ProfileResponse> {
  const response = await authenticatedFetch("/api/users/me/profile", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error ?? "Unable to update profile.");
  }

  return data;
}

export async function uploadMyAvatar(
  avatarFile: File,
): Promise<AvatarUploadResponse> {
  const formData = new FormData();

  formData.append("avatar", avatarFile);

  const response = await authenticatedFetch("/api/users/me/avatar", {
    method: "POST",
    body: formData,
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error ?? "Unable to upload avatar.");
  }

  return data;
}

export async function getUsers(): Promise<PublicUser[]> {
  const response = await authenticatedFetch("/api/users/profiles");

  const data = (await response.json()) as
    | UserDirectoryResponse
    | { error?: string };

  if (!response.ok) {
    throw new Error(
      "error" in data && data.error ? data.error : "Unable to load users.",
    );
  }

  const directory = data as UserDirectoryResponse;

  return directory.users.map((user) => ({
    id: user.userId,
    displayName: user.displayName,
    username: user.username,
    bio: user.bio,
    avatarUrl: user.avatarUrl,
    isOnline: user.onlineStatus === "online",
  }));
}

export async function getFriends(): Promise<PublicUser[]> {
  const response = await authenticatedFetch("/api/users/friends");

  const data = (await response.json()) as FriendsResponse | { error?: string };

  if (!response.ok) {
    throw new Error(
      "error" in data && data.error ? data.error : "Unable to load friends.",
    );
  }

  const friendsResponse = data as FriendsResponse;

  return friendsResponse.friends.map((friend) => ({
    id: friend.userId,
    displayName: friend.displayName,
    username: friend.username,
    bio: friend.bio,
    avatarUrl: friend.avatarUrl,
    isOnline: friend.onlineStatus === "online",
  }));
}

export async function addFriend(friendId: string): Promise<void> {
  const response = await authenticatedFetch(`/api/users/friends/${friendId}`, {
    method: "POST",
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error ?? "Unable to add friend.");
  }
}

export async function removeFriend(friendId: string): Promise<void> {
  const response = await authenticatedFetch(`/api/users/friends/${friendId}`, {
    method: "DELETE",
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error ?? "Unable to remove friend.");
  }
}

export async function sendPresenceHeartbeat(): Promise<void> {
  const response = await authenticatedFetch("/api/users/presence/heartbeat", {
    method: "POST",
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error ?? "Unable to update online presence.");
  }
}

export async function markPresenceOffline(): Promise<void> {
  const response = await authenticatedFetch("/api/users/presence/offline", {
    method: "POST",
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error ?? "Unable to update offline presence.");
  }
}
