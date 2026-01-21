
import React, { useState, useRef, useEffect } from 'react';
import { getAiClient } from '../services/gemini';
import { ChatMessage, MediaAsset } from '../types';

interface ChatInterfaceProps {
  onAddAsset: (asset: MediaAsset) => void;
}

const ChatInterface: React.FC<ChatInterfaceProps> = ({ onAddAsset }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: '1', role: 'model', text: 'STATION_ONLINE: Visual processing engine ready. How would you like to direct the scene?' }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    (Array.from(files) as File[]).forEach(file => {
      const url = URL.createObjectURL(file);
      const asset: MediaAsset = {
        id: Math.random().toString(36).substr(2, 9),
        url: url,
        name: file.name,
        type: 'upload',
        mimeType: file.type,
        timestamp: Date.now()
      };
      onAddAsset(asset);
      
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'user',
        text: `INPUT_STREAM: ${file.name}`,
        assetUrl: url
      }]);
    });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMsg: ChatMessage = { id: Date.now().toString(), role: 'user', text: input };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      const ai = getAiClient();
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: input,
      });

      const modelMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        text: response.text || 'ERR_NO_DATA: Model failed to respond.'
      };
      setMessages(prev => [...prev, modelMsg]);
    } catch (error) {
      console.error(error);
      setMessages(prev => [...prev, { id: 'err', role: 'model', text: 'SYSTEM_FATAL: Pipeline breakdown.' }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="h-full flex flex-col max-w-4xl mx-auto p-6 relative">
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto space-y-8 pb-32 pr-2 custom-scrollbar"
      >
        {messages.map((msg) => (
          <div 
            key={msg.id}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div className={`flex gap-3 max-w-[90%] ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
              <div className={`w-8 h-8 shrink-0 rounded border flex items-center justify-center ${
                msg.role === 'user' ? 'bg-neutral-800 border-neutral-700 text-neutral-400' : 'bg-black border-[#00ff41] text-[#00ff41]'
              }`}>
                <i className={`fas ${msg.role === 'user' ? 'fa-terminal' : 'fa-microchip'} text-[10px]`}></i>
              </div>
              <div className={`p-4 border ${
                msg.role === 'user' 
                  ? 'bg-[#1a1a1a] border-neutral-800 text-neutral-200' 
                  : 'bg-[#111] border-neutral-800 text-neutral-400'
              }`}>
                {msg.assetUrl && (
                  <div className="mb-4 border border-neutral-800 shadow-2xl">
                    {msg.mimeType?.includes('video') || msg.text.toLowerCase().includes('.mp4') ? (
                      <video src={msg.assetUrl} controls className="w-full max-h-64 object-contain" />
                    ) : (
                      <img src={msg.assetUrl} alt="Upload" className="w-full h-auto max-h-64 object-contain" />
                    )}
                  </div>
                )}
                <p className="text-xs font-mono leading-relaxed">{msg.text}</p>
              </div>
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
             <div className="flex gap-2 items-center text-[10px] text-[#00ff41] font-mono">
                <span className="w-1 h-1 bg-[#00ff41] animate-ping"></span>
                COMPILING_RESPONSE...
             </div>
          </div>
        )}
      </div>

      <div className="absolute bottom-6 left-0 right-0 px-6 max-w-4xl mx-auto">
        <form 
          onSubmit={handleSend}
          className="bg-[#1a1a1a] border border-neutral-800 flex items-center h-14"
        >
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="w-12 h-full flex items-center justify-center text-neutral-600 hover:text-white transition-all border-r border-neutral-800"
          >
            <i className="fas fa-plus"></i>
          </button>
          <input 
            type="file" 
            ref={fileInputRef} 
            className="hidden" 
            accept="image/*,video/*"
            onChange={handleFileUpload}
          />
          <input 
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="System input command..."
            className="flex-1 bg-transparent border-none outline-none px-4 text-xs font-mono text-white placeholder:text-neutral-700"
          />
          <button 
            type="submit"
            disabled={!input.trim() || isLoading}
            className="w-16 h-full flex items-center justify-center text-[#00ff41] disabled:text-neutral-800 transition-all border-l border-neutral-800 hover:bg-[#222]"
          >
            <i className="fas fa-arrow-right"></i>
          </button>
        </form>
      </div>
    </div>
  );
};

export default ChatInterface;
