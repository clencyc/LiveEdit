import React from 'react';

interface UploadOption {
  id: string;
  label: string;
  fileName?: string;
  hasSession?: boolean;
}

interface DirectorMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

interface DirectorChatPanelProps {
  uploads: UploadOption[];
  selectedUploadId: string;
  onSelectUpload: (id: string) => void;
  messages: DirectorMessage[];
  prompt: string;
  onPromptChange: (value: string) => void;
  onSend: () => void;
  onGeneratePlan: () => void;
  thoughtSignature?: string;
  latestPlan?: {
    selectedClipCount?: number;
    prunedSceneCount?: number;
    generatedAt?: string;
  };
  busy: boolean;
}

const DirectorChatPanel: React.FC<DirectorChatPanelProps> = ({
  uploads,
  selectedUploadId,
  onSelectUpload,
  messages,
  prompt,
  onPromptChange,
  onSend,
  onGeneratePlan,
  thoughtSignature,
  latestPlan,
  busy,
}) => {
  return (
    <div className="w-96 border-l border-neutral-800 bg-[#111] flex flex-col overflow-hidden">
      <div className="px-4 py-3 border-b border-neutral-800 flex items-center gap-3">
        <i className="fas fa-comments text-cyan-400"></i>
        <h3 className="text-sm font-bold uppercase tracking-wide text-white">AI Director</h3>
      </div>

      <div className="p-4 border-b border-neutral-800 space-y-3">
        <div>
          <label className="block text-[10px] text-neutral-500 uppercase tracking-wider mb-2">
            Active Video
          </label>
          <select
            value={selectedUploadId}
            onChange={(e) => onSelectUpload(e.target.value)}
            className="w-full bg-neutral-900 border border-neutral-700 text-white text-xs rounded px-3 py-2 focus:outline-none focus:border-[#00ff41]"
          >
            {uploads.length === 0 ? (
              <option value="">No uploaded videos</option>
            ) : (
              uploads.map((upload) => (
                <option key={upload.id} value={upload.id}>
                  {upload.fileName || upload.label}{upload.hasSession ? ' • session' : ''}
                </option>
              ))
            )}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-2 text-[10px]">
          <div className="bg-neutral-900 border border-neutral-800 rounded p-2">
            <div className="text-neutral-500 uppercase tracking-wider">Thought</div>
            <div className="text-cyan-300 mt-1 break-all">{thoughtSignature || '—'}</div>
          </div>
          <div className="bg-neutral-900 border border-neutral-800 rounded p-2">
            <div className="text-neutral-500 uppercase tracking-wider">Plan</div>
            <div className="text-[#00ff41] mt-1">
              {latestPlan?.selectedClipCount ?? 0} clips / {latestPlan?.prunedSceneCount ?? 0} pruned
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 ? (
          <div className="text-center py-12 text-neutral-600">
            <i className="fas fa-robot text-4xl mb-3 block"></i>
            <p className="text-sm">Start a director conversation</p>
            <p className="text-[10px] mt-2 text-neutral-700">
              Example: “Keep outdoor laughter moments and cut slow indoor setup.”
            </p>
          </div>
        ) : (
          messages.map((message, index) => (
            <div
              key={`${message.timestamp}-${index}`}
              className={`rounded-lg border px-3 py-2 text-xs ${
                message.role === 'user'
                  ? 'bg-cyan-500/10 border-cyan-500/20 text-cyan-100 ml-6'
                  : 'bg-neutral-900 border-neutral-800 text-neutral-200 mr-6'
              }`}
            >
              <div className="text-[9px] uppercase tracking-wider mb-1 opacity-70">
                {message.role === 'user' ? 'You' : 'Director'}
              </div>
              <div className="whitespace-pre-wrap">{message.content}</div>
            </div>
          ))
        )}
      </div>

      <div className="border-t border-neutral-800 p-4 space-y-3">
        <textarea
          value={prompt}
          onChange={(e) => onPromptChange(e.target.value)}
          placeholder="Refine the edit: keep only the best highlights, favor outdoor shots, trim repetition..."
          className="w-full h-28 bg-neutral-900 border border-neutral-700 rounded px-3 py-2 text-xs text-white placeholder-neutral-500 resize-none focus:outline-none focus:border-[#00ff41]"
        />
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={onSend}
            disabled={busy || !selectedUploadId || !prompt.trim()}
            className="px-3 py-2 bg-cyan-500 text-black text-[10px] font-bold uppercase tracking-wider rounded disabled:opacity-40"
          >
            {busy ? 'Thinking…' : 'Send'}
          </button>
          <button
            onClick={onGeneratePlan}
            disabled={busy || !selectedUploadId}
            className="px-3 py-2 bg-[#00ff41] text-black text-[10px] font-bold uppercase tracking-wider rounded disabled:opacity-40"
          >
            Build Plan
          </button>
        </div>
      </div>
    </div>
  );
};

export default DirectorChatPanel;
