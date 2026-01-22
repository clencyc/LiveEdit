import { useState, useEffect } from 'react';

interface Subscription {
  status: string;
  plan: string | null;
  end_date: string | null;
}

interface UseSubscriptionResult {
  subscription: Subscription | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
  hasAccess: (feature: string) => boolean;
}

const PLAN_FEATURES = {
  free: {
    ai_generations: 10,
    storage_gb: 1,
    video_exports: '480p'
  },
  Basic: {
    ai_generations: 50,
    storage_gb: 5,
    video_exports: '720p'
  },
  Pro: {
    ai_generations: 200,
    storage_gb: 20,
    video_exports: '1080p',
    priority_support: true
  },
  Premium: {
    ai_generations: -1, // Unlimited
    storage_gb: 100,
    video_exports: '4K',
    priority_support: true,
    api_access: true
  }
};

export const useSubscription = (userEmail: string | null): UseSubscriptionResult => {
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSubscription = async () => {
    if (!userEmail) {
      setSubscription(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const response = await fetch(
        `http://localhost:5000/api/user/subscription?email=${encodeURIComponent(userEmail)}`
      );
      
      if (!response.ok) {
        throw new Error('Failed to fetch subscription');
      }

      const data = await response.json();
      setSubscription(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load subscription');
      setSubscription(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSubscription();
  }, [userEmail]);

  const hasAccess = (feature: string): boolean => {
    if (!subscription) return false;
    
    const plan = subscription.plan || 'free';
    const planFeatures = PLAN_FEATURES[plan as keyof typeof PLAN_FEATURES] || PLAN_FEATURES.free;
    
    // Check specific features
    switch (feature) {
      case 'ai_generation':
        return subscription.status === 'active' || subscription.status === 'free';
      case '1080p_export':
        return planFeatures.video_exports === '1080p' || planFeatures.video_exports === '4K';
      case '4k_export':
        return planFeatures.video_exports === '4K';
      case 'priority_support':
        return planFeatures.priority_support === true;
      case 'api_access':
        return planFeatures.api_access === true;
      default:
        return subscription.status === 'active';
    }
  };

  return {
    subscription,
    loading,
    error,
    refetch: fetchSubscription,
    hasAccess
  };
};
