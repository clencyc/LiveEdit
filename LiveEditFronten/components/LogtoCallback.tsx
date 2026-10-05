import React from 'react';
import { useHandleSignInCallback } from '@logto/react';

const LogtoCallback: React.FC = () => {
  const { isLoading, error } = useHandleSignInCallback(() => {
    window.location.replace('/');
  });

  if (error) {
    return (
      <div className="min-h-screen bg-[#050505] text-white flex items-center justify-center p-6 text-center">
        <p>Sign-in failed: {error.message}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050505] text-white flex items-center justify-center">
      {isLoading ? 'Completing sign-in…' : 'Redirecting…'}
    </div>
  );
};

export default LogtoCallback;
