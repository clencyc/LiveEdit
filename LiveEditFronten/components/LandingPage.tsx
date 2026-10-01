import React, { useEffect, useState } from 'react';

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
      <div
        className="absolute inset-0 transition-all duration-700"
        style={{ backgroundImage: gradient, filter: 'blur(18px)', opacity: 0.9 }}
      />

      <div className="absolute inset-0 bg-gradient-to-b from-black via-transparent to-black" />

      <header className="relative z-10 pt-6 px-4">
        <div className="mx-auto max-w-6xl rounded-2xl border border-[#3b2d44] bg-[#201b2d]/90 shadow-[0_8px_30px_rgba(14,10,22,0.7)] backdrop-blur-sm">
          <div className="flex items-center justify-between gap-4 px-5 py-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-full bg-[#00ff41] flex items-center justify-center shadow-[0_0_40px_rgba(0,255,65,0.35)] shrink-0">
                <i className="fas fa-play text-black text-xs" />
              </div>
              <div className="min-w-0">
                <div className="text-[11px] uppercase tracking-[0.3em] text-neutral-400">Live Edit</div>
                <div className="text-lg font-bold text-white tracking-tight truncate">AI Video Editor</div>
              </div>
            </div>

            <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-neutral-200">
              {[
                { label: 'Home', href: '#top' },
                { label: 'Hall of Fame', href: '#hall-of-fame' },
                { label: 'Blog', href: '#blog' },
                { label: 'Demo', href: '#demo' },
              ].map((item) => (
                <a
                  key={item.label}
                  href={item.href}
                  className="transition-colors hover:text-[#00ff41]"
                >
                  {item.label}
                </a>
              ))}
            </nav>

            <div className="flex items-center gap-3 ml-auto">
              <button
                onClick={onStart}
                className="hidden sm:inline-flex px-4 py-2 bg-[#00ff41] text-black font-bold uppercase text-[10px] tracking-[0.25em] shadow-[0_10px_40px_rgba(0,255,65,0.45)] hover:bg-[#00e03a] transition-all"
              >
                Get Started
              </button>
              <a
                href="https://github.com/sponsors/clencyc"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-xl border border-[#00ff41] bg-[#00ff41]/10 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.25em] text-[#00ff41] hover:bg-[#00ff41]/20 transition-all"
              >
                <span aria-hidden="true">♥</span>
                Sponsor
              </a>
              <a
                href="https://github.com/clencyc/LiveEdit"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-xl border border-neutral-700 bg-[#0d0d0d] px-4 py-2 text-[11px] font-bold uppercase tracking-[0.25em] text-white hover:border-[#00ff41] hover:text-[#00ff41] transition-all"
              >
                <i className="fab fa-github" />
                GitHub
              </a>
            </div>
          </div>
        </div>
      </header>

      <main id="top" className="relative z-20 flex flex-col items-center text-center px-6 mt-16 pb-20">
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

      <section id="hall-of-fame" className="relative z-20 px-6 py-20 border-t border-neutral-800">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 px-4 py-2 border border-[#00ff41] bg-white/5 text-[11px] uppercase tracking-[0.35em] text-[#00ff41] mb-6">
              👥 Community
            </div>
            <h2 className="text-4xl font-bold text-white mb-3">Contributors Hall of Fame</h2>
            <p className="text-neutral-400 text-sm uppercase tracking-[0.25em]">People shaping the next iteration of Live Edit</p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              { name: 'C.Christine', role: 'Founder & creative technologist', blurb: 'Built the initial prototype, creative direction, and product vision.' },
              { name: 'Community Beta Testers', role: 'Early adopters', blurb: 'Feedback from real editors helped shape the editing workflow and prompt system.' },
              { name: 'Open contributors', role: 'Design + engineering', blurb: 'Future collaborators and builders who help improve the product and writing.' },
            ].map((person, i) => (
              <div key={i} className="rounded-xl border border-neutral-800 bg-white/[0.03] p-5 hover:border-[#00ff41] transition-all">
                <div className="w-12 h-12 rounded-full bg-[#00ff41] text-black font-bold flex items-center justify-center mb-4 shadow-[0_0_30px_rgba(0,255,65,0.25)]">
                  {person.name.split(' ').map((part) => part[0]).slice(0, 2).join('').toUpperCase()}
                </div>
                <div className="text-lg font-semibold text-white">{person.name}</div>
                <div className="mt-1 text-[11px] uppercase tracking-[0.2em] text-[#00ff41]">{person.role}</div>
                <p className="mt-4 text-sm text-neutral-400 leading-relaxed">{person.blurb}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="blog" className="relative z-20 px-6 py-20 border-t border-neutral-800 bg-[#0a0a0a]">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 px-4 py-2 border border-[#00ff41] bg-white/5 text-[11px] uppercase tracking-[0.35em] text-[#00ff41] mb-6">
              ✍️ Writing
            </div>
            <h2 className="text-4xl font-bold text-white mb-3">Blog & Notes</h2>
            <p className="text-neutral-400 text-sm uppercase tracking-[0.25em]">Thoughts on AI, creative tooling, and the product journey</p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              { title: 'Building with AI as a creative partner', date: 'Coming soon', summary: 'A look at designing workflows that keep human taste in the loop.' },
              { title: 'Why editing is still storytelling', date: 'Coming soon', summary: 'Notes on craft, pacing, and how AI can accelerate the process without flattening voice.' },
              { title: 'Inside the Live Edit workflow', date: 'Coming soon', summary: 'A practical breakdown of the systems behind prompt-driven video production.' },
            ].map((post, i) => (
              <article key={i} className="rounded-xl border border-neutral-800 bg-black/40 p-5 hover:border-[#00ff41] transition-all group">
                <div className="text-[10px] uppercase tracking-[0.25em] text-neutral-500 mb-3">{post.date}</div>
                <h3 className="text-xl font-semibold text-white group-hover:text-[#00ff41] transition-colors">{post.title}</h3>
                <p className="mt-4 text-sm text-neutral-400 leading-relaxed">{post.summary}</p>
                <div className="mt-6 text-[11px] uppercase tracking-[0.2em] text-[#00ff41]">Read article →</div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Demo Video Section */}
      <section id="demo" className="relative z-20 px-6 py-20 border-t border-neutral-800">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 px-4 py-2 border border-[#00ff41] bg-white/5 text-[11px] uppercase tracking-[0.35em] text-[#00ff41] mb-6">
              🎬 Live Demo
            </div>
            <h2 className="text-4xl font-bold text-white mb-3">See It In Action</h2>
            <p className="text-neutral-400 text-sm uppercase tracking-[0.25em]">Watch how AI transforms your video workflow</p>
          </div>

          <div className="relative group">
            <div className="absolute -inset-1 bg-gradient-to-r from-[#00ff41] via-[#00b3ff] to-[#ff0080] rounded-lg opacity-0 group-hover:opacity-20 blur transition duration-500" />
            <div className="relative bg-black rounded-lg overflow-hidden border border-neutral-800 group-hover:border-[#00ff41] transition-all">
              <iframe
                width="100%"
                height="450"
                src="https://www.youtube.com/embed/jP0_gqnZ0sw?rel=0&modestbranding=1"
                title="LiveEdit Creative Panel Demo"
                frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="w-full aspect-video"
              />
            </div>
          </div>

          <div className="mt-8 grid md:grid-cols-3 gap-4">
            {[
              { icon: '⚡', title: 'Gemini 3 Powered', desc: 'AI understands your editing intent' },
              { icon: '🎞️', title: 'Multi-Clip Magic', desc: 'Upload 3+ videos, get one masterpiece' },
              { icon: '🚀', title: 'Instant Render', desc: 'Async processing means zero wait' },
            ].map((feature, i) => (
              <div key={i} className="p-4 border border-neutral-800 bg-white/[0.02] hover:bg-white/[0.05] transition-all rounded-lg">
                <div className="text-2xl mb-2">{feature.icon}</div>
                <div className="text-sm font-semibold text-white">{feature.title}</div>
                <div className="text-xs text-neutral-500 mt-1">{feature.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Authors Section */}
      <section className="relative z-20 px-6 py-20 bg-gradient-to-b from-transparent via-[#0a0a0a] to-black border-t border-neutral-800">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-white mb-2">Built With Vision</h2>
            <p className="text-neutral-500 text-sm uppercase tracking-[0.25em]">Crafted for creators, by creators</p>
          </div>

          <div className="relative">
            {/* Animated background orb */}
            <div className="absolute inset-0 bg-gradient-radial from-[#00ff4120] via-transparent to-transparent blur-3xl pointer-events-none" />
            
            <div className="relative p-8 border border-neutral-700 rounded-xl bg-gradient-to-br from-white/[0.05] to-white/[0.02] hover:border-[#00ff41] transition-all duration-300">
              <div className="flex flex-col md:flex-row items-center gap-8">
                {/* Avatar placeholder */}
                <div className="flex-shrink-0">
                  <img 
                    src="/christine.jpeg"
                    alt="C.Christine"
                    className="w-32 h-32 rounded-full object-cover border-2 border-[#00ff41] shadow-[0_0_30px_rgba(0,255,65,0.3)]"
                  />
                </div>

                {/* Author info */}
                <div className="flex-1 text-center md:text-left">
                  <h3 className="text-2xl font-bold text-white mb-2">
                    Built by the incredible <span className="text-[#00ff41]">C.Christine</span>
                  </h3>
                  <p className="text-neutral-400 text-sm mb-4 leading-relaxed">
                    Creative technologist passionate about AI-powered workflows. LiveEdit was built during the <span className="text-[#00ff41] font-semibold">Gemini 3 Hackathon</span> to prove that natural language can orchestrate complex video production pipelines.
                  </p>
                  <div className="flex flex-wrap justify-center md:justify-start gap-3">
                    {[
                      { icon: 'fa-github', href: '#', label: 'GitHub' },
                      { icon: 'fa-twitter', href: '#', label: 'Twitter' },
                      { icon: 'fa-linkedin', href: '#', label: 'LinkedIn' },
                    ].map((link, i) => (
                      <a
                        key={i}
                        href={link.href}
                        className="w-10 h-10 rounded-lg border border-neutral-700 bg-white/5 hover:bg-white/10 hover:border-[#00ff41] flex items-center justify-center transition-all text-neutral-400 hover:text-[#00ff41]"
                        title={link.label}
                      >
                        <i className={`fas ${link.icon}`} />
                      </a>
                    ))}
                  </div>
                </div>
              </div>

              {/* Tech stack badge */}
              <div className="mt-8 pt-8 border-t border-neutral-700">
                <p className="text-xs uppercase tracking-[0.3em] text-neutral-600 mb-4">Powered by</p>
                <div className="flex flex-wrap gap-2">
                  {['Gemini 3 Flash', 'React', 'Flask', 'ffmpeg', 'Celery', 'PostgreSQL'].map((tech, i) => (
                    <span key={i} className="px-3 py-1 rounded-full bg-white/5 border border-neutral-700 text-[11px] text-neutral-400 font-mono">
                      {tech}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer className="relative z-0 mt-24">
        <div className="fixed bottom-0 left-0 right-0 h-16 w-full bg-neutral-900 border-t border-neutral-800 pointer-events-none" />
      </footer>
    </div>
  );
};

export default LandingPage;
