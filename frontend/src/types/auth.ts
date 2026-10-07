export type RegisterRequest = {
  username: string;
  displayName: string;
  email: string;
  password: string;
};

export type RegisterResponse =
  | {
      status: "registered";
      userId: string;
      nextAction: "login";
    }
  | {
      status: "pending";
      code: "REGISTRATION_PENDING";
      retryAfterSeconds: number;
      nextAction: "login";
    };

export type LoginResponse =
  | {
      token: string;
    }
  | {
      status: "pending";
      code: "REGISTRATION_PENDING";
      retryAfterSeconds: number;
    };

export type ProfileResponse = {
  userId: string;
  displayName: string;
  username: string;
  bio: string | null;
  avatarUrl: string | null;
};

export type AvatarUploadResponse = {
  userId: string;
  displayName: string;
  username: string;
  avatarUrl: string;
};

export type UserDirectoryItemResponse = {
  userId: string;
  displayName: string;
  username: string;
  bio: string | null;
  avatarUrl: string | null;
  onlineStatus: "online" | "offline";
};

export type UserDirectoryResponse = {
  users: UserDirectoryItemResponse[];
};

export type FriendResponse = {
  userId: string;
  displayName: string;
  username: string;
  bio: string | null;
  avatarUrl: string | null;
  onlineStatus: "online" | "offline";
  lastSeenAt: string | null;
};

export type FriendsResponse = {
  friends: FriendResponse[];
};

export type UpdateProfileRequest = {
  displayName: string;
  username: string;
  bio: string | null;
};

export type LoginRequest = {
  email: string;
  password: string;
};

export type AuthenticatedUser = {
  id: string;
  displayName: string;
  username: string;
  email: string;
  bio: string | null;
  avatarUrl: string | null;
  createdAt: string | null;
};

export type PublicUser = {
  id: string;
  displayName: string;
  username: string;
  bio: string | null;
  avatarUrl: string | null;
  isOnline: boolean;
};
