import React from 'react';
import { motion } from 'framer-motion';

interface SubscriptionGateProps {
  children: React.ReactNode;
  requiredFeature: string;
  hasAccess: boolean;
  onUpgrade: () => void;
  fallbackMessage?: string;
}

export const SubscriptionGate: React.FC<SubscriptionGateProps> = ({
  children,
  requiredFeature,
  hasAccess,
  onUpgrade,
  fallbackMessage
}) => {
  if (hasAccess) {
    return <>{children}</>;
  }

  const getFeatureMessage = () => {
    switch (requiredFeature) {
      case '1080p_export':
        return 'Export videos in 1080p HD quality';
      case '4k_export':
        return 'Export videos in stunning 4K resolution';
      case 'priority_support':
        return 'Get priority support from our team';
      case 'api_access':
        return 'Access our powerful API';
      default:
        return fallbackMessage || 'Access premium features';
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="relative"
    >
      {/* Blurred content */}
      <div className="filter blur-sm pointer-events-none select-none">
        {children}
      </div>

      {/* Overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-gray-900/95 to-purple-900/95 backdrop-blur-sm flex items-center justify-center rounded-lg">
        <div className="text-center p-8 max-w-md">
          <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full mx-auto flex items-center justify-center mb-4">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          
          <h3 className="text-2xl font-bold mb-2">Premium Feature</h3>
          <p className="text-gray-300 mb-6">{getFeatureMessage()}</p>
          
          <button
            onClick={onUpgrade}
            className="px-8 py-3 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white font-semibold rounded-lg transition-all duration-300 shadow-lg hover:shadow-xl"
          >
            Upgrade Now
          </button>
        </div>
      </div>
    </motion.div>
  );
};
