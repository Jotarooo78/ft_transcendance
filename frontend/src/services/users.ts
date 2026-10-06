import type {
  AvatarUploadResponse,
  ProfileResponse,
  PublicUser,
  UpdateProfileRequest,
  UserDirectoryResponse,
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
