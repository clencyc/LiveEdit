
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ThemeProvider } from './context/ThemeContext';
import { LogtoProvider } from '@logto/react';
import LogtoCallback from './components/LogtoCallback';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const endpoint = import.meta.env.VITE_LOGTO_ENDPOINT;
const appId = import.meta.env.VITE_LOGTO_APP_ID;
const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    {endpoint && appId ? (
      <LogtoProvider config={{ endpoint, appId, scopes: ['email'] }}>
        <ThemeProvider>
          {window.location.pathname === '/callback' ? <LogtoCallback /> : <App />}
        </ThemeProvider>
      </LogtoProvider>
    ) : (
      <div className="min-h-screen bg-[#050505] text-white flex items-center justify-center p-6 text-center">
        <p>Configure VITE_LOGTO_ENDPOINT and VITE_LOGTO_APP_ID to enable Google sign-in.</p>
      </div>
    )}
  </React.StrictMode>
);
