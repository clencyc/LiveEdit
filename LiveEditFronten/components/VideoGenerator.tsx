
import React, { useEffect, useMemo, useState } from 'react';
import { MediaAsset } from '../types';
import {
  queueMultiEdit,
  fetchVideoJob,
  downloadVideoJob,
  QueueMultiEditResponse,
  VideoJobStatus,
} from '../services/gemini';

interface VideoGeneratorProps {
  onAddAsset: (asset: MediaAsset) => void;
}

const VideoGenerator: React.FC<VideoGeneratorProps> = ({ onAddAsset }) => {
  const [prompt, setPrompt] = useState('');
  const [videos, setVideos] = useState<File[]>([]);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioStart, setAudioStart] = useState('00:00');
  const [audioDuckDb, setAudioDuckDb] = useState<number>(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [job, setJob] = useState<QueueMultiEditResponse | null>(null);
  const [jobStatus, setJobStatus] = useState<VideoJobStatus | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const videoInputId = useMemo(() => `videos-${Math.random().toString(36).slice(2)}`, []);
  const audioInputId = useMemo(() => `audio-${Math.random().toString(36).slice(2)}`, []);

  const progress = jobStatus?.progress ?? (jobStatus?.status === 'queued' ? 5 : jobStatus?.status === 'processing' ? 20 : 0);
  const statusText = jobStatus?.message || jobStatus?.status || 'Idle';

  const handleSelectVideos = (files: FileList | null) => {
    if (!files) return;
    setVideos(Array.from(files).slice(0, 3));
  };

  const handleSubmit = async () => {
    if (!prompt.trim()) {
      setError('Please provide instructions.');
      return;
    }
    if (!videos.length) {
      setError('Add at least one video (max 3).');
      return;
    }
    setError(null);
    setIsSubmitting(true);
    setPreviewUrl(null);
    setJob(null);
    setJobStatus(null);
    try {
      const queued = await queueMultiEdit(videos, prompt, {
        audioFile: audioFile || undefined,
        audioStart,
        audioDuckDb,
      });
      setJob(queued);
      setJobStatus({
        job_id: queued.job_id,
        job_type: queued.job_type,
        status: queued.status,
        message: queued.message,
      });
    } catch (err: any) {
      setError(err.message || 'Failed to start job');
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    if (!job?.job_id) return;
    let isCancelled = false;
    const interval = setInterval(async () => {
      try {
        const status = await fetchVideoJob(job.job_id);
        if (isCancelled) return;
        setJobStatus(status);
        if (status.status === 'succeeded') {
          clearInterval(interval);
          const blob = await downloadVideoJob(job.job_id);
          const url = URL.createObjectURL(blob);
          setPreviewUrl(url);
          onAddAsset({
            id: Math.random().toString(36).substr(2, 9),
            url,
            name: `EDIT_${Date.now()}`,
            type: 'edit',
            mimeType: 'video/mp4',
            timestamp: Date.now(),
          });
          setIsSubmitting(false);
        } else if (status.status === 'failed') {
          clearInterval(interval);
          setError(status.message || 'Job failed');
          setIsSubmitting(false);
        }
      } catch (err: any) {
        if (isCancelled) return;
        setError(err.message || 'Status check failed');
        clearInterval(interval);
        setIsSubmitting(false);
      }
    }, 2000);
    return () => {
      isCancelled = true;
      clearInterval(interval);
    };
  }, [job, onAddAsset]);

  return (
    <div className="h-full flex flex-col editor-bg text-neutral-200">
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-6 p-6 overflow-auto">
        {/* Preview / Result */}
        <div className="rounded-2xl border border-neutral-800 bg-[#0b0b0b] shadow-[0_0_40px_rgba(0,0,0,0.45)] p-4 flex flex-col">
          <div className="flex items-center justify-between mb-3 text-xs uppercase tracking-[0.2em] text-neutral-500">
            <span>Multi-Clip Output</span>
            <span className="text-[#00ff41] font-mono">{jobStatus?.status?.toUpperCase() || 'IDLE'}</span>
          </div>
          <div className="relative w-full aspect-video border border-neutral-800 bg-black flex items-center justify-center overflow-hidden">
            {previewUrl ? (
              <video src={previewUrl} controls className="w-full h-full object-contain" />
            ) : jobStatus ? (
              <div className="flex flex-col items-center text-center p-6 gap-3">
                <div className="w-12 h-12 rounded-full border-2 border-[#00ff41] border-t-transparent animate-spin"></div>
                <div className="text-[11px] font-mono text-neutral-400">{statusText}</div>
              </div>
            ) : (
              <div className="text-center text-neutral-600 text-[11px] font-mono uppercase tracking-[0.25em]">
                Upload up to 3 clips + prompt
              </div>
            )}
          </div>
          {jobStatus && (
            <div className="mt-3">
              <div className="flex items-center justify-between text-[11px] text-neutral-500 font-mono">
                <span>Job {jobStatus.job_id?.slice(0, 8)}…</span>
                <span>{Math.min(100, Math.max(0, progress || 0)).toFixed(0)}%</span>
              </div>
              <div className="w-full h-2 mt-1 bg-neutral-900 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-[#00ff41] to-[#00b32f]"
                  style={{ width: `${Math.min(100, Math.max(0, progress || 0))}%` }}
                ></div>
              </div>
            </div>
          )}
          {error && (
            <div className="mt-3 text-xs text-red-400 bg-red-900/20 border border-red-800 rounded p-2 font-mono">
              {error}
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="rounded-2xl border border-neutral-800 bg-[#0f0f0f] shadow-[0_0_40px_rgba(0,0,0,0.45)] p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold uppercase tracking-[0.2em] text-neutral-300">Upload & AI Edit (3 clips)</h3>
            <span className="text-[10px] font-mono text-neutral-500">AI will edit your uploaded clips</span>
          </div>

          <div>
            <label htmlFor={videoInputId} className="block text-[11px] font-mono text-neutral-500 mb-2 uppercase tracking-[0.18em]">Upload Clips</label>
            <label
              htmlFor={videoInputId}
              className="flex flex-col items-center justify-center gap-2 border border-dashed border-neutral-700 hover:border-[#00ff41] transition-all rounded-xl p-4 cursor-pointer bg-[#131313]"
            >
              <i className="fas fa-film text-neutral-500"></i>
              <span className="text-xs text-neutral-400">Select up to 3 videos to be edited</span>
              <span className="text-[10px] text-neutral-600">MP4 / MOV</span>
            </label>
            <input
              id={videoInputId}
              type="file"
              accept="video/*"
              multiple
              className="hidden"
              onChange={(e) => handleSelectVideos(e.target.files)}
            />
            {videos.length > 0 && (
              <div className="mt-2 space-y-1 text-[11px] font-mono text-neutral-400">
                {videos.map((v, idx) => (
                  <div key={idx} className="flex items-center justify-between bg-[#181818] px-2 py-1 rounded border border-neutral-800">
                    <span className="truncate">{v.name}</span>
                    <span className="text-neutral-600">{(v.size / (1024 * 1024)).toFixed(1)} MB</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="block text-[11px] font-mono text-neutral-500 mb-2 uppercase tracking-[0.18em]">Instructions</label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g. Use clip 2 as opener, trim first 3s from clip 1, crossfade 1->3 for 1s, add audio softly at 00:04"
              className="w-full h-28 bg-[#161616] border border-neutral-800 p-3 text-[12px] text-white focus:outline-none focus:border-[#00ff41] rounded"
            />
            <p className="mt-1 text-[10px] text-neutral-500 font-mono">AI follows your instructions strictly; it won't invent extra effects.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label htmlFor={audioInputId} className="block text-[11px] font-mono text-neutral-500 mb-2 uppercase tracking-[0.18em]">Optional Audio</label>
              <label
                htmlFor={audioInputId}
                className="flex items-center justify-between border border-neutral-800 bg-[#161616] rounded px-3 py-2 text-[11px] text-neutral-400 cursor-pointer hover:border-[#00ff41]"
              >
                <span>{audioFile ? audioFile.name : 'Attach music / effect'}</span>
                <i className="fas fa-music text-neutral-500"></i>
              </label>
              <input
                id={audioInputId}
                type="file"
                accept="audio/*"
                className="hidden"
                onChange={(e) => setAudioFile(e.target.files?.[0] || null)}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] font-mono text-neutral-500 mb-1 uppercase tracking-[0.18em]">Audio Start</label>
                <input
                  value={audioStart}
                  onChange={(e) => setAudioStart(e.target.value)}
                  className="w-full bg-[#161616] border border-neutral-800 rounded px-2 py-1 text-[11px] text-white focus:outline-none focus:border-[#00ff41]"
                />
              </div>
              <div>
                <label className="block text-[10px] font-mono text-neutral-500 mb-1 uppercase tracking-[0.18em]">Duck (dB)</label>
                <input
                  type="number"
                  value={audioDuckDb}
                  onChange={(e) => setAudioDuckDb(Number(e.target.value))}
                  className="w-full bg-[#161616] border border-neutral-800 rounded px-2 py-1 text-[11px] text-white focus:outline-none focus:border-[#00ff41]"
                />
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={handleSubmit}
              disabled={isSubmitting}
              className={`px-4 py-3 text-[11px] font-bold uppercase tracking-[0.2em] rounded border ${
                isSubmitting
                  ? 'bg-neutral-800 border-neutral-800 text-neutral-600'
                  : 'bg-[#00ff41] text-black border-[#00ff41] hover:bg-[#00e03a]'
              }`}
            >
              {isSubmitting ? 'Queueing…' : 'Send to AI Editor'}
            </button>
            <div className="text-[11px] text-neutral-500 font-mono">
              Returns a job ID immediately; processing happens in background.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VideoGenerator;
