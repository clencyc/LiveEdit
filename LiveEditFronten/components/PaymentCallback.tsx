import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate, useSearchParams } from 'react-router-dom';

export const PaymentCallback: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'verifying' | 'success' | 'error'>('verifying');
  const [message, setMessage] = useState('Verifying your payment...');

  useEffect(() => {
    const reference = searchParams.get('reference');
    
    if (!reference) {
      setStatus('error');
      setMessage('Invalid payment reference');
      return;
    }

    verifyPayment(reference);
  }, [searchParams]);

  const verifyPayment = async (reference: string) => {
    try {
      const response = await fetch(`${import.meta.env.VITE_BACKEND_URL || 'https://liveedit.onrender.com'}/api/payments/verify/${reference}`);
      const data = await response.json();

      if (response.ok && data.success) {
        setStatus('success');
        setMessage('Payment successful! Your subscription is now active.');
        
        // Redirect to dashboard after 3 seconds
        setTimeout(() => {
          navigate('/');
        }, 3000);
      } else {
        setStatus('error');
        setMessage(data.error || 'Payment verification failed');
      }
    } catch (err) {
      setStatus('error');
      setMessage('Failed to verify payment. Please contact support.');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900/20 to-blue-900/20 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-gray-900/80 backdrop-blur-lg rounded-2xl p-8 max-w-md w-full shadow-2xl border border-gray-700"
      >
        <div className="text-center">
          {status === 'verifying' && (
            <>
              <div className="w-16 h-16 bg-blue-500/20 rounded-full mx-auto flex items-center justify-center mb-4">
                <svg className="animate-spin h-8 w-8 text-blue-500" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              </div>
              <h2 className="text-2xl font-bold mb-2">Verifying Payment</h2>
            </>
          )}

          {status === 'success' && (
            <>
              <div className="w-16 h-16 bg-green-500/20 rounded-full mx-auto flex items-center justify-center mb-4">
                <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold mb-2 text-green-500">Payment Successful!</h2>
            </>
          )}

          {status === 'error' && (
            <>
              <div className="w-16 h-16 bg-red-500/20 rounded-full mx-auto flex items-center justify-center mb-4">
                <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold mb-2 text-red-500">Payment Failed</h2>
            </>
          )}

          <p className="text-gray-400 mb-6">{message}</p>

          {status === 'success' && (
            <div className="space-y-2 text-sm text-gray-500">
              <p>Redirecting you to the dashboard...</p>
            </div>
          )}

          {status === 'error' && (
            <button
              onClick={() => navigate('/')}
              className="mt-4 px-6 py-3 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white font-semibold rounded-lg transition-all duration-300"
            >
              Return to Dashboard
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
};
