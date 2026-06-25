# Gemini API Quota Error Fix

## Problem
When hitting the Gemini API free tier quota limit (error 429 - RESOURCE_EXHAUSTED), the video ingestion would fail immediately without retry.

## Solution
Implemented automatic retry logic with exponential backoff + better error messaging.

## Changes Made

### 1. Backend - `video_ingestion.py`

#### `analyze_video_with_gemini()` (Lines 224-310)
- Added retry loop with exponential backoff (2s → 4s → 8s)
- Detects quota errors by checking for "429", "RESOURCE_EXHAUSTED", or "quota" in error message
- Extracts retry delay from error message if available (adds 2s buffer)
- Returns graceful error response if all retries fail
- Max 3 retry attempts

```python
for attempt in range(max_retries):
    try:
        # ... API call ...
    except Exception as e:
        if "429" in error_str or "RESOURCE_EXHAUSTED" in error_str:
            if attempt < max_retries - 1:
                time.sleep(retry_delay)  # Wait before retry
                retry_delay *= 2  # Exponential backoff
```

#### `query_with_cache()` (Lines 205-232)
- Similar retry logic for cached queries
- Handles quota errors gracefully
- Same exponential backoff strategy

### 2. Backend - `app.py`

#### `/api/video-ingestion/upload` (Lines 1316-1383)
- Enhanced error handling to detect quota errors
- Returns HTTP 429 status code for quota errors
- Provides user-friendly error message directing to billing/upgrade

```python
if "429" in error_msg or "RESOURCE_EXHAUSTED" in error_msg:
    return jsonify({
        'error': 'Gemini API quota exceeded',
        'message': 'Free tier quota limit reached. Please upgrade...',
        'details': error_msg[:300]
    }), 429
```

### 3. Frontend - `videoIngestion.ts`

#### `uploadForIngestion()` (Lines 90-122)
- Detects HTTP 429 status code
- Provides user-friendly error message with action items
- Links to Google Cloud billing console

```typescript
if (response.status === 429 || err.error === "Gemini API quota exceeded") {
    throw new Error(
        `Gemini API quota exceeded. Free tier limit reached. ` +
        `Please upgrade to a paid plan at https://console.cloud.google.com/billing ` +
        `or try again after the daily quota resets.`
    );
}
```

## How to Use

### Option 1: Upgrade to Paid Plan (Recommended)
1. Go to [Google Cloud Console Billing](https://console.cloud.google.com/billing)
2. Enable billing on your project
3. Set up a payment method
4. Quotas increase significantly with paid plan

### Option 2: Wait for Daily Reset
- Free tier quotas reset daily at 00:00 UTC
- System will automatically retry with backoff
- Takes max 40+ seconds to exhaust retries

### Option 3: Use Lower-Cost Model
Edit `.env` and change:
```
GEMINI_VIDEO_MODEL=gemini-1.5-flash  # Lower token cost
```
Then restart the backend.

## Testing the Fix

1. Hit quota error (upload a video until you get 429)
2. Upload another video - it will retry automatically
3. You'll see console logs like:
   ```
   [RETRY] Quota limit hit. Retrying in 2.0s (attempt 1/3)...
   [RETRY] Quota limit hit. Retrying in 4.0s (attempt 2/3)...
   ```
4. After retries exhausted, UI shows friendly error message

## Error Flow

```
Video Upload
    ↓
[API Call] → 429 Error
    ↓
[Retry 1] Wait 2s → [API Call] → Still 429?
    ↓
[Retry 2] Wait 4s → [API Call] → Still 429?
    ↓
[Retry 3] Wait 8s → [API Call] → Still 429?
    ↓
User sees: "Quota exceeded. Upgrade to paid plan or try later."
```

## Key Improvements

✅ **Automatic Retries** - No manual intervention needed  
✅ **Exponential Backoff** - Respects API rate limits  
✅ **User-Friendly Errors** - Clear guidance on what to do  
✅ **HTTP 429 Status** - Proper HTTP semantics for quota errors  
✅ **Both Paths Covered** - Direct calls + cached queries handled  
