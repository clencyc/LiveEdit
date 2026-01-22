import React, { useEffect, useState } from 'react';
import AnimatedBackground from './AnimatedBackground';

interface LandingPageProps {
  onStart: () => void;
}

const slides = [
  {
    title: 'Live Edit',
    subtitle: 'CINEMATIC + AI',
    accent: 'Real-time storycraft',
  },
  {
    title: 'Precision Editing',
    subtitle: 'Cut, enhance, and mix',
    accent: 'Frame-perfect control',
  },
  {
    title: 'Reactive Audio',
    subtitle: 'Pulse, mix, and render',
    accent: 'Sound that follows intent',
  },
];

const gradients = [
  'radial-gradient(circle at 20% 20%, rgba(0,255,65,0.25), transparent 40%), radial-gradient(circle at 80% 30%, rgba(0,136,255,0.22), transparent 45%), radial-gradient(circle at 50% 80%, rgba(255,0,153,0.18), transparent 40%)',
  'radial-gradient(circle at 30% 30%, rgba(0,255,200,0.25), transparent 45%), radial-gradient(circle at 70% 70%, rgba(120,90,255,0.22), transparent 45%), radial-gradient(circle at 50% 50%, rgba(255,120,0,0.15), transparent 35%)',
  'radial-gradient(circle at 25% 60%, rgba(0,200,255,0.25), transparent 45%), radial-gradient(circle at 75% 40%, rgba(255,0,120,0.18), transparent 40%), radial-gradient(circle at 50% 50%, rgba(0,255,65,0.18), transparent 45%)',
];

const LandingPage: React.FC<LandingPageProps> = ({ onStart }) => {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setIndex((prev) => (prev + 1) % slides.length);
    }, 3200);
    return () => clearInterval(id);
  }, []);

  const slide = slides[index];
  const gradient = gradients[index];

  return (
    <div className="min-h-screen bg-[#050505] text-white overflow-hidden relative pb-24">
      <AnimatedBackground />
      <div
        className="absolute inset-0 transition-all duration-700"
        style={{ backgroundImage: gradient, filter: 'blur(18px)', opacity: 0.9 }}
      />

      <div className="absolute inset-0 bg-gradient-to-b from-black via-transparent to-black" />

      <header className="relative z-10 flex items-center justify-between px-10 pt-8">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-[#00ff41] flex items-center justify-center shadow-[0_0_40px_rgba(0,255,65,0.35)]">
            <i className="fas fa-play text-black text-xs" />
          </div>
          <div>
            <div className="text-sm uppercase tracking-[0.3em] text-neutral-400">Live Edit</div>
            <div className="text-lg font-bold text-white tracking-tight">AI Video Editor</div>
          </div>
        </div>
        <button
          onClick={onStart}
          className="px-6 py-2 bg-[#00ff41] text-black font-bold uppercase text-[11px] tracking-[0.25em] shadow-[0_10px_40px_rgba(0,255,65,0.45)] hover:bg-[#00e03a] transition-all"
        >
          Get Started
        </button>
      </header>

      <main className="relative z-20 flex flex-col items-center text-center px-6 mt-16 pb-40">
        <div className="inline-flex items-center gap-2 px-4 py-2 border border-[#00ff41] bg-white/5 text-[11px] uppercase tracking-[0.35em] text-[#00ff41]">
          AI VIDEO EDITING
        </div>

        <h1 className="mt-6 text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight text-white drop-shadow-[0_8px_30px_rgba(0,0,0,0.45)]">
          {slide.title}
        </h1>
        <p className="mt-4 text-neutral-400 text-sm sm:text-base uppercase tracking-[0.28em]">{slide.subtitle}</p>
        <p className="mt-2 text-neutral-200 text-base sm:text-lg font-medium">{slide.accent}</p>

        <div className="relative mt-10 w-full max-w-5xl">
          <div className="absolute inset-0 bg-gradient-to-r from-[#00ff4133] via-transparent to-[#00b3ff33] blur-3xl" />
          <div className="relative grid md:grid-cols-3 gap-4 p-4">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className={`border border-neutral-800 bg-black/70 p-4 h-40 flex flex-col justify-between overflow-hidden transition-all duration-500 ${
                  i === index ? 'shadow-[0_10px_60px_rgba(0,255,65,0.18)] border-[#00ff41]' : ''
                }`}
              >
                <div className="text-neutral-500 text-[10px] uppercase tracking-[0.25em]">Module {i + 1}</div>
                <div className="text-lg font-semibold text-white">{slides[i].title}</div>
                <div className="text-[11px] text-neutral-400">{slides[i].accent}</div>
                <div className="text-[10px] text-neutral-600">{slides[i].subtitle}</div>
              </div>
            ))}
          </div>
        </div>

      </main>

      <footer className="relative z-0 mt-24">
        <div className="fixed bottom-0 left-0 right-0 h-16 w-full bg-neutral-900 border-t border-neutral-800 pointer-events-none" />
      </footer>
    </div>
  );
};

export default LandingPage;
