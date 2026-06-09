# Google Cloud Deployment Guide

## Prerequisites

1. **Google Cloud Project**: `rare-decker-488711-c0` (already set up)
2. **gcloud CLI**: Install from https://cloud.google.com/sdk/docs/install
3. **Node.js + npm**: Required for frontend build
4. **Firebase CLI**: `npm install -g firebase-tools`
5. **Billing enabled**: On your GCP project
6. **Service Account**: With Cloud Run Admin & Storage permissions

## Quick Start

### Option A: Automated Deployment (Recommended)

```bash
cd /home/clencyc/LiveEditProject
chmod +x deploy.sh
./deploy.sh
```

This script will:
- Authenticate with Google Cloud
- Build and push backend to Cloud Run
- Build frontend with Vite
- Deploy frontend to Firebase Hosting
- Configure CORS and environment variables

### Option B: Manual Deployment

#### Backend (Cloud Run)

```bash
cd LiveEditBackend

# Deploy to Cloud Run
gcloud run deploy liveedit-backend \
  --source . \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --memory 2Gi \
  --cpu 2 \
  --timeout 120 \
  --set-env-vars="FLASK_ENV=production,USE_VERTEX_AI=true,VERTEX_PROJECT_ID=rare-decker-488711-c0,VERTEX_LOCATION=us-central1,GCS_BUCKET_NAME=liveedit,GCS_PROJECT_ID=rare-decker-488711-c0,GEMINI_TEXT_MODEL=gemini-2.0-flash,GEMINI_VIDEO_MODEL=gemini-2.0-flash"

# Get the backend URL
BACKEND_URL=$(gcloud run services describe liveedit-backend --region us-central1 --format='value(status.url)')
echo "Backend URL: $BACKEND_URL"
```

#### Frontend (Firebase Hosting)

```bash
cd LiveEditFronten

# Install dependencies
npm ci

# Build with backend URL
VITE_BACKEND_URL=$BACKEND_URL npm run build

# Deploy to Firebase
npx firebase deploy --only hosting
```

## Environment Variables

### Backend (Cloud Run)

Set these in the Cloud Run service:

```
FLASK_ENV=production
USE_VERTEX_AI=true
VERTEX_PROJECT_ID=rare-decker-488711-c0
VERTEX_LOCATION=us-central1
GCS_BUCKET_NAME=liveedit
GCS_PROJECT_ID=rare-decker-488711-c0
GEMINI_TEXT_MODEL=gemini-2.0-flash
GEMINI_VIDEO_MODEL=gemini-2.0-flash
DATABASE_URL=<your-neon-postgres-url>
REDIS_URL=<your-upstash-redis-url>
PAYSTACK_SECRET_KEY=<your-key>
PAYSTACK_PUBLIC_KEY=<your-key>
```

### Frontend (Firebase)

Set in `LiveEditFronten/.env.production`:

```
VITE_BACKEND_URL=https://liveedit-backend-xxxxx.a.run.app
VITE_API_URL=https://liveedit-backend-xxxxx.a.run.app
```

## Verification

1. **Check backend logs**:
   ```bash
   gcloud run logs read liveedit-backend --region us-central1 --tail=50
   ```

2. **Test backend API**:
   ```bash
   curl https://liveedit-backend-xxxxx.a.run.app/health
   ```

3. **Check frontend deployment**:
   ```bash
   firebase open hosting:site
   ```

## Troubleshooting

### Backend deployment fails with "quota exhausted"
- This shouldn't happen with Vertex AI — you're using GCP credits, not free-tier
- Check PROJECT_ID and VERTEX_PROJECT_ID match your billed project

### Frontend shows 403 on video uploads
- Ensure Cloud Run service account has GCS Storage Object Admin on `gs://liveedit`
- Run: `gcloud storage buckets add-iam-policy-binding gs://liveedit --member="serviceAccount:default@rare-decker-488711-c0.iam.gserviceaccount.com" --role="roles/storage.admin"`

### CORS errors
- Check that `FRONTEND_URL` environment variable is set correctly on the backend
- Update `app.py` CORS origins if needed

### Celery/Redis not working
- Use Cloud Tasks instead of Celery for async jobs (simpler for serverless)
- Or use Cloud Run with persistent Redis instance

## Cost Optimization

1. **Backend (Cloud Run)**:
   - Always-on vs. auto-scaling: auto-scaling is cheaper
   - Set min instances to 0 for zero cost when idle
   - Set max instances based on expected load

2. **Frontend (Firebase Hosting)**:
   - Free tier includes 10 GB storage + 360 MB/day bandwidth
   - Paid plan is $1/GB storage + $0.15/GB bandwidth

3. **Vertex AI**:
   - Pay-as-you-go: ~$0.075 per 1M tokens
   - Much cheaper than Gemini Developer API

4. **GCS**:
   - Standard storage: $0.023/GB/month
   - Use lifecycle policies to auto-delete old videos

## Production Checklist

- [ ] Environment variables set on Cloud Run
- [ ] Database credentials are secure (use Secret Manager)
- [ ] GCS bucket permissions configured
- [ ] CORS origins whitelisted
- [ ] SSL/TLS enabled (automatic with Cloud Run)
- [ ] Monitoring and logging configured
- [ ] Error tracking enabled (Cloud Logging)
- [ ] Rate limiting configured
- [ ] Backup strategy for database

## Rollback

To revert to previous version:

```bash
gcloud run services update-traffic liveedit-backend --region us-central1 --to-revisions PREVIOUS_REVISION=100
```

## Documentation

- [Cloud Run Documentation](https://cloud.google.com/run/docs)
- [Firebase Hosting Documentation](https://firebase.google.com/docs/hosting)
- [Vertex AI Documentation](https://cloud.google.com/vertex-ai/docs)
