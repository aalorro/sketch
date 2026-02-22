# Sketchify ML Endpoint - Railway Deployment Guide

## Overview
This guide explains how to deploy the OpenAI-powered ML endpoint for Sketchify on Railway's free tier.

**What You'll Get:**
- AI-powered sketch generation using DALL-E 3
- Image analysis using GPT-4 Vision
- 24/7 uptime with auto-scaling
- Free tier: $5/month credit (usually enough for testing)

---

## Prerequisites

1. **OpenAI Account** with API key
   - Sign up: https://platform.openai.com
   - Create API key: https://platform.openai.com/api-keys
   - Add billing method (pay-as-you-go)

2. **Railway Account**
   - Sign up: https://railway.app
   - Connect GitHub (optional, for auto-deployment)

3. **GitHub Repository**
   - Push your Sketchify code to GitHub
   - Required files: `ml_endpoint.py`, `requirements.txt`, `Procfile`

---

## Step 1: Test Locally (Optional)

### Setup Local Environment

```bash
# Navigate to your project
cd c:\Users\arman\OneDrive\repos\sketch

# Create .env file with your API key
copy .env.example .env
# Edit .env and add your OPENAI_API_KEY

# Activate virtual environment
.venv\Scripts\Activate.ps1

# Install dependencies
pip install -r requirements.txt

# Run the server
python ml_endpoint.py
```

### Test the Endpoint

```bash
# In another terminal, test the health check
curl http://localhost:5001/health

# Get available styles
curl http://localhost:5001/api/styles

# Quick test (requires an image)
# See test_ml_endpoint.py for full example
```

---

## Step 2: Push to GitHub

Make sure these files are in your repository:

```
sketch/
├── ml_endpoint.py          ← Main Flask app
├── requirements.txt        ← Python dependencies
├── Procfile               ← Railway deployment config
├── .env.example           ← Environment template (don't commit .env!)
├── .gitignore             ← Should include .env
└── index.html
```

**Update .gitignore:**
```
.env
.venv/
__pycache__/
*.pyc
```

**Push to GitHub:**
```bash
git add .
git commit -m "Add ML endpoint for OpenAI integration"
git push origin main
```

---

## Step 3: Deploy on Railway

### Option A: Deploy from Railway Dashboard (Easiest)

1. **Go to Railway:** https://railway.app/dashboard

2. **Click "New Project" → "Deploy from GitHub"**

3. **Select your repository** (sketch)

4. **Wait for Railway to detect** `Procfile`
   - Should auto-detect Python and Flask
   - If not, manually select "Python" from template

5. **Add Environment Variables:**
   - Click "Variables" tab
   - Add new variable:
     - Key: `OPENAI_API_KEY`
     - Value: `sk-your-actual-api-key`

6. **Deploy** - Click "Deploy" button
   - Railway builds and starts your app
   - Takes 2-3 minutes first time

7. **Get Your URL:**
   - Go to "Settings" tab
   - Copy "Public URL" (something like `https://your-app-123abc.railway.app`)
   - This is your `ML_SERVICE_URL`

### Option B: Deploy from CLI

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login to Railway
railway login

# Initialize project in your directory
cd c:\Users\arman\OneDrive\repos\sketch
railway init

# Connect to your GitHub repo
# (Follow prompts)

# Set environment variable
railway variables set OPENAI_API_KEY=sk-your-actual-key

# Deploy
railway up
```

---

## Step 4: Configure Sketchify

In your `index.html`, update the ML Service URL:

```html
<label>ML Service URL <input id="mlUrl" type="text" 
  value="https://your-app-123abc.railway.app/api/sketch" 
  placeholder="https://your-custom-ml-service.com/api"></label>
```

Or in `script.js`, add:

```javascript
// Replace with your deployed URL
const mlUrl = "https://your-app-123abc.railway.app/api/sketch";
```

In Sketchify UI:
1. Check "Use external ML service (default)" ✓
2. Enter your Railway URL in "ML Service URL" field
3. Test by generating a sketch

---

## Testing Your Endpoint

### Health Check
```bash
curl https://your-app-123abc.railway.app/health
```

Expected response:
```json
{
  "status": "ok",
  "service": "Sketchify ML Endpoint",
  "version": "1.0.0"
}
```

### Get Available Styles
```bash
curl https://your-app-123abc.railway.app/api/styles
```

### Generate Sketch
See `test_ml_endpoint.py` for a complete example with image upload.

---

## Monitoring & Troubleshooting

### View Logs on Railway

1. Go to your project on Railway dashboard
2. Click "Deployments" tab
3. Select latest deployment
4. Click "View Logs"

### Common Issues

**"OPENAI_API_KEY not found"**
- Go to Railway Settings → Variables
- Verify OPENAI_API_KEY is set correctly
- Redeploy after adding variable

**Endpoint returns 500 Error**
- Check Railway logs for error details
- Verify OpenAI API key is valid
- Check you have API credits remaining

**Slow response times**
- DALL-E 3 generation takes 20-30 seconds
- This is normal (not a Railway issue)
- GPT-4 Vision takes 5-10 seconds
- Update Sketchify UI to show progress

**Rate limits exceeded**
- OpenAI has usage limits based on plan
- Check https://platform.openai.com/account/rate-limits
- Consider implementing request queuing

---

## Costs Breakdown

### OpenAI API Costs (Approximate)

Per sketch generation:
- **GPT-4 Vision analysis:** ~$0.01 (analyze image)
- **DALL-E 3 generation:** ~$0.08 USD per image (1024×1024)
- **Total per sketch:** ~$0.09 USD

**Monthly estimate (100 sketches/month):**
- ~$9 USD in API costs
- Free tier covers: up to 50-60 sketches

**Railway costs:**
- Free tier: $5/month credit (usually covers small ML endpoint)
- After credit: ~$5-7/month depending on usage

**Total monthly:** ~$14-16 USD for moderate usage (100-200 sketches)

### Cost Optimization Tips

1. **Use cheaper models for analysis** (GPT-3.5 instead of GPT-4)
2. **Implement caching** to avoid regenerating same images
3. **Offer different resolution tiers** (512px, 1024px)
4. **Batch process** when possible
5. **Set daily usage limits** to control costs

---

## Advanced Configuration

### Custom Port
Add to Railway Variables:
```
PORT=5001
```

### Flask Environment
```
FLASK_ENV=production  (or development)
```

### Add Logging
```python
import logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
```

### Enable CORS for Specific Domain
```python
CORS(app, resources={
    r"/api/*": {
        "origins": ["https://yourdomain.com"],
        "methods": ["POST"],
        "allow_headers": ["Content-Type"]
    }
})
```

---

## Next Steps

1. ✅ Create `.env` file locally with your OpenAI API key
2. ✅ Test `ml_endpoint.py` locally: `python ml_endpoint.py`
3. ✅ Push code to GitHub
4. ✅ Deploy on Railway (connect GitHub repo)
5. ✅ Add OPENAI_API_KEY to Railway variables
6. ✅ Get public URL from Railway
7. ✅ Update Sketchify to point to your endpoint
8. ✅ Generate test sketch
9. ✅ Monitor costs on OpenAI dashboard

---

## Support & Resources

- **Railway Docs:** https://docs.railway.app
- **OpenAI Docs:** https://platform.openai.com/docs
- **Flask Documentation:** https://flask.palletsprojects.com
- **Troubleshooting:** Check Railway logs first, then OpenAI console

---

**Created:** February 21, 2026  
**Version:** 1.0  
**Status:** Ready to Deploy ✅
