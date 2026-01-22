
export enum AppMode {
  CHAT = 'CHAT',
  LIVE = 'LIVE',
  GENERATE = 'GENERATE'
}

export type AssetType = 'upload' | 'generation';

export interface MediaAsset {
  id: string;
  url: string;
  name: string;
  type: AssetType;
  mimeType: string;
  timestamp: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  assetUrl?: string;
  isGenerating?: boolean;
  showEditButton?: boolean;
}

export interface VideoConfig {
  prompt: string;
  aspectRatio: '16:9' | '9:16';
  resolution: '720p' | '1080p';
}
