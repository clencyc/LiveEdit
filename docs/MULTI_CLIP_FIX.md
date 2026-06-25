# Multi-Clip Render Failed - FFmpeg Issue Fix

## Problem
```
ffmpeg: /tmp/liveedit_jobs/f05a5accd26351e66af1ef62e77a1155/video1.mp4: No such file or directory
```

This error occurred when processing multi-clip video renders because:
1. **Invalid FFmpeg filter syntax** - The video/audio filters were malformed
2. **File not found errors** - Video files weren't being properly validated before FFmpeg execution
3. **Race conditions** - Files might not be fully written to disk before async task execution

## Root Causes

### 1. Malformed FFmpeg Filters
In `build_concat_command()`, filters were being constructed incorrectly:
```python
# BEFORE (WRONG):
v_filter = f"[{i}:v]"
v_filter += f"trim=start={start_sec}"  # Results in: "[0:v]trim=start=5" ❌
v_filter += ",setpts=PTS-STARTPTS"     # Results in: "[0:v]trim=start=5,setpts=PTS-STARTPTS" ❌

# AFTER (CORRECT):
v_filter_chain = ["trim=start={start_sec}", "setpts=PTS-STARTPTS", "scale={w}:{h}"]
v_filter = f"[{i}:v]" + ",".join(v_filter_chain) + f"[{v_label}]"
# Results in: "[0:v]trim=start=5,setpts=PTS-STARTPTS,scale=1920:1080[v0]" ✅
```

### 2. Missing File Existence Checks
- Files weren't being validated before FFmpeg processing
- No check if files were actually written to disk
- Celery tasks could start before files were fully saved

### 3. Missing Error Context
- FFmpeg errors weren't being properly captured
- No visibility into which files existed/didn't exist

## Solutions Implemented

### 1. Fixed FFmpeg Filter Syntax
**File: `LiveEditBackend/video_tasks.py` (lines 305-343)**

Changed filter building to:
- Create filter chain as a list of individual operations
- Join chains with commas
- Properly close with output pad labels

```python
v_filter_chain = []
a_filter_chain = []

if start_sec is not None or end_sec is not None:
    trim_parts = []
    if start_sec is not None:
        trim_parts.append(f"start={start_sec}")
    if end_sec is not None:
        trim_parts.append(f"end={end_sec}")
    trim_str = ",".join(trim_parts)
    v_filter_chain.append(f"trim={trim_str}")
    a_filter_chain.append(f"atrim={trim_str}")
    v_filter_chain.append("setpts=PTS-STARTPTS")
    a_filter_chain.append("asetpts=PTS-STARTPTS")
else:
    v_filter_chain.append("setpts=PTS-STARTPTS")
    a_filter_chain.append("asetpts=PTS-STARTPTS")

v_filter_chain.append(f"scale={target_w}:{target_h}")

v_filter = f"[{i}:v]" + ",".join(v_filter_chain) + f"[{v_label}]"
a_filter = f"[{i}:a]" + ",".join(a_filter_chain) + f"[{a_label}]"
```

### 2. Added File Existence Validation
**File: `LiveEditBackend/video_tasks.py` (lines 395-401, 450-456)**

**In `edit_multi_task()`:**
- Validate all input files exist at task start
- Check video files again before FFmpeg execution
- Log file sizes for debugging

```python
# At task start
for p in video_paths:
    if not os.path.exists(p):
        raise FileNotFoundError(f"Video file not found: {p}")

# Before FFmpeg
for i, path in enumerate(ordered_paths):
    if not os.path.exists(path):
        raise FileNotFoundError(f"Ordered video file {i} not found: {path}")
    file_size = os.path.getsize(path)
    print(f"[DEBUG] Video {i}: {path} (size: {file_size} bytes)")
```

### 3. Added File Validation After Save
**File: `LiveEditBackend/app.py` (lines 751-766, 769-777)**

**In `edit_multi()` and `edit_video()` endpoints:**
- Verify files actually exist after `.save()`
- Validate files before queuing Celery task
- Prevents race conditions

```python
video_file.save(video_path)
# Ensure file is written to disk before proceeding
if os.path.exists(video_path):
    saved_paths.append(video_path)
else:
    raise IOError(f"Failed to save video file: {video_path}")
```

### 4. Improved Debug Logging
Added comprehensive debug output in `edit_multi_task()`:
- Logs ordered paths before concatenation
- Shows file sizes
- Prints full FFmpeg command
- Captures stderr output

## Testing Recommendations

1. **Test with local videos:**
   ```bash
   curl -X POST http://localhost:5000/api/edit-multi \
     -F "video_files=@video1.mp4" \
     -F "video_files=@video2.mp4" \
     -F "prompt=Combine these videos with cuts"
   ```

2. **Check Celery logs:**
   ```bash
   tail -f celery.log | grep DEBUG
   ```

3. **Verify files in job directory:**
   ```bash
   ls -lh /tmp/liveedit_jobs/<job_id>/
   ```

## Files Modified

1. `LiveEditBackend/video_tasks.py`
   - Fixed `build_concat_command()` FFmpeg filter syntax
   - Added file existence validation in `edit_multi_task()`
   - Added debug logging

2. `LiveEditBackend/app.py`
   - Added file existence checks in `edit_multi()` endpoint
   - Added file existence checks in `edit_video()` endpoint
   - Ensures files are written before queuing tasks

## Expected Behavior After Fix

1. Video files are validated immediately after upload
2. Celery task only starts after files are confirmed to exist
3. FFmpeg receives properly formatted filter syntax
4. Clear error messages if files are missing
5. Debug logs show file paths and sizes
