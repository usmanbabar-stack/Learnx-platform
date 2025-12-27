# 🔧 Chatbot Troubleshooting Guide

## ❌ Issue: "Sorry, I could not process your question right now"

This generic error can happen for several reasons. Here's how to diagnose and fix:

---

## 🔍 **Diagnosis Steps**

### **1. Check Backend Logs**
```bash
# Real-time log monitoring
tail -f logs/combined.log

# Filter for errors
grep "Error in /api/ask" logs/combined.log
grep "transcript" logs/combined.log
```

### **2. Test the Video**
```bash
# Check if transcript exists
curl http://localhost:3001/api/transcripts/YOUR_VIDEO_ID

# Manually trigger transcript fetch
curl -X POST http://localhost:3001/api/videos/YOUR_VIDEO_ID/preload
```

### **3. Verify Environment Variables**
```bash
# Check if Gemini API key is set
echo $GOOGLE_API_KEY  # Linux/Mac
$env:GOOGLE_API_KEY   # Windows PowerShell

# Test Gemini API key
curl -H "Content-Type: application/json" \
  -d '{"contents":[{"parts":[{"text":"test"}]}]}' \
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=YOUR_API_KEY"
```

---

## 🐛 **Common Issues & Fixes**

### **Issue 1: No Transcript Available**

**Symptoms:**
- Error message: "Transcript not available for this video"
- Logs show: `No transcript available for videoId: XXX`

**Causes:**
- Video doesn't have captions/subtitles
- Video is private, age-restricted, or deleted
- All 4 transcript methods failed

**Fix:**
```bash
# Test with a known-good video (has captions)
curl -X POST http://localhost:3001/api/ask \
  -H "Content-Type: application/json" \
  -d '{
    "videoId": "jNQXAC9IVRw",
    "question": "What is this video about?"
  }'

# If it works, the original video just doesn't have captions
# Recommend using videos with [CC] badge on YouTube
```

**User-Facing Fix:**
The chatbot now returns a helpful message instead of a generic error:
> "I apologize, but I couldn't find a transcript for this video. This could be because:
> • The video doesn't have captions/subtitles
> • The video is age-restricted or private
> • The transcript extraction failed
>
> Please try asking about a different video that has captions available."

---

### **Issue 2: Gemini API Key Missing or Invalid**

**Symptoms:**
- Logs show: `Missing Google Gemini API key`
- 401 Unauthorized from Gemini API

**Fix:**
```bash
# 1. Get API key from https://makersuite.google.com/app/apikey

# 2. Set in .env file
GOOGLE_API_KEY=AIzaSyDKZ-vd9yHP3MjGTSKnr93NIAV-DSnvp28

# 3. Restart server
npm run dev
```

---

### **Issue 3: Rate Limiting (429 Too Many Requests)**

**Symptoms:**
- Logs show: `429` or `Too Many Requests`
- Works initially, then fails after many requests

**Causes:**
- Gemini API free tier: 60 requests/minute
- yt-dlp rate limited by YouTube

**Fix:**
```bash
# 1. Enable caching (should already be enabled)
REDIS_URL=redis://localhost:6379

# 2. Reduce concurrent requests
# Frontend: Debounce user input
const debouncedAsk = useDeferredValue(userInput);

# 3. Upgrade to Gemini paid tier ($0.00035/1K chars)
```

---

### **Issue 4: Intent Classification Timeout**

**Symptoms:**
- Slow responses (>10s)
- Logs show: `Intent classification timeout`

**Fix:**
```bash
# Rules-based classification should handle 85%+ cases
# Check logs to see if LLM fallback is being hit too often
grep "Rules-based intent" logs/combined.log
grep "LLM intent classification" logs/combined.log

# If LLM is hit too often, improve rules
# Add more patterns to agenticRagService.ts
```

---

### **Issue 5: Network/Connection Issues**

**Symptoms:**
- Intermittent failures
- Logs show: `ECONNREFUSED`, `ETIMEDOUT`

**Fix:**
```bash
# 1. Check MongoDB connection
mongosh "mongodb://localhost:27017/learnx"

# 2. Check Redis connection
redis-cli ping

# 3. Check internet connection for YouTube/Gemini
curl -I https://www.youtube.com
curl -I https://generativelanguage.googleapis.com
```

---

## 🔧 **Enhanced Error Handling (Just Implemented)**

The chatbot now provides helpful error messages instead of generic "could not process":

### **No Transcript Error**
```json
{
  "success": true,
  "data": {
    "answer": "I apologize, but I couldn't find a transcript...",
    "outOfContext": true,
    "metadata": {
      "intentDetected": "no_transcript",
      "processingMode": "error_handling"
    }
  }
}
```

### **General Error**
```json
{
  "success": true,
  "data": {
    "answer": "I apologize, but I encountered an error...",
    "metadata": {
      "intentDetected": "error",
      "processingMode": "error_recovery",
      "error": "[dev only] actual error message"
    }
  }
}
```

---

## 🧪 **Testing Different Scenarios**

### **Test 1: Video with Transcript**
```bash
curl -X POST http://localhost:3001/api/ask \
  -H "Content-Type: application/json" \
  -d '{
    "videoId": "jNQXAC9IVRw",
    "question": "What is this video about?"
  }'

# Expected: Success with answer
```

### **Test 2: Video WITHOUT Transcript**
```bash
curl -X POST http://localhost:3001/api/ask \
  -H "Content-Type: application/json" \
  -d '{
    "videoId": "invalid123",
    "question": "What is this video about?"
  }'

# Expected: Helpful error message (not generic error)
```

### **Test 3: Summary Request**
```bash
curl -X POST http://localhost:3001/api/ask \
  -H "Content-Type: application/json" \
  -d '{
    "videoId": "jNQXAC9IVRw",
    "question": "Give me a summary"
  }'

# Expected: Structured summary with key points
```

### **Test 4: Out-of-Context Question**
```bash
curl -X POST http://localhost:3001/api/ask \
  -H "Content-Type: application/json" \
  -d '{
    "videoId": "jNQXAC9IVRw",
    "question": "How do I cook pasta?"
  }'

# Expected: Brief answer + redirect to video topic
```

---

## 📊 **Debug Mode**

### **Enable Verbose Logging**
```bash
# .env file
LOG_LEVEL=debug
NODE_ENV=development

# Restart server
npm run dev

# Watch logs
tail -f logs/combined.log
```

### **Check Metrics**
```typescript
// Logs include these metrics for each request:
{
  videoId: 'XXX',
  intentDetected: 'specific_concept',
  processingMode: 'rag_retrieval',
  transcriptSource: 'youtube-transcript',
  transcriptConfidence: 'high',
  processingTime: 1234,
  cached: true
}
```

---

## 🚨 **Emergency Fixes**

### **If Everything is Broken**
```bash
# 1. Restart everything
docker-compose down
docker-compose up -d

# 2. Clear Redis cache
redis-cli FLUSHALL

# 3. Check MongoDB indexes
mongo learnx --eval "db.videos.getIndexes()"

# 4. Re-sync indexes
curl http://localhost:3001/api/health
```

### **If Specific Video Fails**
```bash
# Delete cached transcript
redis-cli DEL "transcript:quality:VIDEO_ID"

# Delete from MongoDB
mongo learnx --eval 'db.videos.deleteOne({videoId: "VIDEO_ID"})'

# Re-fetch
curl -X POST http://localhost:3001/api/videos/VIDEO_ID/preload
```

---

## 📝 **Logging Best Practices**

### **What to Log**
```typescript
// Good logs
logger.info('Processing question', { videoId, question: question.slice(0, 50) });
logger.info('Intent detected', { intent, confidence, requiresRetrieval });
logger.info('Transcript loaded', { wordCount, source, confidence });
logger.info('Answer generated', { processingTime, cached });

// Don't log
// ❌ Full transcript (too large)
// ❌ Full API responses (sensitive)
// ❌ User PII (if you add auth later)
```

### **Monitor These Metrics**
- Intent classification accuracy (should be 85%+)
- Transcript source distribution (youtube-transcript should be 70%+)
- Cache hit rate (should be 60%+ after warmup)
- Response times (should be <2s)
- Error rate (should be <5%)

---

## 🔗 **Useful Commands**

```bash
# Check server health
curl http://localhost:3001/api/health

# Test specific video
curl http://localhost:3001/api/videos/VIDEO_ID

# Get transcript
curl http://localhost:3001/api/transcripts/VIDEO_ID

# Test preload
curl -X POST http://localhost:3001/api/videos/VIDEO_ID/preload

# Check Redis
redis-cli KEYS "transcript:*" | wc -l
redis-cli KEYS "ask:*" | wc -l

# Check MongoDB
mongo learnx --eval "db.videos.countDocuments()"
mongo learnx --eval "db.videos.findOne({}, {transcript: 0})"
```

---

## 📞 **Getting Help**

If you're still stuck:

1. **Check logs first**: `tail -f logs/combined.log`
2. **Test with known-good video**: Use a popular educational video with captions
3. **Verify environment**: All keys set, services running
4. **Check GitHub Issues**: Similar problems might be documented
5. **Enable debug mode**: `LOG_LEVEL=debug`

---

**Remember:** The enhanced error handling now provides helpful messages to users instead of generic errors! 🎉

