import React from 'react';
import { useTheme } from '../context/ThemeContext';

const ThemeToggle: React.FC = () => {
  const { theme, toggleTheme } = useTheme();
  const nextTheme = theme === 'dark' ? 'light' : 'dark';

  return (
    <button
      type="button"
      role="switch"
      aria-checked={theme === 'dark'}
      aria-label={`Dark theme ${theme === 'dark' ? 'on' : 'off'}. Switch to ${nextTheme} theme`}
      onClick={toggleTheme}
      className="editor-theme-toggle inline-flex h-8 shrink-0 items-center gap-2 rounded border border-neutral-700 px-2 text-[10px] font-bold uppercase tracking-widest text-neutral-500 transition-colors hover:border-[#00ff41] hover:text-[#00ff41] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#00ff41]"
    >
      <i className={`fas ${theme === 'dark' ? 'fa-moon' : 'fa-sun'}`} aria-hidden="true"></i>
      <span className="hidden sm:inline">{theme === 'dark' ? 'Dark' : 'Light'}</span>
    </button>
  );
};

export default ThemeToggle;
