import React, { useState } from 'react';
import { generateImageWithBackend } from '../services/gemini';
import { MediaAsset } from '../types';

interface CreativePulseProps {
  onAddAsset: (asset: MediaAsset) => void;
}

const CreativePulse: React.FC<CreativePulseProps> = ({ onAddAsset }) => {
  const [prompt, setPrompt] = useState('Cinematic keyframe for a neon studio cutscene');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gallery, setGallery] = useState<Array<{ id: string; url: string; prompt: string }>>([]);

  const handleGenerate = async () => {
    const trimmed = prompt.trim();
    if (!trimmed) return;
    setIsGenerating(true);
    setError(null);
    try {
      const result = await generateImageWithBackend(trimmed);
      const asset: MediaAsset = {
        id: crypto.randomUUID(),
        url: result.dataUrl,
        name: `pulse-${Date.now()}.png`,
        type: 'generation',
        mimeType: result.mimeType,
        timestamp: Date.now()
      };
      onAddAsset(asset);
      setGallery((prev) => [{ id: asset.id, url: asset.url, prompt: trimmed }, ...prev].slice(0, 6));
    } catch (err: any) {
      // Check if it's the Imagen unavailable error
      if (err.message.includes('not currently available') || err.message.includes('not found')) {
        setError('🚧 Image generation coming soon! Imagen 3 access required. Enable it in Google AI Studio.');
      } else {
        setError(err.message || 'Failed to generate image');
      }
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="bg-[#0f0f0f] border border-neutral-800 rounded-2xl p-5 shadow-lg">
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-500">Creative Pulse</p>
          <h3 className="text-lg font-semibold text-white">Generate keyframes for your next cut</h3>
        </div>
        <div className="flex items-center gap-2 text-[#00ff41] text-[10px] font-mono bg-[#0b0b0b] border border-neutral-800 px-3 py-1 rounded-full">
          <span className="w-1.5 h-1.5 bg-[#00ff41] rounded-full animate-pulse"></span>
          Gemini 3 Preview (Nano Banana)
        </div>
      </div>

      <div className="flex gap-3 items-start">
        <div className="flex-1">
          <div className="bg-[#141414] border border-neutral-800 rounded-xl p-3 flex items-center gap-3">
            <i className="fas fa-wand-magic-sparkles text-[#00ff41] text-sm"></i>
            <input
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe the shot, mood, color, and framing..."
              className="flex-1 bg-transparent outline-none text-sm text-white placeholder:text-neutral-600"
            />
            <button
              onClick={handleGenerate}
              disabled={isGenerating}
              className="px-4 py-2 bg-[#00ff41] text-black text-xs font-bold uppercase tracking-widest rounded hover:bg-[#00e639] transition-all disabled:opacity-60"
            >
              {isGenerating ? 'Rendering...' : 'Generate'}
            </button>
          </div>
          {error && (
            <p className="mt-2 text-xs text-amber-400 flex items-center gap-2">
              <i className="fas fa-info-circle"></i>
              {error}
            </p>
          )}
        </div>
      </div>

      {gallery.length > 0 && (
        <div className="mt-4 grid grid-cols-2 md:grid-cols-3 gap-3">
          {gallery.map((item) => (
            <div key={item.id} className="relative group border border-neutral-800 rounded-xl overflow-hidden bg-black">
              <img src={item.url} alt="Generated" className="w-full h-36 object-cover" />
              <div className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity p-2 text-[10px] text-neutral-300 leading-snug">
                {item.prompt}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default CreativePulse;
