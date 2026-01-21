
import { GoogleGenAI } from "@google/genai";
import { VideoConfig } from "../types";

// Note: process.env.API_KEY is pre-configured
export const getAiClient = () => new GoogleGenAI({ apiKey: process.env.API_KEY });

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

  const response = await fetch(`${downloadLink}&key=${process.env.API_KEY}`);
  const blob = await response.blob();
  return URL.createObjectURL(blob);
}
