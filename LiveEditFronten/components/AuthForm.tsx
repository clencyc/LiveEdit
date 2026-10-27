import React from 'react';
import { useLogto } from '@logto/react';

interface AuthFormProps {
  onClose: () => void;
}

const AuthForm: React.FC<AuthFormProps> = ({ onClose }) => {
  const { signIn, error, isLoading } = useLogto();

  return (
    <div className="editor-theme-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-4">
      <div className="editor-theme-modal relative w-full max-w-md rounded-xl border border-neutral-800 bg-[#111] p-8 text-center">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 text-sm text-neutral-400 hover:text-white"
        >
          Back
        </button>
        <h1 className="mb-2 text-xl font-bold text-white">Sign in or create an account</h1>
        <p className="mb-6 text-sm text-neutral-400">
          Use Google or your email address. New users are registered automatically.
        </p>
        <button
          type="button"
          disabled={isLoading}
          onClick={() => void signIn({
            redirectUri: `${window.location.origin}/callback`,
            directSignIn: { method: 'social', target: 'google' },
          })}
          className="w-full rounded bg-[#00ff41] px-4 py-3 font-bold text-black hover:bg-[#00e03a] disabled:cursor-wait disabled:opacity-60"
        >
          {isLoading ? 'Connecting…' : 'Continue with Google'}
        </button>
        <button
          type="button"
          disabled={isLoading}
          onClick={() => void signIn({
            redirectUri: `${window.location.origin}/callback`,
            firstScreen: 'signIn',
          })}
          className="mt-3 w-full rounded border border-neutral-700 px-4 py-3 font-bold text-white hover:border-neutral-500 disabled:cursor-wait disabled:opacity-60"
        >
          Continue with email
        </button>
        <button
          type="button"
          disabled={isLoading}
          onClick={() => void signIn({
            redirectUri: `${window.location.origin}/callback`,
            firstScreen: 'reset_password',
          })}
          className="mt-4 text-sm text-neutral-400 underline hover:text-white disabled:cursor-wait disabled:opacity-60"
        >
          Forgot your password?
        </button>
        {error && (
          <p role="alert" className="mt-4 text-sm text-red-400">
            {error.message || 'Unable to start sign-in. Please try again.'}
          </p>
        )}
      </div>
    </div>
  );
};

export default AuthForm;
