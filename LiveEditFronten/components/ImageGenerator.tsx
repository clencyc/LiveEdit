import React, { useState } from 'react';
import { MediaAsset } from '../types';

interface ImageGeneratorProps {
  onAddAsset: (asset: MediaAsset) => void;
}

const ImageGenerator: React.FC<ImageGeneratorProps> = ({ onAddAsset }) => {
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      setError('Please enter a prompt');
      return;
    }

    setIsGenerating(true);
    setError(null);

    try {
      const response = await fetch(`${import.meta.env.VITE_BACKEND_URL || 'https://liveedit.onrender.com'}/api/generate-image`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prompt: prompt.trim() })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to generate image');
      }

      const blob = await response.blob();
      const imageUrl = URL.createObjectURL(blob);

      // Add to assets
      onAddAsset({
        id: Math.random().toString(36).substr(2, 9),
        url: imageUrl,
        name: `IMG_${Date.now()}`,
        type: 'generation',
        mimeType: 'image/png',
        timestamp: Date.now()
      });

      setPrompt('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Image generation failed');
      console.error('Image generation error:', err);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleGenerate();
    }
  };

  return (
    <div className="h-full flex flex-col bg-[#0a0a0a]">
      {/* Header */}
      <div className="p-4 border-b border-neutral-800">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-8 h-8 rounded bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
            <i className="fas fa-image text-sm text-white"></i>
          </div>
          <div>
            <h2 className="text-sm font-bold text-white uppercase tracking-tight">Creative Pulse</h2>
            <p className="text-[9px] text-neutral-500 uppercase tracking-wider">Gemini Image Generator</p>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col p-6 space-y-6">
        {/* Prompt Input */}
        <div className="space-y-3">
          <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">
            Image Prompt
          </label>
          <div className="relative">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Describe the image you want to generate..."
              disabled={isGenerating}
              className="w-full h-32 bg-[#161616] border border-neutral-800 rounded-lg p-4 text-sm text-neutral-300 placeholder-neutral-600 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all resize-none disabled:opacity-50"
            />
            <div className="absolute bottom-3 right-3 text-[9px] text-neutral-600 font-mono">
              {prompt.length}/500
            </div>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="p-3 bg-red-900/20 border border-red-500/50 rounded-lg">
            <p className="text-xs text-red-400">{error}</p>
          </div>
        )}

        {/* Generate Button */}
        <button
          onClick={handleGenerate}
          disabled={isGenerating || !prompt.trim()}
          className="w-full py-4 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white font-bold uppercase text-xs tracking-widest rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3"
        >
          {isGenerating ? (
            <>
              <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Generating...
            </>
          ) : (
            <>
              <i className="fas fa-wand-magic-sparkles"></i>
              Generate Image
            </>
          )}
        </button>

        {/* Info Section */}
        <div className="mt-auto space-y-2 p-4 bg-[#161616] border border-neutral-800 rounded-lg">
          <div className="flex items-start gap-2">
            <i className="fas fa-lightbulb text-yellow-500 text-xs mt-0.5"></i>
            <div>
              <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider mb-1">Pro Tips</p>
              <ul className="text-[9px] text-neutral-500 space-y-1">
                <li>• Be specific with colors, style, and mood</li>
                <li>• Mention composition (close-up, wide shot, etc.)</li>
                <li>• Add lighting details for better results</li>
                <li>• Generated images appear in the sidebar</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ImageGenerator;
