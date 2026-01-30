# Gemini API 503 Error - Retry Logic Fix

## Problem
The multi-clip render was failing immediately when Gemini API returned a 503 UNAVAILABLE error:
```
Multi-clip render failed: 503 UNAVAILABLE. The model is overloaded. Please try again later.
```

This is a **transient service issue** - the API is temporarily overloaded but will recover in seconds. Without retry logic, the entire job fails immediately.

## Solution
Implemented **exponential backoff retry logic** to automatically retry transient API errors.

## How It Works

### Retry Function: `call_gemini_with_retry()`
- **Location**: `LiveEditBackend/video_tasks.py` (lines 29-63)
- **Retries**: Up to 3 times (configurable)
- **Backoff**: Exponential (2s → 4s → 8s between retries)
- **Detects**: 503, 429, UNAVAILABLE, overloaded, timeout errors

### Retry Strategy
```
Attempt 1: Fails with 503
  Wait 2 seconds
Attempt 2: Fails with 503
  Wait 4 seconds
Attempt 3: Fails with 503
  Wait 8 seconds
Attempt 4: Succeeds ✓
```

### Example Log Output
```
[RETRY] Gemini API call failed (attempt 1/3): 503 UNAVAILABLE. The model is overloaded.
[RETRY] Waiting 2s before retry...
[RETRY] Gemini API call failed (attempt 2/3): 503 UNAVAILABLE. The model is overloaded.
[RETRY] Waiting 4s before retry...
Processing continues... ✓
```

## Files Modified

### `LiveEditBackend/video_tasks.py`
1. **Added import**: `import time` (line 5)
2. **Added function**: `call_gemini_with_retry()` (lines 29-63)
3. **Updated**: `analyze_video_task()` to use retry logic (lines 185-209)
4. **Updated**: `edit_multi_task()` to use retry logic (lines 461-465)

## Configuration

### Default Settings
- **Max retries**: 3 attempts
- **Initial wait**: 2 seconds
- **Backoff multiplier**: 2x exponential

### To Change Settings
```python
# Use different retry count
response = call_gemini_with_retry(
    contents=prompt,
    model="gemini-3-flash-preview",
    max_retries=5  # Try up to 5 times instead of 3
)

# Use different initial wait time
response = call_gemini_with_retry(
    contents=prompt,
    model="gemini-3-flash-preview",
    max_retries=3,
    initial_wait=5  # Wait 5, 10, 20 seconds instead of 2, 4, 8
)
```

## Error Types Handled

### Retryable (Will Retry)
- 503 UNAVAILABLE - API overloaded
- 429 TOO_MANY_REQUESTS - Rate limited
- Timeout errors - Network issues
- "overloaded" - API busy

### Non-Retryable (Fails Immediately)
- 401 UNAUTHORIZED - Invalid API key
- 404 NOT_FOUND - Invalid model
- 400 BAD_REQUEST - Invalid request format
- Authentication errors

## Testing

### To Test Retry Logic
1. **Simulate API overload** - Call the endpoint multiple times rapidly
2. **Check logs** - Look for `[RETRY]` messages in backend logs
3. **Verify success** - Job should eventually complete even after initial failures

### Example Test
```bash
# Upload 3 videos for multi-clip render
curl -X POST http://localhost:5000/api/edit-multi \
  -F "video_files=@clip1.mp4" \
  -F "video_files=@clip2.mp4" \
  -F "video_files=@clip3.mp4" \
  -F "prompt=Combine these clips in order"

# Check job status
curl http://localhost:5000/api/job-status/<job_id>
```

## Benefits

1. **Resilient to API outages** - Automatically handles temporary issues
2. **Better UX** - Jobs don't fail instantly during API hiccups
3. **Exponential backoff** - Respects API rate limiting by waiting longer
4. **Transparent logging** - Clear visibility into retry attempts
5. **Configurable** - Can adjust retry count and wait times

## Future Improvements

Consider adding:
- Metrics tracking (retry success rate, avg wait time)
- Notify user of retries in progress
- Different retry strategies for different error types
- Persistent job queue for retries across service restarts
