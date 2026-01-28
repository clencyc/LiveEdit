import React, { useEffect, useState } from 'react';

interface TimeLeft {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

const ProductHuntLaunchTimer: React.FC = () => {
  const [timeLeft, setTimeLeft] = useState<TimeLeft>({
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0,
  });
  const [isLive, setIsLive] = useState(false);

  useEffect(() => {
    const calculateTimeLeft = () => {
      // Product Hunt Launch: January 30, 2026 at 12:00 AM PST (8:00 AM UTC)
      const launchDate = new Date('2026-01-30T08:00:00Z').getTime();
      const now = new Date().getTime();
      const difference = launchDate - now;

      if (difference > 0) {
        setTimeLeft({
          days: Math.floor(difference / (1000 * 60 * 60 * 24)),
          hours: Math.floor((difference / (1000 * 60 * 60)) % 24),
          minutes: Math.floor((difference / 1000 / 60) % 60),
          seconds: Math.floor((difference / 1000) % 60),
        });
        setIsLive(false);
      } else {
        setIsLive(true);
      }
    };

    calculateTimeLeft();
    const timer = setInterval(calculateTimeLeft, 1000);
    return () => clearInterval(timer);
  }, []);

  if (isLive) {
    return (
      <div className="text-center">
        <div className="inline-flex items-center gap-2 px-4 py-3 border border-[#00ff41] bg-[#00ff41]/10 text-[13px] uppercase tracking-[0.35em] text-[#00ff41] font-bold animate-pulse">
          <i className="fas fa-circle text-[#00ff41]" />
          LIVE NOW ON PRODUCT HUNT
        </div>
        <div className="mt-4">
          <a
            href="https://www.producthunt.com/posts/live-edit"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block px-8 py-3 bg-[#ff6b35] text-white font-bold uppercase text-sm tracking-[0.25em] hover:bg-[#ff5722] transition-all shadow-[0_10px_40px_rgba(255,107,53,0.35)]"
          >
            View on Product Hunt
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="text-center">
      <div className="inline-flex items-center gap-2 px-4 py-2 border border-[#00ff41] bg-white/5 text-[11px] uppercase tracking-[0.35em] text-[#00ff41] mb-6">
        <i className="fas fa-rocket" />
        LAUNCHING ON PRODUCT HUNT
      </div>

      <div className="grid grid-cols-4 gap-2 sm:gap-4 max-w-md mx-auto mt-6">
        {[
          { value: timeLeft.days, label: 'Days' },
          { value: timeLeft.hours, label: 'Hours' },
          { value: timeLeft.minutes, label: 'Minutes' },
          { value: timeLeft.seconds, label: 'Seconds' },
        ].map((item, idx) => (
          <div
            key={idx}
            className="border border-[#00ff41]/30 bg-black/50 p-3 sm:p-4 rounded-lg backdrop-blur-sm"
          >
            <div className="text-xl sm:text-2xl md:text-3xl font-bold text-[#00ff41] font-mono">
              {String(item.value).padStart(2, '0')}
            </div>
            <div className="text-[10px] sm:text-xs text-neutral-500 uppercase tracking-[0.2em] mt-1">
              {item.label}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
        <a
          href="https://www.producthunt.com/posts/live-edit"
          target="_blank"
          rel="noopener noreferrer"
          className="px-6 py-2 bg-[#00ff41] text-black font-bold uppercase text-[11px] tracking-[0.25em] shadow-[0_10px_40px_rgba(0,255,65,0.45)] hover:bg-[#00e03a] transition-all"
        >
          Notify Me
        </a>
        <a
          href="https://twitter.com/intent/tweet?text=Check%20out%20LiveEdit%20-%20Your%20AI%20Creative%20Copilot%20coming%20soon%20on%20Product%20Hunt!%20%23ProductHunt%20%23AI"
          target="_blank"
          rel="noopener noreferrer"
          className="px-6 py-2 border border-neutral-700 text-neutral-300 font-bold uppercase text-[11px] tracking-[0.25em] hover:border-[#00ff41] hover:text-[#00ff41] transition-all"
        >
          Share on X
        </a>
      </div>
    </div>
  );
};

export default ProductHuntLaunchTimer;
