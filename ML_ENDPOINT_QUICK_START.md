# ML Endpoint Quick Start - 5 Minutes to Deployment

## ⚠️ Important: Local Testing Requires Two Servers

To test the ML endpoint locally with Sketchify, you need **both**:
- **Web Server (port 8000):** `python -m http.server 8000`
- **ML Service (port 5001):** `python ml_endpoint.py` (this module)

See [README.md](README.md#local-development-setup-recommended-for-testing) for complete local setup instructions.

## 📋 Files Created

```
your-repo/
├── ml_endpoint.py              ← Flask app (main service)
├── requirements.txt            ← Python dependencies (updated)
├── Procfile                    ← Railway deployment config
├── .env.example                ← Environment template
├── test_ml_endpoint.py         ← Testing script
└── ML_ENDPOINT_DEPLOYMENT_GUIDE.md ← Full documentation
```

---

## 🚀 5-Step Deployment

### Step 1: Get OpenAI API Key (2 minutes)
```
1. Go to https://platform.openai.com/api-keys
2. Click "Create new secret key"
3. Copy it (keep it secret!)
4. Save it somewhere safe
```

### Step 2: Test Locally (Optional, 3 minutes)
```bash
# Create .env file
copy .env.example .env

# Edit .env and paste your API key:
# OPENAI_API_KEY=sk-your-actual-key

# Install dependencies
pip install -r requirements.txt

# Run server
python ml_endpoint.py

# In another terminal, test it
python test_ml_endpoint.py http://localhost:5001
```

### Step 3: Push to GitHub (2 minutes)
```bash
git add ml_endpoint.py requirements.txt Procfile .env.example
git commit -m "Add ML endpoint for sketch generation"
git push origin main
```

### Step 4: Deploy on Railway (5 minutes)
```
1. Go to https://railway.app/dashboard
2. Click "New Project" → "Deploy from GitHub"
3. Select your repository
4. Railway auto-detects Python
5. Once deployed, go to Settings → Variables
6. Add: OPENAI_API_KEY = sk-your-actual-key
7. Copy the "Public URL" from preview
```

### Step 5: Update Sketchify (1 minute)
```javascript
// In script.js or index.html, change:
const mlUrl = "https://your-railway-app.railway.app/api/sketch";
```

Or use Sketchify UI:
1. Check "Use external ML service (default)"
2. Paste Railway URL in "ML Service URL" field

---

## ✅ Verify It Works

```bash
# Test your deployed endpoint
python test_ml_endpoint.py https://your-railway-app.railway.app
```

Expected output:
```
🔍 Testing Health Check...
✅ Health check passed

🎨 Testing Styles Endpoint...
✅ Styles endpoint passed

🎨 Testing Sketch Generation...
⏱️  Request timed out (DALL-E generation takes 20-30 seconds)
   Try again - this is normal for first request
```

---

## 🎯 Your Endpoints

Once deployed, you have:

```
Health Check:
  GET https://your-app.railway.app/health

Generate Sketch:
  POST https://your-app.railway.app/api/sketch
  Body: { image: "base64_string", style: "realistic-pencil" }

List Styles:
  GET https://your-app.railway.app/api/styles
```

---

## 🛠️ Troubleshooting

| Problem | Solution |
|---------|----------|
| "OPENAI_API_KEY not found" | Add it to Railway Variables tab |
| Request times out | This is normal - DALL-E takes 20-30 seconds |
| Endpoint returns 500 error | Check Railway Logs tab for details |
| "Invalid image format" | Make sure image is base64 encoded |

---

## 💰 Costs

**OpenAI Usage (per sketch):**
- Image analysis (GPT-4V): ~$0.01
- Sketch generation (DALL-E 3): ~$0.08
- **Total: ~$0.09 per sketch**

**Railway:**
- Free tier: $5/month credit (50-60+ sketches)
- After credit: ~$5-7/month

**Estimate:** Free tier covers testing; production ~$14-16/month

---

## 📚 More Information

- **Full Guide:** See `ML_ENDPOINT_DEPLOYMENT_GUIDE.md`
- **Testing:** Run `python test_ml_endpoint.py`
- **Railway Docs:** https://docs.railway.app
- **OpenAI Docs:** https://platform.openai.com/docs

---

## 🎬 Next Steps

1. ✅ Get OpenAI API key
2. ✅ Deploy on Railway (5 minutes)
3. ✅ Update Sketchify URL
4. ✅ Generate first sketch
5. 🎉 Launch!

**Questions?** Check `ML_ENDPOINT_DEPLOYMENT_GUIDE.md` for detailed instructions.

---

**Status:** Ready to Deploy 🚀  
**Created:** February 21, 2026
