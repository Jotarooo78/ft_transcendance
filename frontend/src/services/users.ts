import type {
  AvatarUploadResponse,
  ProfileResponse,
  PublicUser,
  UpdateProfileRequest,
  UserDirectoryResponse,
  FriendsResponse,
} from "../types/auth";

import { authenticatedFetch } from "./api";

import { clearAccessToken, getAccessToken } from "./session";

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

export type AvatarUploadProgress = {
  phase: "uploading" | "processing";
  loaded: number;
  total: number | null;
  percent: number | null;
};

export function uploadMyAvatar(
  avatarFile: File,
  onProgress?: (progress: AvatarUploadProgress) => void,
): Promise<AvatarUploadResponse> {
  const token = getAccessToken();

  if (token === null) {
    return Promise.reject(new Error("Please log in first."));
  }

  const formData = new FormData();

  formData.append("avatar", avatarFile);

  return new Promise<AvatarUploadResponse>((resolve, reject) => {
    const request = new XMLHttpRequest();

    request.open("POST", "/api/users/me/avatar");

    request.setRequestHeader("Authorization", `Bearer ${token}`);

    request.upload.onprogress = (event) => {
      const total = event.lengthComputable ? event.total : null;

      const percent =
        total !== null && total > 0
          ? Math.round((event.loaded / total) * 100)
          : null;

      onProgress?.({
        phase: "uploading",
        loaded: event.loaded,
        total,
        percent,
      });
    };

    request.upload.onload = () => {
      onProgress?.({
        phase: "processing",
        loaded: avatarFile.size,
        total: avatarFile.size,
        percent: 100,
      });
    };

    request.onload = () => {
      let data: AvatarUploadResponse | { error?: string };

      try {
        data = JSON.parse(request.responseText) as
          | AvatarUploadResponse
          | { error?: string };
      } catch {
        reject(new Error("The server returned an invalid response."));
        return;
      }

      if (request.status === 401) {
        if (getAccessToken() === token) {
          clearAccessToken();
        }

        reject(
          new Error("Your session is invalid or expired. Please log in again."),
        );
        return;
      }

      if (request.status < 200 || request.status >= 300) {
        const message =
          "error" in data && data.error
            ? data.error
            : "Unable to upload avatar.";

        reject(new Error(message));
        return;
      }

      resolve(data as AvatarUploadResponse);
    };

    // Navigateur ne parvient pas a contacter le serveur
    request.onerror = () => {
      reject(
        new Error("Unable to contact the server while uploading the avatar."),
      );
    };

    request.send(formData);
  });
}

export async function deleteMyAvatar(): Promise<ProfileResponse> {
  const response = await authenticatedFetch("/api/users/me/avatar", {
    method: "DELETE",
  });

  const data = (await response.json()) as ProfileResponse | { error?: string };

  if (!response.ok) {
    throw new Error(
      "error" in data && data.error ? data.error : "Unable to remove avatar.",
    );
  }

  return data as ProfileResponse;
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
