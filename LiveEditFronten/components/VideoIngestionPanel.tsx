import React, { useState, useRef, useCallback } from 'react';
import {
  uploadForIngestion,
  queryVideo,
  getSceneSummary,
  IngestionResult,
  Scene,
} from '../services/videoIngestion';

interface VideoIngestionPanelProps {
  /** Called when user wants to insert scenes as workflow nodes */
  onInsertScenes?: (scenes: Scene[]) => void;
}

const VideoIngestionPanel: React.FC<VideoIngestionPanelProps> = ({ onInsertScenes }) => {
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState('');
  const [result, setResult] = useState<IngestionResult | null>(null);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'upload' | 'analysis' | 'scenes' | 'query'>('upload');
  const [queryPrompt, setQueryPrompt] = useState('');
  const [queryAnswer, setQueryAnswer] = useState('');
  const [isQuerying, setIsQuerying] = useState(false);
  const [sceneSummary, setScenesummary] = useState<{ start: string; end: string; summary: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = useCallback(async (file: File) => {
    setIsUploading(true);
    setError('');
    setProgress('Preparing upload…');
    setResult(null);

    try {
      // Try to get video duration from a temporary element
      let duration = 0;
      try {
        const url = URL.createObjectURL(file);
        const video = document.createElement('video');
        video.preload = 'metadata';
        await new Promise<void>((resolve) => {
          video.onloadedmetadata = () => {
            duration = video.duration;
            URL.revokeObjectURL(url);
            resolve();
          };
          video.onerror = () => resolve();
          video.src = url;
        });
      } catch { /* ignore */ }

      const res = await uploadForIngestion(file, {
        duration,
        onProgress: setProgress,
      });

      setResult(res);
      setActiveTab('analysis');
      setProgress('');
    } catch (e: any) {
      setError(e.message || 'Upload failed');
    } finally {
      setIsUploading(false);
    }
  }, []);

  const handleFileDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file && file.type.startsWith('video/')) handleUpload(file);
    },
    [handleUpload]
  );

  const handleQuery = useCallback(async () => {
    if (!result?.gemini_file_uri || !queryPrompt.trim()) return;
    setIsQuerying(true);
    setQueryAnswer('');
    try {
      const res = await queryVideo(result.gemini_file_uri, queryPrompt.trim());
      setQueryAnswer(res.answer);
    } catch (e: any) {
      setQueryAnswer(`Error: ${e.message}`);
    } finally {
      setIsQuerying(false);
    }
  }, [result, queryPrompt]);

  const handleSceneSummary = useCallback(
    async (start: string, end: string) => {
      if (!result?.gemini_file_uri) return;
      try {
        const res = await getSceneSummary(result.gemini_file_uri, start, end);
        setScenesummary({ start, end, summary: res.summary });
      } catch (e: any) {
        setScenesummary({ start, end, summary: `Error: ${e.message}` });
      }
    },
    [result]
  );

  const scenes = result?.analysis?.scenes || [];

  return (
    <div className="flex flex-col h-full bg-[#111] text-white overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-neutral-800 flex items-center gap-3">
        <i className="fas fa-clapperboard text-[#00ff41]"></i>
        <h3 className="text-sm font-bold uppercase tracking-wide">Video Intelligence</h3>
        {result && (
          <span className="ml-auto text-[9px] px-2 py-0.5 bg-[#00ff41]/20 text-[#00ff41] rounded-full uppercase tracking-wider font-bold">
            {result.cache_name ? 'Cached' : 'Analyzed'}
          </span>
        )}
      </div>

      {/* Tabs */}
      {result && (
        <div className="flex border-b border-neutral-800">
          {(['upload', 'analysis', 'scenes', 'query'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 px-3 py-2 text-[9px] font-bold uppercase tracking-wider transition-all ${
                activeTab === tab
                  ? 'text-[#00ff41] border-b-2 border-[#00ff41]'
                  : 'text-neutral-500 hover:text-neutral-300'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {/* ── Upload Tab ─────────────────────────────── */}
        {activeTab === 'upload' && (
          <div className="space-y-4">
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleFileDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all ${
                isUploading
                  ? 'border-[#00ff41] bg-[#00ff41]/5'
                  : 'border-neutral-700 hover:border-[#00ff41] hover:bg-neutral-900'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="video/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleUpload(file);
                }}
              />
              {isUploading ? (
                <div className="space-y-3">
                  <div className="w-10 h-10 border-4 border-[#00ff41] border-t-transparent rounded-full animate-spin mx-auto"></div>
                  <div className="text-sm text-[#00ff41]">{progress}</div>
                  <div className="text-[9px] text-neutral-500">
                    Gemini samples video at 1 FPS for deep understanding
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <i className="fas fa-cloud-arrow-up text-4xl text-neutral-600"></i>
                  <div className="text-sm text-neutral-400">
                    Drop video here or click to browse
                  </div>
                  <div className="text-[9px] text-neutral-600">
                    Supports MP4, MOV, AVI, WebM • Auto-caches videos &gt; 10 min
                  </div>
                </div>
              )}
            </div>

            {error && (
              <div className="px-3 py-2 bg-red-600/20 border border-red-600/50 rounded text-sm text-red-400">
                {error}
              </div>
            )}

            {/* Info cards */}
            <div className="grid grid-cols-1 gap-2">
              <div className="p-3 bg-neutral-900 rounded-lg border border-neutral-800">
                <div className="flex items-center gap-2 mb-1">
                  <i className="fas fa-brain text-purple-400 text-xs"></i>
                  <span className="text-[10px] font-bold text-neutral-300 uppercase">Gemini Files API</span>
                </div>
                <p className="text-[9px] text-neutral-500 leading-relaxed">
                  Video is sampled at 1 FPS. Gemini extracts visual details and matches them to audio for deep understanding.
                </p>
              </div>
              <div className="p-3 bg-neutral-900 rounded-lg border border-neutral-800">
                <div className="flex items-center gap-2 mb-1">
                  <i className="fas fa-bolt text-yellow-400 text-xs"></i>
                  <span className="text-[10px] font-bold text-neutral-300 uppercase">Context Caching</span>
                </div>
                <p className="text-[9px] text-neutral-500 leading-relaxed">
                  Videos over 10 minutes are auto-cached so follow-up questions are instant and cost-effective.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ── Analysis Tab ───────────────────────────── */}
        {activeTab === 'analysis' && result?.analysis && (
          <div className="space-y-4">
            {/* Summary */}
            {result.analysis.overall_summary && (
              <div className="p-3 bg-neutral-900 rounded-lg border border-neutral-800">
                <div className="text-[9px] text-neutral-500 uppercase tracking-wider mb-1 font-bold">Summary</div>
                <p className="text-sm text-neutral-200 leading-relaxed">
                  {result.analysis.overall_summary}
                </p>
              </div>
            )}

            {/* Key Objects */}
            {result.analysis.key_objects && result.analysis.key_objects.length > 0 && (
              <div className="p-3 bg-neutral-900 rounded-lg border border-neutral-800">
                <div className="text-[9px] text-neutral-500 uppercase tracking-wider mb-2 font-bold">Key Objects</div>
                <div className="flex flex-wrap gap-1">
                  {result.analysis.key_objects.map((obj, i) => (
                    <span key={i} className="px-2 py-0.5 bg-blue-600/20 text-blue-400 text-[10px] rounded-full">
                      {obj}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Audio */}
            {result.analysis.audio_analysis && (
              <div className="p-3 bg-neutral-900 rounded-lg border border-neutral-800">
                <div className="text-[9px] text-neutral-500 uppercase tracking-wider mb-2 font-bold">Audio Analysis</div>
                <div className="space-y-1 text-[10px]">
                  <div className="flex items-center gap-2">
                    <span className={result.analysis.audio_analysis.has_speech ? 'text-green-400' : 'text-red-400'}>
                      <i className={`fas ${result.analysis.audio_analysis.has_speech ? 'fa-check' : 'fa-times'}`}></i>
                    </span>
                    <span className="text-neutral-400">Speech detected</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={result.analysis.audio_analysis.has_music ? 'text-green-400' : 'text-red-400'}>
                      <i className={`fas ${result.analysis.audio_analysis.has_music ? 'fa-check' : 'fa-times'}`}></i>
                    </span>
                    <span className="text-neutral-400">Music detected</span>
                  </div>
                  {result.analysis.audio_analysis.speech_summary && (
                    <p className="text-neutral-400 mt-1">{result.analysis.audio_analysis.speech_summary}</p>
                  )}
                </div>
              </div>
            )}

            {/* Editing Suggestions */}
            {result.analysis.editing_suggestions && result.analysis.editing_suggestions.length > 0 && (
              <div className="p-3 bg-neutral-900 rounded-lg border border-neutral-800">
                <div className="text-[9px] text-neutral-500 uppercase tracking-wider mb-2 font-bold">
                  AI Editing Suggestions
                </div>
                <div className="space-y-2">
                  {result.analysis.editing_suggestions.map((sug, i) => (
                    <div key={i} className="flex items-start gap-2 text-[10px]">
                      <span className="px-1.5 py-0.5 bg-purple-600/30 text-purple-400 rounded text-[8px] uppercase font-bold shrink-0">
                        {sug.type}
                      </span>
                      <span className="text-neutral-300">{sug.description}</span>
                      {sug.timestamp && (
                        <span className="text-neutral-600 ml-auto shrink-0">@ {sug.timestamp}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Raw fallback */}
            {result.analysis.raw_analysis && !result.analysis.overall_summary && (
              <div className="p-3 bg-neutral-900 rounded-lg border border-neutral-800">
                <div className="text-[9px] text-neutral-500 uppercase tracking-wider mb-1 font-bold">Raw Analysis</div>
                <pre className="text-[10px] text-neutral-400 whitespace-pre-wrap overflow-auto max-h-64">
                  {result.analysis.raw_analysis}
                </pre>
              </div>
            )}
          </div>
        )}

        {/* ── Scenes Tab ─────────────────────────────── */}
        {activeTab === 'scenes' && (
          <div className="space-y-3">
            {scenes.length > 0 && onInsertScenes && (
              <button
                onClick={() => onInsertScenes(scenes)}
                className="w-full px-4 py-2 bg-[#00ff41] text-black text-xs font-bold uppercase tracking-wider rounded hover:bg-[#00dd35] transition-all"
              >
                <i className="fas fa-diagram-project mr-2"></i>
                Insert All Scenes as Workflow Nodes
              </button>
            )}

            {scenes.length === 0 && (
              <div className="text-center py-8 text-neutral-600">
                <i className="fas fa-film text-3xl mb-3 block"></i>
                <p className="text-sm">No scenes detected yet</p>
                <p className="text-[9px] mt-1">Upload a video first</p>
              </div>
            )}

            {scenes.map((scene) => (
              <div
                key={scene.scene_number}
                className="p-3 bg-neutral-900 rounded-lg border border-neutral-800 hover:border-neutral-700 transition-all"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-bold text-[#00ff41] uppercase">
                    Scene {scene.scene_number}
                  </span>
                  <span className="text-[9px] text-neutral-500 font-mono">
                    {scene.timestamp_start} – {scene.timestamp_end}
                  </span>
                </div>
                <p className="text-[11px] text-neutral-300 leading-relaxed mb-2">
                  {scene.description}
                </p>

                {scene.visual_elements && scene.visual_elements.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-2">
                    {scene.visual_elements.map((el, i) => (
                      <span key={i} className="px-1.5 py-0.5 bg-blue-600/20 text-blue-400 text-[8px] rounded">
                        {el}
                      </span>
                    ))}
                  </div>
                )}

                {scene.mood && (
                  <div className="text-[9px] text-neutral-500">
                    <i className="fas fa-masks-theater mr-1"></i> {scene.mood}
                  </div>
                )}

                <button
                  onClick={() => handleSceneSummary(scene.timestamp_start, scene.timestamp_end)}
                  className="mt-2 text-[9px] text-purple-400 hover:text-purple-300 transition-colors"
                >
                  <i className="fas fa-expand mr-1"></i> Deep dive this scene
                </button>

                {sceneSummary &&
                  sceneSummary.start === scene.timestamp_start &&
                  sceneSummary.end === scene.timestamp_end && (
                    <div className="mt-2 p-2 bg-purple-600/10 rounded border border-purple-600/20 text-[10px] text-purple-200 leading-relaxed">
                      {sceneSummary.summary}
                    </div>
                  )}
              </div>
            ))}
          </div>
        )}

        {/* ── Query Tab ──────────────────────────────── */}
        {activeTab === 'query' && (
          <div className="space-y-4">
            <div className="p-3 bg-neutral-900 rounded-lg border border-neutral-800">
              <div className="text-[9px] text-neutral-500 uppercase tracking-wider mb-2 font-bold">
                Ask about this video
              </div>
              <textarea
                value={queryPrompt}
                onChange={(e) => setQueryPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    handleQuery();
                  }
                }}
                placeholder="E.g. 'What emotions are shown?' or 'Suggest a 30-second highlight reel'…"
                className="w-full h-24 px-3 py-2 bg-neutral-800 border border-neutral-700 rounded text-sm text-white placeholder-neutral-500 resize-none focus:outline-none focus:border-[#00ff41] focus:ring-1 focus:ring-[#00ff41]"
              />
              <button
                onClick={handleQuery}
                disabled={isQuerying || !queryPrompt.trim()}
                className="mt-2 w-full px-4 py-2 bg-[#00ff41] text-black text-xs font-bold uppercase tracking-wider rounded hover:bg-[#00dd35] transition-all disabled:bg-neutral-800 disabled:text-neutral-600 disabled:cursor-not-allowed"
              >
                {isQuerying ? (
                  <>
                    <i className="fas fa-spinner fa-spin mr-2"></i> Analyzing…
                  </>
                ) : (
                  <>
                    <i className="fas fa-paper-plane mr-2"></i> Ask Gemini (Ctrl+Enter)
                  </>
                )}
              </button>
              {result?.cache_name && (
                <div className="mt-1 text-[8px] text-[#00ff41]/60 text-center">
                  <i className="fas fa-bolt mr-1"></i> Using context cache — fast & cost-effective
                </div>
              )}
            </div>

            {queryAnswer && (
              <div className="p-3 bg-neutral-900 rounded-lg border border-neutral-800">
                <div className="text-[9px] text-neutral-500 uppercase tracking-wider mb-2 font-bold">Response</div>
                <div className="text-sm text-neutral-200 leading-relaxed whitespace-pre-wrap">
                  {queryAnswer}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default VideoIngestionPanel;
