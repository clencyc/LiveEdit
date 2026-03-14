/**
 * Video Ingestion Service
 * =======================
 * Frontend API client for the Video Ingestion & Understanding backend.
 */
import { BACKEND_URL } from './api';

export interface VideoAnalysis {
  duration_estimate?: string;
  overall_summary?: string;
  scenes?: Scene[];
  key_objects?: string[];
  dominant_colors?: string[];
  camera_movements?: string[];
  audio_analysis?: AudioAnalysis;
  editing_suggestions?: EditingSuggestion[];
  raw_analysis?: string;
}

export interface Scene {
  scene_number: number;
  timestamp_start: string;
  timestamp_end: string;
  description: string;
  visual_elements?: string[];
  audio_description?: string;
  mood?: string;
  suggested_edits?: string[];
}

export interface AudioAnalysis {
  has_speech: boolean;
  has_music: boolean;
  speech_summary?: string;
  background_sounds?: string[];
}

export interface EditingSuggestion {
  type: string;
  description: string;
  timestamp?: string;
}

export interface IngestionResult {
  filename: string;
  timestamp: string;
  gcs_uri?: string;
  gemini_file_uri: string;
  gemini_file_name?: string;
  cache_name?: string | null;
  analysis?: VideoAnalysis;
  analysis_error?: string;
  video_intelligence?: Record<string, any>;
  video_intelligence_error?: string;
}

export interface QueryResult {
  answer: string;
  gemini_file_uri: string;
  cached: boolean;
}

export interface SceneSummaryResult {
  summary: string;
  segment: { start: string; end: string };
}

export interface UploadedFile {
  gemini_file_uri: string;
  filename: string;
  cache_name?: string | null;
  duration?: number;
}

export interface DirectorSession {
  session_id: string;
  gemini_file_uri: string;
  cache_name?: string | null;
  previous_interaction_id?: string | null;
  thought_signature?: string | null;
  created_at?: string;
}

export interface DirectorInteractionResult {
  session_id: string;
  interaction_id: string;
  previous_interaction_id?: string | null;
  assistant_response: string;
  thought_signature?: string | null;
  structured?: Record<string, any>;
}

export interface DirectorPlanResult {
  session_id: string;
  generated_at: string;
  plan: {
    scene_segmentation?: Array<Record<string, any>>;
    highlight_candidates?: Array<Record<string, any>>;
    pruned_scenes?: Array<Record<string, any>>;
    selected_clips?: Array<Record<string, any>>;
    render_notes?: Record<string, any>;
    raw_model_output?: string;
  };
}

export interface DirectorRenderResult {
  render_id: string;
  download_url: string;
  meta?: {
    output_path?: string;
    clip_count?: number;
    duration_seconds?: number;
  };
}

/**
 * Upload a video for full AI ingestion (Gemini Files API + optional GCS + optional Video Intelligence).
 */
export async function uploadForIngestion(
  file: File,
  options: {
    useGcs?: boolean;
    useVi?: boolean;
    viFeatures?: string[];
    customPrompt?: string;
    duration?: number;
    onProgress?: (msg: string) => void;
  } = {}
): Promise<IngestionResult> {
  const formData = new FormData();
  formData.append("file", file);

  if (options.useGcs) formData.append("use_gcs", "true");
  if (options.useVi) formData.append("use_vi", "true");
  if (options.viFeatures?.length)
    formData.append("vi_features", options.viFeatures.join(","));
  if (options.customPrompt) formData.append("custom_prompt", options.customPrompt);
  if (options.duration) formData.append("duration", String(options.duration));

  options.onProgress?.("Uploading video for AI analysis…");

  const response = await fetch(`${BACKEND_URL}/api/video-ingestion/upload`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: "Upload failed" }));
    
    // Check for quota error (429)
    if (response.status === 429 || err.error === "Gemini API quota exceeded" || err.error === "QUOTA_EXHAUSTED") {
      const isPermanent = err.error === "QUOTA_EXHAUSTED" ||
        (err.message ?? "").includes("limit: 0") ||
        (err.message ?? "").includes("free_tier");
      throw new Error(
        isPermanent
          ? `⛔ Gemini free-tier quota permanently exhausted (limit: 0). ` +
            `Switch the backend to Vertex AI and configure VERTEX_PROJECT_ID, ` +
            `GCS_BUCKET_NAME, and Google Application Default Credentials.`
          : `⏱ Gemini API rate limit hit. Please wait a minute and try again.`
      );
    }
    
    throw new Error(err.message || err.error || `Upload failed (${response.status})`);
  }

  return response.json();
}

/**
 * Ask a follow-up question about a previously uploaded video.
 */
export async function queryVideo(
  geminiFileUri: string,
  prompt: string
): Promise<QueryResult> {
  const response = await fetch(`${BACKEND_URL}/api/video-ingestion/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ gemini_file_uri: geminiFileUri, prompt }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: "Query failed" }));
    throw new Error(err.error || `Query failed (${response.status})`);
  }

  return response.json();
}

/**
 * Get a natural-language summary for a specific time segment.
 */
export async function getSceneSummary(
  geminiFileUri: string,
  start: string,
  end: string
): Promise<SceneSummaryResult> {
  const response = await fetch(
    `${BACKEND_URL}/api/video-ingestion/scene-summary`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gemini_file_uri: geminiFileUri, start, end }),
    }
  );

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: "Scene summary failed" }));
    throw new Error(err.error || `Scene summary failed (${response.status})`);
  }

  return response.json();
}

/**
 * List all uploaded video files still available in the current backend session.
 */
export async function listUploadedFiles(): Promise<UploadedFile[]> {
  const response = await fetch(`${BACKEND_URL}/api/video-ingestion/files`);
  if (!response.ok) return [];
  const data = await response.json();
  return data.files || [];
}

/**
 * Start a conversational editing session for a previously uploaded Gemini file.
 */
export async function startDirectorSession(params: {
  geminiFileUri: string;
  cacheName?: string | null;
  analysis?: Record<string, any>;
  videoIntelligence?: Record<string, any>;
}): Promise<DirectorSession> {
  const response = await fetch(`${BACKEND_URL}/api/video-director/session/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      gemini_file_uri: params.geminiFileUri,
      cache_name: params.cacheName,
      analysis: params.analysis,
      video_intelligence: params.videoIntelligence,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: "Failed to start director session" }));
    throw new Error(err.error || `Failed to start director session (${response.status})`);
  }

  return response.json();
}

/**
 * Continue conversational editing with stateful context.
 */
export async function directorInteract(
  sessionId: string,
  prompt: string
): Promise<DirectorInteractionResult> {
  const response = await fetch(`${BACKEND_URL}/api/video-director/interaction`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_id: sessionId, prompt }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: "Director interaction failed" }));
    throw new Error(err.error || `Director interaction failed (${response.status})`);
  }

  return response.json();
}

/**
 * Generate structured edit JSON (scene segmentation + highlights + pruned scenes + selected clips).
 */
export async function generateDirectorPlan(
  sessionId: string,
  creativeBrief: string,
  targetDurationSeconds?: number
): Promise<DirectorPlanResult> {
  const response = await fetch(`${BACKEND_URL}/api/video-director/plan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      session_id: sessionId,
      creative_brief: creativeBrief,
      target_duration_seconds: targetDurationSeconds,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: "Director plan generation failed" }));
    throw new Error(err.error || `Director plan generation failed (${response.status})`);
  }

  return response.json();
}

/**
 * Render final video from structured edit JSON.
 */
export async function renderDirectorPlan(
  videoFile: File,
  editPlan: Record<string, any>,
  audioFile?: File
): Promise<DirectorRenderResult> {
  const formData = new FormData();
  formData.append("video_file", videoFile);
  formData.append("edit_plan", JSON.stringify(editPlan));
  if (audioFile) formData.append("audio_file", audioFile);

  const response = await fetch(`${BACKEND_URL}/api/video-director/render`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: "Director render failed" }));
    throw new Error(err.error || `Director render failed (${response.status})`);
  }

  const result = await response.json();
  if (result?.download_url && typeof result.download_url === "string" && result.download_url.startsWith("/")) {
    result.download_url = `${BACKEND_URL}${result.download_url}`;
  }
  return result;
}
