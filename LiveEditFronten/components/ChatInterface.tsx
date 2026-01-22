
import React, { useState, useRef, useEffect } from 'react';
import { getAiClient, chatWithBackend, analyzeVideoWithBackend, editVideoWithBackend } from '../services/gemini';
import { ChatMessage, MediaAsset } from '../types';

interface ChatInterfaceProps {
  onAddAsset: (asset: MediaAsset) => void
}

const ChatInterface: React.FC<ChatInterfaceProps> = ({ onAddAsset }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: '1', role: 'model', text: 'STATION_ONLINE: Visual processing engine ready. How would you like to direct the scene?' }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
    const [currentVideoFile, setCurrentVideoFile] = useState<File | null>(null);
    const [currentEditPlan, setCurrentEditPlan] = useState<any[]>([]);
    const [audioFile, setAudioFile] = useState<File | null>(null);
    const [audioStart, setAudioStart] = useState('00:00');
    const [audioDuck, setAudioDuck] = useState(0);
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

    (Array.from(files) as File[]).forEach(async (file) => {
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

      // If it's a video, analyze it
      if (file.type.includes('video')) {
          setCurrentVideoFile(file);
        setIsLoading(true);
        try {
          const analysis = await analyzeVideoWithBackend(file, 'Analyze this video and suggest edits');
                    setCurrentEditPlan(analysis.edit_plan || []);
          
          const analysisText = `VIDEO_ANALYSIS:
Summary: ${analysis.summary}

Key Events: ${analysis.key_events?.length ? analysis.key_events.map(e => `- ${e}`).join('\n') : 'None detected'}

Edit Suggestions:
${analysis.edit_plan?.length ? analysis.edit_plan.map((edit: any) => `- ${edit.type || 'edit'} from ${edit.start || '?'} to ${edit.end || '?'}`).join('\n') : 'No specific edits recommended'}`;

          setMessages(prev => [...prev, {
            id: (Date.now() + 1).toString(),
            role: 'model',
            text: analysisText,
            showEditButton: analysis.edit_plan?.length > 0
          }]);
        } catch (error) {
          console.error('Video analysis error:', error);
          setMessages(prev => [...prev, {
            id: (Date.now() + 1).toString(),
            role: 'model',
            text: 'VIDEO_ANALYSIS_FAILED: Unable to analyze video. Please try again.'
          }]);
        } finally {
          setIsLoading(false);
        }
      }
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
      // Use backend if available, otherwise fall back to direct Gemini API
      let responseText = '';
      
      try {
        responseText = await chatWithBackend(input);
      } catch (backendError) {
        console.warn('Backend unavailable, using direct API:', backendError);
        // Fallback to direct API call
        const ai = getAiClient();
        const response = await ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: input,
        });
        responseText = response.text || 'ERR_NO_DATA: Model failed to respond.';
      }

      const modelMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        text: responseText
      };
      setMessages(prev => [...prev, modelMsg]);
    } catch (error) {
      console.error(error);
      setMessages(prev => [...prev, { id: 'err', role: 'model', text: 'SYSTEM_FATAL: Pipeline breakdown.' }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerateEditedVideo = async () => {
    if (!currentVideoFile || !currentEditPlan.length) return;
    
    setIsLoading(true);
    setMessages(prev => [...prev, {
      id: Date.now().toString(),
      role: 'user',
      text: 'COMMAND: Generate edited video'
    }]);

    try {
      const editedBlob = await editVideoWithBackend(currentVideoFile, currentEditPlan, audioFile || undefined, audioStart, audioDuck);
      const editedUrl = URL.createObjectURL(editedBlob);
      
      const editedAsset: MediaAsset = {
        id: Math.random().toString(36).substr(2, 9),
        url: editedUrl,
        name: `EDITED_${currentVideoFile.name}`,
        type: 'video',
        mimeType: 'video/mp4',
        timestamp: Date.now()
      };
      onAddAsset(editedAsset);
      
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'model',
        text: 'RENDER_COMPLETE: Edited video is ready for review.',
        assetUrl: editedUrl
      }]);
    } catch (error) {
      console.error('Video editing error:', error);
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'model',
        text: 'EDIT_FAILED: Unable to process video edits. Please try again.'
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="h-full flex flex-col max-w-4xl mx-auto relative">
      <div className="flex-1 overflow-y-auto space-y-8 px-6 pt-6 pb-4 pr-2 custom-scrollbar"
        ref={scrollRef}
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
                {(msg.showEditButton || (currentVideoFile && msg.role === 'model' && msg.text.includes('VIDEO_ANALYSIS'))) && (
                  <div className="mt-3 space-y-3">
                    <button
                      onClick={handleGenerateEditedVideo}
                      disabled={isLoading}
                      className="w-full px-4 py-2 bg-[#00ff41] text-black text-[10px] font-bold uppercase tracking-widest hover:bg-[#00e03a] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Generate Edited Video
                    </button>
                    
                    <div className="border border-neutral-700 p-3 bg-[#0a0a0a] space-y-2">
                      <div className="text-[9px] font-bold uppercase text-neutral-500">Audio Effects</div>
                      
                      <div>
                        <label className="text-[9px] text-neutral-600 block mb-1">Sound Effect</label>
                        <input
                          type="file"
                          accept="audio/*"
                          onChange={(e) => setAudioFile(e.target.files?.[0] || null)}
                          className="w-full text-[9px] bg-[#1a1a1a] border border-neutral-700 p-1 text-neutral-400"
                        />
                        {audioFile && <div className="text-[8px] text-[#00ff41] mt-1">✓ {audioFile.name}</div>}
                      </div>
                      
                      {audioFile && (
                        <>
                          <div>
                            <label className="text-[9px] text-neutral-600 block mb-1">
                              Start Time: {audioStart}
                            </label>
                            <input
                              type="text"
                              value={audioStart}
                              onChange={(e) => setAudioStart(e.target.value)}
                              placeholder="MM:SS"
                              className="w-full text-[9px] bg-[#1a1a1a] border border-neutral-700 p-1 text-neutral-400 focus:outline-none focus:border-[#00ff41]"
                            />
                          </div>
                          
                          <div>
                            <label className="text-[9px] text-neutral-600 block mb-1">
                              Original Audio Volume: {audioDuck === 0 ? 'Normal' : `-${Math.abs(audioDuck)}dB`}
                            </label>
                            <input
                              type="range"
                              min="-20"
                              max="0"
                              value={audioDuck}
                              onChange={(e) => setAudioDuck(Number(e.target.value))}
                              className="w-full"
                            />
                            <div className="text-[8px] text-neutral-500">0 = Full volume, -20 = Silent</div>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                )}
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

      {/* Audio Effects Panel - Only show when video is loaded */}
      {currentVideoFile && currentEditPlan.length > 0 && (
        <div className="px-6 py-4 bg-[#0a0a0a] border-t border-[#00ff41] max-w-4xl mx-auto">
          <div className="border border-[#00ff41] p-4 bg-black space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-[10px] font-bold uppercase text-[#00ff41] tracking-widest">Audio Effects - {currentVideoFile.name}</div>
              <button
                onClick={handleGenerateEditedVideo}
                disabled={isLoading}
                className="px-4 py-2 bg-[#00ff41] text-black text-[9px] font-bold uppercase tracking-widest hover:bg-[#00e03a] transition-all disabled:opacity-50"
              >
                Render with Audio
              </button>
            </div>
            
            <div className="grid grid-cols-1 gap-3">
              <div>
                <label className="text-[9px] text-neutral-500 block mb-1 uppercase">Sound Effect File</label>
                <div className="flex gap-2">
                  <input
                    type="file"
                    accept="audio/*"
                    onChange={(e) => setAudioFile(e.target.files?.[0] || null)}
                    className="flex-1 text-[9px] bg-[#1a1a1a] border border-neutral-700 p-2 text-neutral-400 focus:outline-none focus:border-[#00ff41]"
                  />
                </div>
                {audioFile && <div className="text-[8px] text-[#00ff41] mt-1">✓ Selected: {audioFile.name}</div>}
              </div>
              
              {audioFile && (
                <>
                  <div>
                    <label className="text-[9px] text-neutral-500 block mb-1 uppercase">Start Time (MM:SS): {audioStart}</label>
                    <input
                      type="text"
                      value={audioStart}
                      onChange={(e) => setAudioStart(e.target.value)}
                      placeholder="00:05"
                      className="w-full text-[9px] bg-[#1a1a1a] border border-neutral-700 p-2 text-neutral-400 focus:outline-none focus:border-[#00ff41]"
                    />
                  </div>
                  
                  <div>
                    <label className="text-[9px] text-neutral-500 block mb-1 uppercase">Original Audio Volume: {audioDuck === 0 ? 'Full' : `-${Math.abs(audioDuck)}dB`}</label>
                    <input
                      type="range"
                      min="-20"
                      max="0"
                      value={audioDuck}
                      onChange={(e) => setAudioDuck(Number(e.target.value))}
                      className="w-full"
                    />
                    <div className="text-[8px] text-neutral-600 mt-1">0 = Full, -20 = Mute</div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

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
