# Paystack Integration Setup Guide

## Overview
LiveEdit now supports premium subscriptions via Paystack payment integration, allowing users to access advanced features through tiered pricing plans.

## Features Implemented

### Backend (Flask)
- ✅ Paystack SDK integration (`paystackapi`)
- ✅ Subscription plans database table with 3 tiers (Basic, Pro, Premium)
- ✅ Transactions tracking table
- ✅ Payment initialization endpoint
- ✅ Payment verification endpoint
- ✅ User subscription status tracking
- ✅ Automatic subscription activation on successful payment

### Frontend (React/TypeScript)
- ✅ SubscriptionPlans component with pricing cards
- ✅ PaymentModal for checkout
- ✅ PaymentCallback component for handling redirects
- ✅ useSubscription hook for checking access
- ✅ SubscriptionGate component for feature restrictions
- ✅ Integration with App.tsx for subscription management

## Setup Instructions

### 1. Backend Setup

#### Install Dependencies
```bash
cd LiveEditBackend
pip install -r requirements.txt
```

#### Configure Environment Variables
Create or update `.env` file:
```bash
# Copy example file
cp .env.example .env

# Edit with your keys
nano .env
```

Add your Paystack credentials:
```env
PAYSTACK_SECRET_KEY=sk_test_xxxxxxxxxxxxx
PAYSTACK_PUBLIC_KEY=pk_test_xxxxxxxxxxxxx
PAYSTACK_CALLBACK_URL=http://localhost:5173/payment/callback
```

**Get Paystack Keys:**
1. Sign up at https://paystack.com
2. Go to Settings → API Keys & Webhooks
3. Copy your Test keys (use Live keys for production)

#### Initialize Database Tables
The payment tables will be created automatically when you start the backend:
```bash
python app.py
```

Tables created:
- `users` (with subscription fields)
- `subscription_plans` (pre-populated with 3 plans)
- `transactions` (payment history)

### 2. Frontend Setup

#### Configure Environment Variables
Create `.env.local`:
```bash
cd LiveEditFronten
cp .env.local.example .env.local
nano .env.local
```

Add configuration:
```env
VITE_API_URL=http://localhost:5000
VITE_PAYSTACK_PUBLIC_KEY=pk_test_xxxxxxxxxxxxx
```

#### Install Dependencies (if needed)
```bash
npm install
```

#### Start Development Server
```bash
npm run dev
```

### 3. Testing the Integration

#### Test Flow:
1. **Sign up/Login** to the app
2. Click **"Upgrade"** button in the header
3. **Select a plan** (Basic, Pro, or Premium)
4. Click **"Subscribe Now"**
5. Complete payment in Paystack's test checkout
6. Get **redirected back** to the app
7. **Subscription activated** automatically

#### Test Card Details:
```
Card Number: 4084 0840 8408 4081
CVV: 408
Expiry: Any future date
PIN: 0000
OTP: 123456
```

## API Endpoints

### Get Subscription Plans
```http
GET /api/payments/plans
```
Returns all active subscription plans.

### Initialize Payment
```http
POST /api/payments/initialize
Content-Type: application/json

{
  "email": "user@example.com",
  "plan_id": 1
}
```
Returns Paystack authorization URL.

### Verify Payment
```http
GET /api/payments/verify/{reference}
```
Verifies payment and activates subscription.

### Get User Subscription
```http
GET /api/user/subscription?email=user@example.com
```
Returns user's current subscription status.

### Get Transaction History
```http
GET /api/user/transactions?email=user@example.com
```
Returns user's payment history.

## Subscription Plans

### Free Tier
- 10 AI Generations/month
- 1GB Storage
- 480p Video Exports
- No cost

### Basic - ₦2,000/month
- 50 AI Generations/month
- 5GB Storage
- 720p Video Exports

### Pro - ₦5,000/month
- 200 AI Generations/month
- 20GB Storage
- 1080p Video Exports
- Priority Support

### Premium - ₦10,000/month
- Unlimited AI Generations
- 100GB Storage
- 4K Video Exports
- Priority Support
- API Access

## Feature Gating

### Using the SubscriptionGate Component
```tsx
import { SubscriptionGate } from './components/SubscriptionGate';
import { useSubscription } from './hooks/useSubscription';

function MyComponent() {
  const { hasAccess } = useSubscription(userEmail);

  return (
    <SubscriptionGate
      requiredFeature="1080p_export"
      hasAccess={hasAccess('1080p_export')}
      onUpgrade={() => setShowSubscriptionPlans(true)}
    >
      {/* Premium feature content */}
      <VideoExport resolution="1080p" />
    </SubscriptionGate>
  );
}
```

### Available Feature Checks
- `ai_generation` - Basic AI features
- `1080p_export` - HD video export
- `4k_export` - 4K video export
- `priority_support` - Priority customer support
- `api_access` - API endpoint access

## Production Deployment

### Backend (Vercel/Heroku)
1. Set environment variables in your hosting platform
2. Use **live Paystack keys** (not test keys)
3. Update `PAYSTACK_CALLBACK_URL` to production domain
4. Ensure PostgreSQL database is configured

### Frontend (Vercel)
1. Add environment variables in Vercel dashboard:
   - `VITE_API_URL` → Your backend API URL
   - `VITE_PAYSTACK_PUBLIC_KEY` → Live public key
2. Update callback URL in Paystack dashboard
3. Deploy and test with real payments

### Important: Webhook Setup (Optional)
For production, configure webhooks in Paystack:
1. Go to Settings → Webhooks
2. Add webhook URL: `https://your-api.com/api/webhooks/paystack`
3. Subscribe to `charge.success` event
4. Implement webhook handler in backend for real-time updates

## Security Considerations

- ✅ Never expose secret keys in frontend
- ✅ Validate all payments server-side
- ✅ Use HTTPS in production
- ✅ Implement rate limiting on payment endpoints
- ✅ Add CSRF protection
- ✅ Log all transactions for audit trail

## Troubleshooting

### Payment Not Completing
- Check callback URL is correct
- Verify Paystack keys are valid
- Check browser console for errors
- Ensure backend is running and accessible

### Subscription Not Activating
- Check payment verification endpoint logs
- Verify transaction exists in database
- Check if reference is correct
- Look for errors in backend console

### Database Connection Issues
- Verify DATABASE_URL is correct
- Check PostgreSQL is running
- Ensure tables are created (run init_payment_tables)

## Support
For issues:
1. Check backend logs: `python app.py`
2. Check frontend console in browser DevTools
3. Review Paystack dashboard for transaction status
4. Contact support@liveedit.com

## Next Steps
- [ ] Add webhook handler for automatic updates
- [ ] Implement subscription cancellation
- [ ] Add invoice generation
- [ ] Create admin dashboard for subscription management
- [ ] Add analytics for conversion tracking
