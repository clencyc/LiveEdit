
import React, { useState, useEffect } from 'react';
import { AppMode, MediaAsset } from './types';
import { useTheme } from './context/ThemeContext';
import ChatInterface from './components/ChatInterface';
import LiveInterface from './components/LiveInterface';
import VideoGenerator from './components/VideoGenerator';
import ImageGenerator from './components/ImageGenerator';
import MediaSidebar from './components/MediaSidebar';
import LandingPage from './components/LandingPage';
import AuthForm from './components/AuthForm';
import { SubscriptionPlans } from './components/SubscriptionPlans';
import { PaymentModal } from './components/PaymentModal';
import { useSubscription } from './hooks/useSubscription';

declare global {
  interface AIStudio {
    hasSelectedApiKey: () => Promise<boolean>;
    openSelectKey: () => Promise<void>;
  }
  interface Window {
    aistudio?: AIStudio;
  }
}

const App: React.FC = () => {
  const [mode, setMode] = useState<AppMode>(AppMode.CHAT);
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [showLanding, setShowLanding] = useState(true);
  const [showAuthForm, setShowAuthForm] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userEmail, setUserEmail] = useState('');
  const [showSubscriptionPlans, setShowSubscriptionPlans] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<{ id: number; name: string; price: number } | null>(null);

  const { subscription, loading: subscriptionLoading, hasAccess, refetch: refetchSubscription } = useSubscription(userEmail);

  useEffect(() => {
    // Check if user is already authenticated (from localStorage)
    const authToken = localStorage.getItem('authToken');
    const savedEmail = localStorage.getItem('userEmail');
    if (authToken && savedEmail) {
      setIsAuthenticated(true);
      setUserEmail(savedEmail);
      setShowLanding(false);
    }
  }, []);

  const handleAddAsset = (asset: MediaAsset) => {
    setAssets(prev => [asset, ...prev]);
  };

  const handleModeChange = (newMode: AppMode) => {
    setMode(newMode);
  };

  const handleAuthSuccess = (email: string) => {
    setIsAuthenticated(true);
    setUserEmail(email);
    setShowLanding(false);
    setShowAuthForm(false);
    localStorage.setItem('userEmail', email);
    refetchSubscription();
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setUserEmail('');
    setShowLanding(true);
    setShowAuthForm(false);
    localStorage.removeItem('authToken');
    localStorage.removeItem('userEmail');
  };

  const handleSubscribe = async (planId: number) => {
    // Fetch plan details for modal
    try {
      const response = await fetch(`${import.meta.env.VITE_BACKEND_URL || 'https://liveedit.onrender.com'}/api/payments/plans`, {
        credentials: 'include'
      });
      const plans = await response.json();
      const plan = plans.find((p: any) => p.id === planId);
      
      if (plan) {
        setSelectedPlan({ id: plan.id, name: plan.name, price: plan.price });
        setShowPaymentModal(true);
      }
    } catch (error) {
      console.error('Failed to fetch plan details:', error);
    }
  };

  if (showLanding && !showAuthForm) {
    return <LandingPage onStart={() => setShowAuthForm(true)} />;
  }

  if (showLanding && showAuthForm && !isAuthenticated) {
    return <AuthForm onAuthSuccess={handleAuthSuccess} />;
  }

  if (showSubscriptionPlans) {
    return (
      <div className="min-h-screen editor-bg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800">
          <h1 className="text-2xl font-bold">Subscription Plans</h1>
          <button
            onClick={() => setShowSubscriptionPlans(false)}
            className="px-4 py-2 text-sm text-neutral-400 hover:text-white transition-colors"
          >
            ← Back to App
          </button>
        </div>
        <SubscriptionPlans
          userEmail={userEmail}
          onSubscribe={handleSubscribe}
          currentPlan={subscription?.plan || undefined}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen editor-bg text-neutral-300 overflow-hidden">
      {/* Header */}
      <header className="h-12 border-b border-neutral-800 bg-[#111] flex items-center justify-between px-4 z-50 shrink-0">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded bg-[#00ff41] flex items-center justify-center">
              <i className="fas fa-play text-[10px] text-black"></i>
            </div>
            <h1 className="text-sm font-bold tracking-tight uppercase text-white">Live Edit <span className="text-[#00ff41]">v2.5</span></h1>
          </div>
          
          <nav className="flex items-center">
            {[
              { id: AppMode.CHAT, label: 'Chat', icon: 'fa-message' },
              { id: AppMode.LIVE, label: 'Live AI', icon: 'fa-bolt' },
              { id: AppMode.IMAGE, label: 'Pulse', icon: 'fa-image' },
              { id: AppMode.GENERATE, label: 'Creative', icon: 'fa-sliders' }
            ].map((item) => (
              <button
                key={item.id}
                onClick={() => handleModeChange(item.id)}
                className={`px-4 h-12 text-[11px] font-bold uppercase tracking-widest border-x border-transparent transition-all ${
                  mode === item.id 
                    ? 'bg-[#1a1a1a] text-white border-neutral-800 border-b-2 border-b-[#00ff41]' 
                    : 'text-neutral-500 hover:text-neutral-300 hover:bg-[#1a1a1a]'
                }`}
              >
                <i className={`fas ${item.icon} mr-2`}></i>
                {item.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-2 py-0.5 rounded bg-neutral-900 text-[10px] border border-neutral-800 font-mono">
            <span className="text-[8px] text-neutral-500">USER:</span>
            <span className="text-[10px] text-neutral-300 max-w-[120px] truncate">{userEmail}</span>
          </div>
          <div className="flex items-center gap-2 px-2 py-0.5 rounded bg-neutral-900 text-[10px] border border-neutral-800 font-mono">
            <span className={`w-1.5 h-1.5 rounded-full ${
              subscription?.status === 'active' ? 'bg-[#00ff41]' : 'bg-orange-500'
            }`}></span>
            {subscription?.status === 'active' ? `${subscription.plan?.toUpperCase()}` : 'FREE_TIER'}
          </div>
          <button
            onClick={() => setShowSubscriptionPlans(true)}
            className="px-3 py-1.5 text-[9px] font-bold uppercase tracking-widest text-neutral-500 hover:text-[#00ff41] transition-all border border-neutral-800 hover:border-[#00ff41]"
          >
            {subscription?.status === 'active' ? 'Manage' : 'Upgrade'}
          </button>
          <button
            onClick={handleLogout}
            className="px-3 py-1.5 text-[9px] font-bold uppercase tracking-widest text-neutral-500 hover:text-[#00ff41] transition-all border border-neutral-800 hover:border-[#00ff41]"
          >
            Logout
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        <MediaSidebar 
          isOpen={isSidebarOpen} 
          assets={assets} 
          onAddAsset={handleAddAsset} 
        />

        <main className="flex-1 relative overflow-hidden">
          {mode === AppMode.CHAT && <ChatInterface onAddAsset={handleAddAsset} />}
          {mode === AppMode.LIVE && <LiveInterface />}
          {mode === AppMode.IMAGE && <ImageGenerator onAddAsset={handleAddAsset} />}
          {mode === AppMode.GENERATE && <VideoGenerator onAddAsset={handleAddAsset} />}
        </main>
      </div>

      {/* Status Bar */}
      <footer className="h-6 bg-[#0a0a0a] border-t border-neutral-800 flex items-center justify-between px-3 text-[10px] font-mono text-neutral-600">
        <div className="flex gap-4">
          <span>FPS: 60.0</span>
          <span>MEMORY: 12.4GB / 32GB</span>
          <span className="text-[#00ff41]">STATUS: IDLE</span>
        </div>
        <div>PRO_STATION_ALPHA</div>
      </footer>

      {/* Payment Modal */}
      {showPaymentModal && selectedPlan && (
        <PaymentModal
          isOpen={showPaymentModal}
          onClose={() => {
            setShowPaymentModal(false);
            setSelectedPlan(null);
          }}
          planId={selectedPlan.id}
          planName={selectedPlan.name}
          planPrice={selectedPlan.price}
          userEmail={userEmail}
        />
      )}
    </div>
  );
};

export default App;
