#!/bin/bash
set -e

PROJECT_ID="rare-decker-488711-c0"
REGION="us-central1"
SERVICE_NAME="liveedit-backend"
BACKEND_DIR="./LiveEditBackend"
FRONTEND_DIR="./LiveEditFronten"

echo "🚀 LiveEdit Deployment Script"
echo "=========================================="
echo "Project ID: $PROJECT_ID"
echo "Region: $REGION"
echo ""

# ─────────────────────────────────────────────────────────────────
# STEP 1: Authenticate with Google Cloud
# ─────────────────────────────────────────────────────────────────
echo "Step 1: Authenticating with Google Cloud..."
gcloud auth login
gcloud config set project $PROJECT_ID
echo "✓ Authentication complete"
echo ""

# ─────────────────────────────────────────────────────────────────
# STEP 2: Enable required APIs
# ─────────────────────────────────────────────────────────────────
echo "Step 2: Enabling required Google Cloud APIs..."
gcloud services enable \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  firebasehosting.googleapis.com \
  firebase.googleapis.com
echo "✓ APIs enabled"
echo ""

# ─────────────────────────────────────────────────────────────────
# STEP 3: Build and push backend to Cloud Run
# ─────────────────────────────────────────────────────────────────
echo "Step 3: Building and deploying backend to Cloud Run..."
cd "$BACKEND_DIR"

gcloud run deploy $SERVICE_NAME \
  --source . \
  --platform managed \
  --region $REGION \
  --allow-unauthenticated \
  --memory 2Gi \
  --cpu 2 \
  --timeout 120 \
  --set-env-vars="FLASK_ENV=production" \
  --set-env-vars="USE_VERTEX_AI=true" \
  --set-env-vars="VERTEX_PROJECT_ID=$PROJECT_ID" \
  --set-env-vars="VERTEX_LOCATION=$REGION" \
  --service-account="default@$PROJECT_ID.iam.gserviceaccount.com"

BACKEND_URL=$(gcloud run services describe $SERVICE_NAME --region $REGION --format='value(status.url)')
echo "✓ Backend deployed: $BACKEND_URL"
echo ""

cd - > /dev/null

# ─────────────────────────────────────────────────────────────────
# STEP 4: Build frontend
# ─────────────────────────────────────────────────────────────────
echo "Step 4: Building frontend..."
cd "$FRONTEND_DIR"

npm ci
VITE_BACKEND_URL=$BACKEND_URL npm run build

echo "✓ Frontend built to dist/"
cd - > /dev/null
echo ""

# ─────────────────────────────────────────────────────────────────
# STEP 5: Deploy frontend to Firebase Hosting
# ─────────────────────────────────────────────────────────────────
echo "Step 5: Deploying frontend to Firebase Hosting..."
cd "$FRONTEND_DIR"

npx firebase deploy --only hosting

FRONTEND_URL="https://$PROJECT_ID.web.app"
echo "✓ Frontend deployed: $FRONTEND_URL"
cd - > /dev/null
echo ""

# ─────────────────────────────────────────────────────────────────
# STEP 6: Update backend CORS
# ─────────────────────────────────────────────────────────────────
echo "Step 6: Updating backend with frontend URL..."
gcloud run services update $SERVICE_NAME \
  --region $REGION \
  --update-env-vars="FRONTEND_URL=$FRONTEND_URL"

echo "✓ Backend updated with frontend URL"
echo ""

# ─────────────────────────────────────────────────────────────────
# DEPLOYMENT COMPLETE
# ─────────────────────────────────────────────────────────────────
echo "=========================================="
echo "✅ Deployment Complete!"
echo ""
echo "Frontend: $FRONTEND_URL"
echo "Backend:  $BACKEND_URL"
echo ""
echo "Next Steps:"
echo "1. Update .env files with production values if needed"
echo "2. Test the application at: $FRONTEND_URL"
echo "3. Monitor logs: gcloud run logs read $SERVICE_NAME --region $REGION"
echo ""
