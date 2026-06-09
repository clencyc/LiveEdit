const rawBackendUrl =
  import.meta.env.VITE_BACKEND_URL ||
  import.meta.env.VITE_API_URL ||
  (import.meta.env.DEV ? "http://localhost:5000" : "");

export const BACKEND_URL = rawBackendUrl.replace(/\/$/, '');

export const requireBackendUrl = () => {
  if (!BACKEND_URL) {
    throw new Error('Missing VITE_BACKEND_URL. Rebuild the frontend with your Cloud Run backend URL.');
  }
  return BACKEND_URL;
};