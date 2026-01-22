
import React, { useState } from 'react';
import { generateAiVideo } from '../services/gemini';
import { VideoConfig, MediaAsset } from '../types';

interface VideoGeneratorProps {
  onAddAsset: (asset: MediaAsset) => void;
}

const VideoGenerator: React.FC<VideoGeneratorProps> = ({ onAddAsset }) => {
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [progressMsg, setProgressMsg] = useState('');
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [aspectRatio, setAspectRatio] = useState<'16:9' | '9:16'>('16:9');
  const [resolution, setResolution] = useState<'720p' | '1080p'>('720p');
  const [activeTab, setActiveTab] = useState('Color');

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    setIsGenerating(true);
    setVideoUrl(null);
    setProgressMsg('Rendering sequence...');

    try {
      const url = await generateAiVideo({
        prompt,
        aspectRatio,
        resolution
      }, (msg) => setProgressMsg(msg));
      
      setVideoUrl(url);
      onAddAsset({
        id: Math.random().toString(36).substr(2, 9),
        url: url,
        name: `RENDER_${Date.now()}`,
        type: 'generation',
        mimeType: 'video/mp4',
        timestamp: Date.now()
      });
    } catch (error: any) {
      console.error(error);
      alert(`Render Error: ${error.message}`);
    } finally {
      setIsGenerating(false);
      setProgressMsg('');
    }
  };

  return (
    <div className="h-full flex flex-col editor-bg">
      {/* Primary Workspace */}
      <div className="flex-1 flex overflow-hidden">
        {/* Render View */}
        <div className="flex-1 p-6 flex items-center justify-center bg-black">
          <div className={`relative w-full max-w-5xl aspect-video border border-neutral-800 bg-[#080808] flex items-center justify-center shadow-[0_0_50px_rgba(0,0,0,0.8)]`}>
             {isGenerating ? (
              <div className="flex flex-col items-center text-center">
                <div className="w-12 h-12 border-2 border-[#00ff41] border-t-transparent animate-spin mb-4"></div>
                <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-[#00ff41]">{progressMsg}</p>
              </div>
            ) : videoUrl ? (
              <video src={videoUrl} controls autoPlay loop className="w-full h-full object-contain" />
            ) : (
              <div className="text-center">
                <p className="text-[10px] uppercase font-bold text-neutral-700 tracking-[0.3em]">Ready for Input</p>
              </div>
            )}
          </div>
        </div>

        {/* Control Inspector */}
        <div className="w-80 border-l border-neutral-800 bg-[#111] flex flex-col">
          <div className="p-3 border-b border-neutral-800">
             <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-500 mb-4">Sequence Setup</h3>
             <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Scene description..."
                className="w-full h-32 bg-[#1a1a1a] border border-neutral-800 p-2 text-[11px] text-white focus:outline-none focus:border-[#00ff41] resize-none font-mono"
             />
             <div className="grid grid-cols-2 gap-2 mt-2">
                <button onClick={() => setAspectRatio('16:9')} className={`py-1 text-[9px] font-bold border ${aspectRatio === '16:9' ? 'border-[#00ff41] text-[#00ff41]' : 'border-neutral-800'}`}>16:9</button>
                <button onClick={() => setAspectRatio('9:16')} className={`py-1 text-[9px] font-bold border ${aspectRatio === '9:16' ? 'border-[#00ff41] text-[#00ff41]' : 'border-neutral-800'}`}>9:16</button>
             </div>
             <button
                onClick={handleGenerate}
                disabled={!prompt.trim() || isGenerating}
                className="w-full mt-4 py-3 bg-[#00ff41] text-black text-[11px] font-bold uppercase tracking-widest hover:bg-[#00e03a] transition-all"
              >
                Start Render
              </button>
          </div>
          
          <div className="flex-1 p-3 overflow-y-auto">
             <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-500 mb-4">Engine Metrics</h3>
             <div className="space-y-3 font-mono text-[9px]">
                <div className="flex justify-between border-b border-neutral-800 pb-1">
                   <span className="text-neutral-600">Codec</span>
                   <span className="text-neutral-300">H.265 / HEVC</span>
                </div>
                <div className="flex justify-between border-b border-neutral-800 pb-1">
                   <span className="text-neutral-600">Precision</span>
                   <span className="text-neutral-300">10-bit HDR</span>
                </div>
                <div className="flex justify-between border-b border-neutral-800 pb-1">
                   <span className="text-neutral-600">Profile</span>
                   <span className="text-neutral-300">Main 4:2:2</span>
                </div>
             </div>
          </div>
        </div>
      </div>

      {/* Professional Grading Panel (Recreating User Image) */}
      <div className="h-64 border-t border-neutral-800 bg-[#161616] flex flex-col">
        <div className="flex h-10 border-b border-neutral-800">
          {['Color', 'Saturation', 'Exposure'].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-8 text-[10px] font-bold uppercase tracking-widest border-r border-neutral-800 transition-all ${
                activeTab === tab ? 'bg-[#222] text-[#00ff41] border-b-2 border-b-[#00ff41]' : 'text-neutral-500 hover:text-white'
              }`}
            >
              {tab}
            </button>
          ))}
          <div className="flex-1 bg-[#111]"></div>
          <button className="px-4 text-neutral-600 hover:text-white border-l border-neutral-800">
            <i className="fas fa-rotate-left text-xs"></i>
          </button>
        </div>

        <div className="flex-1 flex p-4 gap-8 justify-center">
          {/* Main Color Window */}
          <div className="w-80 h-full border border-neutral-800 bg-[#0c0c0c] p-2 relative">
             <div className="w-full h-24 bg-gradient-to-r from-red-500 via-green-500 via-blue-500 to-magenta-500 opacity-60 rounded flex items-center justify-center">
                <div className="w-6 h-6 border-2 border-white rounded-full flex items-center justify-center">
                   <div className="w-1 h-1 bg-white rounded-full"></div>
                </div>
             </div>
             <div className="mt-2 space-y-1">
                {[
                  { label: 'Global', color: 'neutral-500' },
                  { label: 'Shadows', color: 'black' },
                  { label: 'Midtones', color: 'neutral-400' },
                  { label: 'Highlights', color: '[#00ff41]', active: true }
                ].map((row, idx) => (
                  <div key={idx} className={`flex justify-between items-center text-[9px] px-2 py-1 ${row.active ? 'bg-[#2a2a2a] border-l-2 border-l-[#00ff41]' : ''}`}>
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full bg-${row.color}`}></div>
                      <span className={row.active ? 'text-[#00ff41]' : 'text-neutral-400'}>{row.label}</span>
                    </div>
                    <span className="font-mono text-neutral-600">180°</span>
                  </div>
                ))}
             </div>
          </div>

          {/* Color Wheels (Shadows/Midtones/Highlights) */}
          <div className="flex gap-6 items-center">
             {[
               { name: 'Global', color: 'cyan-400' },
               { name: 'Shadows', color: 'red-500' },
               { name: 'Midtones', color: 'orange-500' },
               { name: 'Highlights', color: 'magenta-500' }
             ].map((wheel, idx) => (
               <div key={idx} className="flex flex-col items-center">
                 <span className="text-[8px] font-bold uppercase text-neutral-600 mb-2">{wheel.name}</span>
                 <div className="w-16 h-16 color-wheel flex items-center justify-center border border-neutral-800 relative group">
                    <div className="absolute inset-0 bg-black/40 group-hover:bg-transparent transition-all"></div>
                    <div className="z-10 w-2 h-2 border border-white rounded-full shadow-[0_0_5px_rgba(255,255,255,0.5)]"></div>
                    {/* Adjustment Arc */}
                    <div className={`absolute -inset-1 border-t-2 border-${wheel.color} rounded-full rotate-45`}></div>
                 </div>
               </div>
             ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default VideoGenerator;
