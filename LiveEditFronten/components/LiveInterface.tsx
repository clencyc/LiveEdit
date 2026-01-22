
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { getAiClient } from '../services/gemini';
import { Modality, LiveServerMessage } from '@google/genai';
import { decode, encode, decodeAudioData } from '../utils/audio-utils';

const LiveInterface: React.FC = () => {
  const [isActive, setIsActive] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [transcriptions, setTranscriptions] = useState<{role: 'user'|'model', text: string}[]>([]);
  const [error, setError] = useState<string | null>(null);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sessionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const animationFrameRef = useRef<number | null>(null);

  const cleanup = useCallback(() => {
    if (sessionRef.current) {
      sessionRef.current.close?.();
      sessionRef.current = null;
    }
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    sourcesRef.current.forEach(s => s.stop());
    sourcesRef.current.clear();
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    setIsActive(false);
    nextStartTimeRef.current = 0;
  }, []);

  const toggleSession = async () => {
    if (isActive) {
      cleanup();
      return;
    }

    try {
      setError(null);
      const ai = getAiClient();
      
      const inputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      const outputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      audioContextRef.current = outputCtx;

      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: true, 
        video: isCameraOn 
      });

      if (isCameraOn && videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } }
          },
          systemInstruction: 'You are a high-tech visionary AI. You can see through the camera and hear the user. Keep responses concise and insightful.',
          inputAudioTranscription: {},
          outputAudioTranscription: {}
        },
        callbacks: {
          onopen: () => {
            setIsActive(true);
            // Setup microphone streaming
            const source = inputCtx.createMediaStreamSource(stream);
            const scriptProcessor = inputCtx.createScriptProcessor(4096, 1, 1);
            
            scriptProcessor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              const int16 = new Int16Array(inputData.length);
              for (let i = 0; i < inputData.length; i++) {
                int16[i] = inputData[i] * 32768;
              }
              const pcmBlob = {
                data: encode(new Uint8Array(int16.buffer)),
                mimeType: 'audio/pcm;rate=16000',
              };
              sessionPromise.then(session => session.sendRealtimeInput({ media: pcmBlob }));
            };
            
            source.connect(scriptProcessor);
            scriptProcessor.connect(inputCtx.destination);

            // Setup camera frame streaming if active
            if (isCameraOn && canvasRef.current && videoRef.current) {
              const canvas = canvasRef.current;
              const video = videoRef.current;
              const ctx = canvas.getContext('2d');
              
              const sendFrame = () => {
                if (!isActive || !isCameraOn) return;
                canvas.width = video.videoWidth / 4; // Lower res for efficiency
                canvas.height = video.videoHeight / 4;
                ctx?.drawImage(video, 0, 0, canvas.width, canvas.height);
                canvas.toBlob(async (blob) => {
                  if (blob) {
                    const base64 = await blobToBase64(blob);
                    sessionPromise.then(s => s.sendRealtimeInput({ media: { data: base64, mimeType: 'image/jpeg' } }));
                  }
                }, 'image/jpeg', 0.5);
                animationFrameRef.current = requestAnimationFrame(() => setTimeout(sendFrame, 1000));
              };
              sendFrame();
            }
          },
          onmessage: async (message: LiveServerMessage) => {
            // Handle transcriptions
            if (message.serverContent?.inputTranscription) {
              const text = message.serverContent.inputTranscription.text;
              setTranscriptions(prev => [...prev.slice(-10), { role: 'user', text }]);
            }
            if (message.serverContent?.outputTranscription) {
              const text = message.serverContent.outputTranscription.text;
              setTranscriptions(prev => [...prev.slice(-10), { role: 'model', text }]);
            }

            // Handle audio output
            const audioData = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (audioData) {
              const buffer = await decodeAudioData(decode(audioData), outputCtx, 24000, 1);
              const source = outputCtx.createBufferSource();
              source.buffer = buffer;
              source.connect(outputCtx.destination);
              
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, outputCtx.currentTime);
              source.start(nextStartTimeRef.current);
              nextStartTimeRef.current += buffer.duration;
              sourcesRef.current.add(source);
              source.onended = () => sourcesRef.current.delete(source);
            }

            if (message.serverContent?.interrupted) {
              sourcesRef.current.forEach(s => s.stop());
              sourcesRef.current.clear();
              nextStartTimeRef.current = 0;
            }
          },
          onerror: (e) => {
            console.error(e);
            setError("Connection error. Please check your network and API key.");
            cleanup();
          },
          onclose: () => cleanup()
        }
      });
      sessionRef.current = await sessionPromise;
    } catch (err: any) {
      console.error(err);
      setError("Failed to start session: " + err.message);
      cleanup();
    }
  };

  const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
      reader.readAsDataURL(blob);
    });
  };

  return (
    <div className="h-full flex flex-col items-center justify-center p-6 bg-gradient-to-b from-slate-950 to-slate-900">
      <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
        
        {/* Visual Feed */}
        <div className="relative aspect-video bg-slate-800 rounded-3xl overflow-hidden shadow-2xl border border-slate-700">
          {!isCameraOn ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500">
              <i className="fas fa-video-slash text-4xl mb-4"></i>
              <p>Camera is disabled</p>
            </div>
          ) : (
            <video 
              ref={videoRef} 
              autoPlay 
              muted 
              playsInline 
              className="w-full h-full object-cover mirror" 
            />
          )}
          
          <div className="absolute bottom-4 left-4 right-4 flex justify-between items-center">
            <div className="flex items-center gap-2 glass px-3 py-1.5 rounded-full text-xs font-semibold">
              <span className={`w-2 h-2 rounded-full ${isActive ? 'bg-red-500 animate-pulse' : 'bg-slate-500'}`}></span>
              {isActive ? 'LIVE' : 'IDLE'}
            </div>
            <button 
              onClick={() => setIsCameraOn(!isCameraOn)}
              className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                isCameraOn ? 'bg-blue-600' : 'bg-slate-700/50 backdrop-blur'
              }`}
            >
              <i className={`fas ${isCameraOn ? 'fa-video' : 'fa-video-slash'}`}></i>
            </button>
          </div>
          <canvas ref={canvasRef} className="hidden" />
        </div>

        {/* AI Persona & Status */}
        <div className="space-y-6">
          <div className="glass p-8 rounded-3xl border border-white/5 relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4">
              <div className={`w-12 h-12 rounded-full bg-blue-500/10 flex items-center justify-center ${isActive ? 'animate-pulse' : ''}`}>
                 <i className="fas fa-wave-square text-blue-500"></i>
              </div>
            </div>
            <h3 className="text-2xl font-bold mb-2">Live Edit Live</h3>
            <p className="text-slate-400 text-sm mb-6">Real-time voice and vision synthesis. Your AI companion sees what you see.</p>
            
            <div className="h-32 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
              {transcriptions.length === 0 ? (
                <p className="text-slate-600 italic text-sm">Start the session to see transcription...</p>
              ) : (
                transcriptions.map((t, i) => (
                  <div key={i} className="text-sm">
                    <span className={t.role === 'user' ? 'text-blue-400' : 'text-purple-400'}>
                      {t.role === 'user' ? 'You: ' : 'AI: '}
                    </span>
                    <span className="text-slate-300">{t.text}</span>
                  </div>
                ))
              )}
            </div>

            <button
              onClick={toggleSession}
              className={`w-full mt-6 py-4 rounded-2xl font-bold text-lg transition-all flex items-center justify-center gap-3 shadow-xl ${
                isActive 
                  ? 'bg-red-600 hover:bg-red-500 text-white shadow-red-600/20' 
                  : 'bg-white text-slate-950 hover:bg-slate-200'
              }`}
            >
              {isActive ? (
                <>
                  <i className="fas fa-stop-circle"></i> Stop Session
                </>
              ) : (
                <>
                  <i className="fas fa-play"></i> Start Session
                </>
              )}
            </button>
          </div>

          {error && (
            <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-start gap-3">
              <i className="fas fa-exclamation-triangle mt-0.5"></i>
              <p>{error}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default LiveInterface;
