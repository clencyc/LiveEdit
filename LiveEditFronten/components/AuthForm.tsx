import React from 'react';
import { useLogto } from '@logto/react';

interface AuthFormProps {
  onClose: () => void;
}

const AuthForm: React.FC<AuthFormProps> = ({ onClose }) => {
  const { signIn, error, isLoading } = useLogto();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-md rounded-xl border border-neutral-800 bg-[#111] p-8 text-center">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 text-sm text-neutral-400 hover:text-white"
        >
          Back
        </button>
        <h1 className="mb-2 text-xl font-bold text-white">Sign in to Live Edit</h1>
        <p className="mb-6 text-sm text-neutral-400">Continue securely with your Google account.</p>
        <button
          type="button"
          disabled={isLoading}
          onClick={() => void signIn({
            redirectUri: `${window.location.origin}/callback`,
            directSignIn: { method: 'social', target: 'google' },
          })}
          className="w-full rounded bg-[#00ff41] px-4 py-3 font-bold text-black hover:bg-[#00e03a] disabled:cursor-wait disabled:opacity-60"
        >
          {isLoading ? 'Redirecting…' : 'Continue with Google'}
        </button>
        {error && <p className="mt-4 text-sm text-red-400">{error.message}</p>}
      </div>
    </div>
  );
};

export default AuthForm;
