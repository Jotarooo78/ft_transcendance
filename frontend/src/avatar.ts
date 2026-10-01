export const DEFAULT_AVATAR_URL = "/images/default-avatar.svg";

export function getAvatarSource(avatarUrl: string | null): string {
  return avatarUrl ?? DEFAULT_AVATAR_URL;
}
