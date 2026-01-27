import React, { useState } from 'react';

interface AuthFormProps {
  onAuthSuccess: (email: string) => void;
}

const AuthForm: React.FC<AuthFormProps> = ({ onAuthSuccess }) => {
  const [isSignup, setIsSignup] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const validateEmail = (email: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email.trim() || !password.trim()) {
      setError('Email and password are required');
      return;
    }

    if (!validateEmail(email)) {
      setError('Please enter a valid email');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    if (isSignup && password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);
    try {
      const backendUrl = import.meta.env.VITE_BACKEND_URL || 'https://liveedit.onrender.com';
      const endpoint = isSignup ? '/api/auth/signup' : '/api/auth/login';
      
      const response = await fetch(`${backendUrl}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || `${isSignup ? 'Signup' : 'Login'} failed`);
      }

      const data = await response.json();
      localStorage.setItem('authToken', data.token || email);
      onAuthSuccess(email);
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-md">
        <div className="absolute inset-0 bg-gradient-to-r from-[#00ff4133] via-transparent to-[#00b3ff33] blur-2xl" />
        
        <div className="relative bg-[#0a0a0a] border border-[#00ff41] p-8 shadow-[0_20px_80px_rgba(0,255,65,0.2)]">
          <h2 className="text-2xl font-bold text-white mb-2">
            {isSignup ? 'Create Account' : 'Welcome Back'}
          </h2>
          <p className="text-[11px] uppercase text-neutral-500 tracking-[0.2em] mb-6">
            {isSignup ? 'Join Live Edit' : 'Sign in to continue'}
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-[10px] uppercase text-neutral-400 tracking-widest block mb-2">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                className="w-full px-4 py-3 bg-[#1a1a1a] border border-neutral-700 text-white text-sm focus:outline-none focus:border-[#00ff41] transition-all"
              />
            </div>

            <div>
              <label className="text-[10px] uppercase text-neutral-400 tracking-widest block mb-2">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-4 py-3 bg-[#1a1a1a] border border-neutral-700 text-white text-sm focus:outline-none focus:border-[#00ff41] transition-all"
              />
            </div>

            {isSignup && (
              <div>
                <label className="text-[10px] uppercase text-neutral-400 tracking-widest block mb-2">
                  Confirm Password
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-4 py-3 bg-[#1a1a1a] border border-neutral-700 text-white text-sm focus:outline-none focus:border-[#00ff41] transition-all"
                />
              </div>
            )}

            {error && (
              <div className="px-3 py-2 bg-red-900/20 border border-red-700 text-[11px] text-red-400 rounded">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 mt-6 bg-[#00ff41] text-black font-bold uppercase text-[11px] tracking-[0.25em] hover:bg-[#00e03a] transition-all disabled:opacity-50 shadow-[0_10px_40px_rgba(0,255,65,0.35)]"
            >
              {loading ? 'Processing...' : isSignup ? 'Create Account' : 'Sign In'}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-neutral-800 text-center">
            <p className="text-[10px] text-neutral-500 mb-3">
              {isSignup ? 'Already have an account?' : "Don't have an account?"}
            </p>
            <button
              type="button"
              onClick={() => {
                setIsSignup(!isSignup);
                setError('');
                setPassword('');
                setConfirmPassword('');
              }}
              className="text-[#00ff41] hover:text-[#00e03a] text-[10px] font-bold uppercase tracking-widest"
            >
              {isSignup ? 'Sign In' : 'Sign Up'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuthForm;
