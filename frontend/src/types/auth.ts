export type RegisterRequest = {
	username: string;
	email: string;
	password: string;
};

export type RegisteredUser = {
	id: string;
	username: string;
	email: string;
};

export type LoginRequest = {
	email: string;
	password: string;
};

export type AuthenticatedUser = {
	id: string;
	username: string;
	email: string;
	createdAt: string;
};
