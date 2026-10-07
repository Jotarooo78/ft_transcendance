import { clearAccessToken, getAccessToken } from "./session";

export async function authenticatedFetch(
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  const token = getAccessToken();

  if (token === null) {
    throw new Error("Please log in first.");
  }

  const headers = new Headers(options.headers);
  headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(path, {
    ...options,
    headers,
  });

  if (response.status === 401) {
    // A late response from a previous login must not invalidate the new one.
    if (getAccessToken() === token) clearAccessToken();
    throw new Error("Your session is invalid or expired. Please log in again.");
  }

  return response;
}
