export type AccountType = "listener" | "artist";

export type RegisterRequest = {
  displayName: string;
  email: string;
  password: string;
  accountType: AccountType;
};

export type RegisteredUser = {
  id: string;
  displayName: string;
  email: string;
  accountType: AccountType;
};