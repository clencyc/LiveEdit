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

export interface ChatResponse {
  message: string;
  status?: string;
  [key: string]: any;
}

export interface VideoAnalysisResult {
  summary: string;
  key_events: any[];
  edit_plan: any[];
}

export const sendChatMessage = async (message: string): Promise<ChatResponse> => {
  const response = await apiFetch(`${BACKEND_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  });
  if (!response.ok) {
    throw new Error(`Chat request failed: ${response.statusText}`);
  }
  const data = await response.json();
  return { message: data.message || '', status: 'success', ...data };
};

export const analyzeVideo = async (
  videoFile: File,
  prompt: string
): Promise<VideoAnalysisResult> => {
  const formData = new FormData();
  formData.append('video_file', videoFile);
  formData.append('prompt', prompt);

  const response = await apiFetch(`${BACKEND_URL}/api/analyze-video`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`Video analysis request failed: ${response.statusText}`);
  }

  const data = await response.json();
  return data as VideoAnalysisResult;
};
