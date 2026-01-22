
import React, { useState, useEffect } from 'react';
import { AppMode, MediaAsset } from './types';
import { useTheme } from './context/ThemeContext';
import ChatInterface from './components/ChatInterface';
import LiveInterface from './components/LiveInterface';
import VideoGenerator from './components/VideoGenerator';
import MediaSidebar from './components/MediaSidebar';

declare global {
  interface AIStudio {
    hasSelectedApiKey: () => Promise<boolean>;
    openSelectKey: () => Promise<void>;
  }
  interface Window {
    aistudio?: AIStudio;
  }
}

const App: React.FC = () => {
  const [mode, setMode] = useState<AppMode>(AppMode.CHAT);
  const [hasKey, setHasKey] = useState<boolean>(false);
  const [showKeyPrompt, setShowKeyPrompt] = useState(false);
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  useEffect(() => {
    const checkKey = async () => {
      if (window.aistudio) {
        const selected = await window.aistudio.hasSelectedApiKey();
        setHasKey(selected);
      }
    };
    checkKey();
  }, []);

  const handleAddAsset = (asset: MediaAsset) => {
    setAssets(prev => [asset, ...prev]);
  };

  const handleModeChange = (newMode: AppMode) => {
    if (newMode === AppMode.GENERATE && !hasKey) {
      setShowKeyPrompt(true);
      return;
    }
    setMode(newMode);
  };

  const handleSelectKey = async () => {
    if (window.aistudio) {
      await window.aistudio.openSelectKey();
      setHasKey(true);
      setShowKeyPrompt(false);
      setMode(AppMode.GENERATE);
    }
  };

  return (
    <div className="flex flex-col h-screen editor-bg text-neutral-300 overflow-hidden">
      {/* Header */}
      <header className="h-12 border-b border-neutral-800 bg-[#111] flex items-center justify-between px-4 z-50 shrink-0">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded bg-[#00ff41] flex items-center justify-center">
              <i className="fas fa-play text-[10px] text-black"></i>
            </div>
            <h1 className="text-sm font-bold tracking-tight uppercase text-white">Live Edit <span className="text-[#00ff41]">v2.5</span></h1>
          </div>
          
          <nav className="flex items-center">
            {[
              { id: AppMode.CHAT, label: 'Chat', icon: 'fa-message' },
              { id: AppMode.LIVE, label: 'Live AI', icon: 'fa-bolt' },
              { id: AppMode.GENERATE, label: 'Creative', icon: 'fa-sliders' }
            ].map((item) => (
              <button
                key={item.id}
                onClick={() => handleModeChange(item.id)}
                className={`px-4 h-12 text-[11px] font-bold uppercase tracking-widest border-x border-transparent transition-all ${
                  mode === item.id 
                    ? 'bg-[#1a1a1a] text-white border-neutral-800 border-b-2 border-b-[#00ff41]' 
                    : 'text-neutral-500 hover:text-neutral-300 hover:bg-[#1a1a1a]'
                }`}
              >
                <i className={`fas ${item.icon} mr-2`}></i>
                {item.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-2 py-0.5 rounded bg-neutral-900 text-[10px] border border-neutral-800 font-mono">
            <span className={`w-1.5 h-1.5 rounded-full ${hasKey ? 'bg-[#00ff41]' : 'bg-orange-500'}`}></span>
            {hasKey ? 'RENDER_STATION_READY' : 'GUEST_MODE'}
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        <MediaSidebar 
          isOpen={isSidebarOpen} 
          assets={assets} 
          onAddAsset={handleAddAsset} 
        />

        <main className="flex-1 relative overflow-hidden">
          {mode === AppMode.CHAT && <ChatInterface onAddAsset={handleAddAsset} />}
          {mode === AppMode.LIVE && <LiveInterface />}
          {mode === AppMode.GENERATE && <VideoGenerator onAddAsset={handleAddAsset} />}
        </main>
      </div>

      {/* Status Bar */}
      <footer className="h-6 bg-[#0a0a0a] border-t border-neutral-800 flex items-center justify-between px-3 text-[10px] font-mono text-neutral-600">
        <div className="flex gap-4">
          <span>FPS: 60.0</span>
          <span>MEMORY: 12.4GB / 32GB</span>
          <span className="text-[#00ff41]">STATUS: IDLE</span>
        </div>
        <div>PRO_STATION_ALPHA</div>
      </footer>

      {showKeyPrompt && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-sm p-4">
          <div className="bg-[#161616] max-w-sm w-full p-8 border border-neutral-800 text-center">
            <h2 className="text-lg font-bold mb-4 text-white uppercase tracking-tighter">API Requirement</h2>
            <p className="text-neutral-500 mb-8 text-xs leading-relaxed">
              Video rendering requires a linked billing account. Please authenticate with a Google Cloud project to unlock full resolution.
            </p>
            <button
              onClick={handleSelectKey}
              className="w-full py-3 bg-[#00ff41] text-black font-bold uppercase text-xs tracking-widest hover:bg-[#00e03a] transition-all"
            >
              Link Account
            </button>
            <button
              onClick={() => setShowKeyPrompt(false)}
              className="w-full mt-2 py-3 text-neutral-500 hover:text-white text-[10px] uppercase font-bold"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
