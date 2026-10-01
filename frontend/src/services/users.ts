import type {
  ProfileResponse,
  UpdateProfileRequest,
  AvatarUploadResponse,
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
