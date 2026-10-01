import type { ProfileResponse, UpdateProfileRequest } from "../types/auth";
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
