const rawBackendUrl =
  import.meta.env.VITE_BACKEND_URL ||
  import.meta.env.VITE_API_URL ||
  (import.meta.env.DEV ? "http://localhost:5000" : "");

export const BACKEND_URL = rawBackendUrl.replace(/\/$/, '');

type AuthTokenGetter = () => Promise<string | null>;

let authTokenGetter: AuthTokenGetter = async () => null;

export const setAuthTokenGetter = (getToken: AuthTokenGetter) => {
  authTokenGetter = getToken;
};

export const apiFetch = async (input: RequestInfo | URL, init: RequestInit = {}) => {
  const token = await authTokenGetter();
  const headers = new Headers(init.headers);
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  return fetch(input, { ...init, headers });
};

export const requireBackendUrl = () => {
  if (!BACKEND_URL) {
    throw new Error('Missing VITE_BACKEND_URL. Rebuild the frontend with your Cloud Run backend URL.');
  }
  return BACKEND_URL;
};