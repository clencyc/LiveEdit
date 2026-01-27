
import React, { useState, useRef, useEffect } from 'react';
import { getAiClient, chatWithBackend, analyzeVideoWithBackend, editVideoWithBackend } from '../services/gemini';
import { ChatMessage, MediaAsset } from '../types';
import CreativePulse from './CreativePulse';

interface ChatInterfaceProps {
  onAddAsset: (asset: MediaAsset) => void
}

const toPlainText = (text: string) => {
  return text
    // strip bold/italic/inline code markers
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/__(.*?)__/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    // strip heading markers
    .replace(/^#{1,6}\s+/gm, '')
    // normalize numbered/bullet lists to plain bullets
    .replace(/^\s*[-*]\s+/gm, '• ')
    .replace(/^\s*\d+\.\s+/gm, '• ')
    // collapse extra blank lines
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};

const ChatInterface: React.FC<ChatInterfaceProps> = ({ onAddAsset }) => {
  const [audioLibrary, setAudioLibrary] = useState<Array<{id: string; label: string; filename: string; note: string}>>([]);

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
  const [selectedAudioId, setSelectedAudioId] = useState<string | null>(null);
  const [uploadHint, setUploadHint] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [showImportForm, setShowImportForm] = useState(false);
  const [importUrl, setImportUrl] = useState('');
  const [importName, setImportName] = useState('');
  const [importDescription, setImportDescription] = useState('');
  const [importTags, setImportTags] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const cleanModelResponse = (raw: string) => {
    const plain = toPlainText(raw);
    const lines = plain.split(/\n+/).filter(Boolean);
    const maxLines = 8;
    if (lines.length <= maxLines) return lines.join('\n');
    return `${lines.slice(0, maxLines).join('\n')}\n...`;
  };

  const formatKeyEvent = (event: any) => {
    if (!event) return 'Event';
    if (typeof event === 'string') return event;
    const time = event.time || event.at || event.start || '';
    const end = event.end;
    const desc = event.description || event.event || event.label || event.summary || event.detail;
    const segment = end ? `${time} → ${end}` : time;
    const fallback = desc || JSON.stringify(event);
    return `${segment ? `[${segment}] ` : ''}${fallback}`.trim();
  };

  const formatEdit = (edit: any) => {
    if (!edit) return 'Edit';
    if (typeof edit === 'string') return edit;
    const type = edit.type || 'edit';
    const start = edit.start || edit.time || edit.at || '?';
    const end = edit.end || edit.until || '';
    const desc = edit.description || edit.note || '';
    const range = end ? `${start} → ${end}` : start;
    const extras = desc ? ` | ${desc}` : '';
    return `${type} | ${range}${extras}`.trim();
  };

  const scrollToBottom = () => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    // Fetch audio library from backend
    fetch(`${import.meta.env.VITE_BACKEND_URL || 'https://liveedit.onrender.com'}/api/audio-effects`)
      .then(res => res.json())
      .then(data => {
        const library = data.map((effect: any) => ({
          id: effect.id.toString(),
          label: effect.name,
          filename: effect.filename,
          note: effect.description || ''
        }));
        setAudioLibrary(library);
      })
      .catch(err => console.error('Failed to load audio library:', err));
  }, []);

  const loadAudioLibrary = async () => {
    try {
      const response = await fetch(`${import.meta.env.VITE_BACKEND_URL || 'https://liveedit.onrender.com'}/api/audio-effects`);
      const data = await response.json();
      const library = data.map((effect: any) => ({
        id: effect.id.toString(),
        label: effect.name,
        filename: effect.filename,
        note: effect.description || ''
      }));
      setAudioLibrary(library);
    } catch (err) {
      console.error('Failed to load audio library:', err);
    }
  };

  const handleImportAudio = async () => {
    if (!importUrl.trim() || !importName.trim()) {
      alert('URL and name are required');
      return;
    }

    setIsImporting(true);
    try {
      const backendUrl = import.meta.env.VITE_BACKEND_URL || 'https://liveedit.onrender.com';
      const response = await fetch(`${backendUrl}/api/audio-effects/import`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: importUrl,
          name: importName,
          description: importDescription,
          tags: importTags.split(',').map(t => t.trim()).filter(Boolean),
          category: 'effect'
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Import failed');
      }

      const result = await response.json();
      
      // Clear form and reload library
      setImportUrl('');
      setImportName('');
      setImportDescription('');
      setImportTags('');
      setShowImportForm(false);
      await loadAudioLibrary();
      
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'model',
        text: `✓ Audio imported: ${result.filename}`
      }]);
    } catch (error: any) {
      console.error('Import error:', error);
      alert(`Failed to import: ${error.message}`);
    } finally {
      setIsImporting(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    // take first file only for now
    const file = files[0] as File;
    setPendingFile(file);
    setUploadHint(input.trim() ? 'Ready. Press Send to upload with your description.' : 'Add a short description, then press Send to upload.');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const processPendingFile = async (file: File, description: string) => {
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
      text: `INPUT_STREAM: ${file.name}${description ? `\nUSER_INTENT: ${description}` : ''}`,
      assetUrl: url,
      mimeType: file.type
    }]);

    if (file.type.includes('video')) {
      setCurrentVideoFile(file);
      setIsLoading(true);
      try {
        const analysis = await analyzeVideoWithBackend(file, description || 'Analyze this video and suggest edits');
        setCurrentEditPlan(analysis.edit_plan || []);

        const keyEvents = analysis.key_events?.length
          ? analysis.key_events.map((e: any) => `  • ${formatKeyEvent(e)}`).join('\n')
          : '  • None detected';
        const editSuggestions = analysis.edit_plan?.length
          ? analysis.edit_plan.map((edit: any) => `  • ${formatEdit(edit)}`).join('\n')
          : '  • No specific edits recommended';

        const analysisText = `VIDEO ANALYSIS\n- Summary: ${analysis.summary || 'No summary available.'}\n- Key Events:\n${keyEvents}\n- Edit Suggestions:\n${editSuggestions}`;

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
  };

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (isLoading) return;

    // If there is a pending file, require description then process file + text in one go
    if (pendingFile) {
      if (!input.trim()) {
        setUploadHint('Add a short description, then press Send to upload.');
        return;
      }
      const description = input.trim();
      setInput('');
      setUploadHint(null);
      const fileToProcess = pendingFile;
      setPendingFile(null);
      await processPendingFile(fileToProcess, description);
      return;
    }

    if (!input.trim()) return;

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
        text: cleanModelResponse(responseText)
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
      // If a preset audio is selected, fetch it from backend
      let audioToUse = audioFile;
      if (selectedAudioId && !audioFile) {
        const selectedPreset = audioLibrary.find(a => a.id === selectedAudioId);
        if (selectedPreset) {
          const backendUrl = import.meta.env.VITE_BACKEND_URL || 'https://liveedit.onrender.com';
          const audioResponse = await fetch(`${backendUrl}/api/audio-effects/${selectedPreset.filename}`);
          const audioBlob = await audioResponse.blob();
          audioToUse = new File([audioBlob], selectedPreset.filename, { type: 'audio/mpeg' });
        }
      }

      const editedBlob = await editVideoWithBackend(currentVideoFile, currentEditPlan, audioToUse || undefined, audioStart, audioDuck);
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
        assetUrl: editedUrl,
        mimeType: 'video/mp4'
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
    <div className="h-full flex">
      {/* Main column */}
      <div className="flex-1 flex flex-col relative">
        <div
          className="flex-1 overflow-y-auto space-y-8 px-6 pt-6 pb-4 pr-2 custom-scrollbar"
          ref={scrollRef}
        >
          <CreativePulse onAddAsset={onAddAsset} />

          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div className={`flex gap-3 max-w-[90%] ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                <div
                  className={`w-8 h-8 shrink-0 rounded border flex items-center justify-center ${
                    msg.role === 'user'
                      ? 'bg-neutral-800 border-neutral-700 text-neutral-400'
                      : 'bg-black border-[#00ff41] text-[#00ff41]'
                  }`}
                >
                  <i className={`fas ${msg.role === 'user' ? 'fa-terminal' : 'fa-microchip'} text-[10px]`}></i>
                </div>
                <div
                  className={`p-4 border ${
                    msg.role === 'user'
                      ? 'bg-[#1a1a1a] border-neutral-800 text-neutral-200'
                      : 'bg-[#111] border-neutral-800 text-neutral-400'
                  }`}
                >
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
                  {msg.showEditButton && currentVideoFile && currentEditPlan.length > 0 && (
                    <button
                      onClick={handleGenerateEditedVideo}
                      disabled={isLoading}
                      className="mt-3 px-3 py-2 text-[10px] font-bold uppercase tracking-widest border border-[#00ff41] text-[#00ff41] hover:bg-[#00ff41] hover:text-black transition-all disabled:opacity-50"
                    >
                      Apply these edits
                    </button>
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

        {/* Input form */}
        <div className="px-6 pb-4">
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
          {uploadHint && (
            <div className="mt-2 text-[10px] text-amber-400 font-mono">{uploadHint}</div>
          )}
        </div>
      </div>

      {/* Audio sidebar */}
      <div className="w-80 border-l border-neutral-800 bg-[#0b0b0b] flex flex-col">
        <div className="px-4 py-3 border-b border-neutral-800">
          <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#00ff41]">Audio Library</div>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {audioLibrary.map((item) => (
            <button
              key={item.id}
              onClick={() => setSelectedAudioId(item.id)}
              className={`w-full text-left p-3 border text-[10px] uppercase tracking-widest ${
                selectedAudioId === item.id
                  ? 'border-[#00ff41] bg-[#0f0f0f] text-[#00ff41]'
                  : 'border-neutral-800 bg-[#0c0c0c] text-neutral-400 hover:border-[#00ff41]'
              }`}
            >
              <div className="font-bold">{item.label}</div>
              <div className="text-[9px] text-neutral-500 mt-1">{item.filename}</div>
              <div className="text-[9px] text-neutral-600 mt-1">{item.note}</div>
            </button>
          ))}

          <div className="pt-2 border-t border-neutral-800">
            <div className="text-[9px] font-bold uppercase text-neutral-500 mb-2">Upload audio file</div>
            <input
              type="file"
              accept="audio/*"
              onChange={(e) => setAudioFile(e.target.files?.[0] || null)}
              className="w-full text-[9px] bg-[#1a1a1a] border border-neutral-700 p-2 text-neutral-400 focus:outline-none focus:border-[#00ff41]"
            />
            {audioFile && (
              <div className="text-[8px] text-[#00ff41] mt-1">✓ Selected: {audioFile.name}</div>
            )}
          </div>

          <div className="pt-2 border-t border-neutral-800">
            <button
              onClick={() => setShowImportForm(!showImportForm)}
              className="w-full text-[9px] font-bold uppercase text-neutral-400 hover:text-[#00ff41] text-left mb-2"
            >
              {showImportForm ? '▼' : '▶'} Import from BBC/URL
            </button>
            
            {showImportForm && (
              <div className="space-y-2">
                <input
                  type="text"
                  value={importUrl}
                  onChange={(e) => setImportUrl(e.target.value)}
                  placeholder="http://bbcsfx.acropolis.org.uk/assets/..."
                  className="w-full text-[9px] bg-[#1a1a1a] border border-neutral-700 p-2 text-neutral-400 focus:outline-none focus:border-[#00ff41]"
                />
                <input
                  type="text"
                  value={importName}
                  onChange={(e) => setImportName(e.target.value)}
                  placeholder="Sound name"
                  className="w-full text-[9px] bg-[#1a1a1a] border border-neutral-700 p-2 text-neutral-400 focus:outline-none focus:border-[#00ff41]"
                />
                <input
                  type="text"
                  value={importDescription}
                  onChange={(e) => setImportDescription(e.target.value)}
                  placeholder="Description (optional)"
                  className="w-full text-[9px] bg-[#1a1a1a] border border-neutral-700 p-2 text-neutral-400 focus:outline-none focus:border-[#00ff41]"
                />
                <input
                  type="text"
                  value={importTags}
                  onChange={(e) => setImportTags(e.target.value)}
                  placeholder="Tags (comma separated)"
                  className="w-full text-[9px] bg-[#1a1a1a] border border-neutral-700 p-2 text-neutral-400 focus:outline-none focus:border-[#00ff41]"
                />
                <button
                  onClick={handleImportAudio}
                  disabled={isImporting || !importUrl.trim() || !importName.trim()}
                  className="w-full py-2 bg-neutral-800 text-[#00ff41] text-[9px] font-bold uppercase tracking-widest hover:bg-neutral-700 transition-all disabled:opacity-50"
                >
                  {isImporting ? 'Importing...' : 'Import Sound'}
                </button>
              </div>
            )}
          </div>

          <div className="pt-2 border-t border-neutral-800 space-y-2">
            <div className="text-[9px] font-bold uppercase text-neutral-500">Start Time (MM:SS)</div>
            <input
              type="text"
              value={audioStart}
              onChange={(e) => setAudioStart(e.target.value)}
              placeholder="00:05"
              className="w-full text-[9px] bg-[#1a1a1a] border border-neutral-700 p-2 text-neutral-400 focus:outline-none focus:border-[#00ff41]"
            />
          </div>

          <div className="pt-2 border-t border-neutral-800 space-y-1">
            <div className="text-[9px] font-bold uppercase text-neutral-500">Original Audio Volume</div>
            <input
              type="range"
              min="-20"
              max="0"
              value={audioDuck}
              onChange={(e) => setAudioDuck(Number(e.target.value))}
              className="w-full"
            />
            <div className="text-[8px] text-neutral-600">0 = Full, -20 = Mute</div>
          </div>
        </div>

        <div className="p-4 border-t border-neutral-800">
          <button
            onClick={handleGenerateEditedVideo}
            disabled={isLoading || !currentVideoFile}
            className="w-full py-3 bg-[#00ff41] text-black text-[10px] font-bold uppercase tracking-widest hover:bg-[#00e03a] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Render with Audio
          </button>
          {selectedAudioId && (
            <div className="text-[9px] text-neutral-500 mt-2">
              Selected preset: {audioLibrary.find((a) => a.id === selectedAudioId)?.label}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ChatInterface;
