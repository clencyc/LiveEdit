import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

interface Plan {
  id: number;
  name: string;
  price: number;
  currency: string;
  duration_days: number;
  features: {
    ai_generations?: number;
    storage_gb?: number;
    video_exports?: string;
    priority_support?: boolean;
    api_access?: boolean;
  };
}

interface SubscriptionPlansProps {
  userEmail: string;
  onSubscribe: (planId: number) => void;
  currentPlan?: string;
}

export const SubscriptionPlans: React.FC<SubscriptionPlansProps> = ({
  userEmail,
  onSubscribe,
  currentPlan
}) => {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchPlans();
  }, []);

  const fetchPlans = async () => {
    try {
      const response = await fetch(`${import.meta.env.VITE_BACKEND_URL || 'https://liveedit.onrender.com'}/api/payments/plans`, {
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Failed to fetch plans');
      const data = await response.json();
      setPlans(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load plans');
    } finally {
      setLoading(false);
    }
  };

  const formatPrice = (price: number, currency: string) => {
    return new Intl.NumberFormat('en-KE', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 0
    }).format(price);
  };

  const getPlanFeaturesList = (features: Plan['features']) => {
    const featureList: string[] = [];
    
    if (features.ai_generations !== undefined) {
      featureList.push(
        features.ai_generations === -1 
          ? 'Unlimited AI Generations' 
          : `${features.ai_generations} AI Generations/month`
      );
    }
    
    if (features.storage_gb) {
      featureList.push(`${features.storage_gb}GB Storage`);
    }
    
    if (features.video_exports) {
      featureList.push(`Export up to ${features.video_exports}`);
    }
    
    if (features.priority_support) {
      featureList.push('Priority Support');
    }
    
    if (features.api_access) {
      featureList.push('API Access');
    }
    
    return featureList;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center text-red-500 p-8">
        <p>{error}</p>
        <button
          onClick={fetchPlans}
          className="mt-4 px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-12">
      <div className="text-center mb-12">
        <h2 className="text-4xl font-bold mb-4 bg-gradient-to-r from-blue-500 to-purple-600 bg-clip-text text-transparent">
          Choose Your Plan
        </h2>
        <p className="text-gray-400 text-lg">
          Unlock premium features and take your video editing to the next level
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {plans.map((plan, index) => {
          const isCurrentPlan = plan.name === currentPlan;
          const isPremium = plan.name === 'Pro' || plan.name === 'Premium';
          
          return (
            <motion.div
              key={plan.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className={`relative rounded-2xl p-8 ${
                isPremium
                  ? 'bg-gradient-to-br from-blue-900/50 to-purple-900/50 border-2 border-blue-500'
                  : 'bg-gray-800/50 border border-gray-700'
              } backdrop-blur-sm hover:scale-105 transition-transform duration-300`}
            >
              {isPremium && (
                <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                  <span className="bg-gradient-to-r from-blue-500 to-purple-600 text-white px-4 py-1 rounded-full text-sm font-semibold">
                    Popular
                  </span>
                </div>
              )}

              <div className="text-center mb-6">
                <h3 className="text-2xl font-bold mb-2">{plan.name}</h3>
                <div className="flex items-baseline justify-center mb-2">
                  <span className="text-4xl font-bold">
                    {formatPrice(plan.price, plan.currency)}
                  </span>
                  <span className="text-gray-400 ml-2">/month</span>
                </div>
              </div>

              <ul className="space-y-4 mb-8">
                {getPlanFeaturesList(plan.features).map((feature, idx) => (
                  <li key={idx} className="flex items-start">
                    <svg
                      className="w-5 h-5 text-green-500 mr-3 mt-0.5 flex-shrink-0"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                    <span className="text-gray-300">{feature}</span>
                  </li>
                ))}
              </ul>

              <button
                onClick={() => onSubscribe(plan.id)}
                disabled={isCurrentPlan}
                className={`w-full py-3 rounded-lg font-semibold transition-all duration-300 ${
                  isCurrentPlan
                    ? 'bg-gray-600 cursor-not-allowed text-gray-400'
                    : isPremium
                    ? 'bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white shadow-lg hover:shadow-xl'
                    : 'bg-gray-700 hover:bg-gray-600 text-white'
                }`}
              >
                {isCurrentPlan ? 'Current Plan' : 'Subscribe Now'}
              </button>
            </motion.div>
          );
        })}
      </div>

      <div className="mt-12 text-center text-gray-400 text-sm">
        <p>All plans include 24/7 customer support and automatic updates</p>
        <p className="mt-2">Cancel anytime. No questions asked.</p>
      </div>
    </div>
  );
};
