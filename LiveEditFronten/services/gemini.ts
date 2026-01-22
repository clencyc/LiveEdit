
import { GoogleGenAI } from "@google/genai";
import { VideoConfig } from "../types";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';

// Note: process.env.API_KEY is pre-configured
export const getAiClient = () => new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });

export async function generateAiVideo(config: VideoConfig, onProgress?: (msg: string) => void) {
  const ai = getAiClient();
  
  onProgress?.("Initializing video generation engine...");
  
  let operation = await ai.models.generateVideos({
    model: 'veo-3.1-fast-generate-preview',
    prompt: config.prompt,
    config: {
      numberOfVideos: 1,
      resolution: config.resolution,
      aspectRatio: config.aspectRatio
    }
  });

  onProgress?.("Synthesizing motion frames...");

  while (!operation.done) {
    await new Promise(resolve => setTimeout(resolve, 8000));
    operation = await ai.operations.getVideosOperation({ operation: operation });
    onProgress?.("Processing visual data... (this may take a few minutes)");
  }

  const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
  if (!downloadLink) throw new Error("Video generation failed - no URI returned");

  const response = await fetch(`${downloadLink}&key=${import.meta.env.VITE_GEMINI_API_KEY}`);
  const blob = await response.blob();
  return URL.createObjectURL(blob);
}

export async function chatWithBackend(message: string): Promise<string> {
  try {
    const response = await fetch(`${BACKEND_URL}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message })
    });
    
    if (!response.ok) {
      throw new Error(`Backend error: ${response.statusText}`);
    }
    
    const data = await response.json();
    return data.message || 'No response from backend';
  } catch (error) {
    console.error('Error communicating with backend:', error);
    throw error;
  }
}

export interface VideoAnalysisResult {
  summary: string;
  key_events: any[];
  edit_plan: any[];
}

export async function analyzeVideoWithBackend(
  videoFile: File,
  prompt: string
): Promise<VideoAnalysisResult> {
  try {
    const formData = new FormData();
    formData.append('video_file', videoFile);
    formData.append('prompt', prompt);
    
    const response = await fetch(`${BACKEND_URL}/api/analyze-video`, {
      method: 'POST',
      body: formData
    });
    
    if (!response.ok) {
      throw new Error(`Backend error: ${response.statusText}`);
    }
    
    const data = await response.json();
    return data as VideoAnalysisResult;
  } catch (error) {
    console.error('Error analyzing video:', error);
    throw error;
  }
}

export async function editVideoWithBackend(
  videoFile: File,
  editPlan: any[],
  audioFile?: File,
  audioStart?: string,
  audioDuckDb?: number
): Promise<Blob> {
  try {
    const formData = new FormData();
    formData.append('video_file', videoFile);
    formData.append('edit_plan', JSON.stringify(editPlan));
    if (audioFile) {
      formData.append('audio_file', audioFile);
      formData.append('audio_start', audioStart || '00:00');
      formData.append('audio_duck_db', String(audioDuckDb || 0));
    }

    const response = await fetch(`${BACKEND_URL}/api/edit-video`, {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      throw new Error(`Backend error: ${response.statusText}`);
    }

    const blob = await response.blob();
    return blob;
  } catch (error) {
    console.error('Error editing video:', error);
    throw error;
  }
}
