# LeaseSight – Local Setup & Deployment Guide

This guide provides step-by-step instructions for setting up LeaseSight locally and deploying to production.

---

## 🛠️ Prerequisites

- **Node.js 18+** & **npm** (Required for the Next.js frontend)
- **Python 3.11.x** (Optional, only needed if running the custom Python FastAPI backend)
- **Git**

---

## Step 1 – Next.js Frontend Setup (Primary App)

The primary application is located inside `leasesight-ui/`.

```bash
# 1. Navigate to the frontend directory
cd leasesight-ui

# 2. Install Node.js dependencies
npm install

# 3. Create environment file .env.local
cp .env.production.example .env.local  # or create .env.local
```

Configure your `.env.local`:
```ini
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
```

Run the development server:
```bash
npm run dev
```

Open `http://localhost:3000` in your browser.

---

## Step 2 – (Optional) Python Backend Setup

If you wish to run the FastAPI backend server for server-side OCR and vector database indexing:

```bash
# 1. Create virtual environment
python -m venv venv

# 2. Activate virtual environment
# Windows (PowerShell):
venv\Scripts\Activate.ps1
# macOS / Linux:
# source venv/bin/activate

# 3. Install Python dependencies
pip install -r requirements.txt

# 4. Configure .env file in root directory
# Add GROQ_API_KEY, PINECONE_API_KEY

# 5. Start FastAPI server
uvicorn api.main:app --host 0.0.0.0 --port 8080 --reload
```

---

## Step 3 – Production Build & Deployment

To verify and deploy the Next.js production build to Vercel:

```bash
cd leasesight-ui

# Verify static build
npm run build

# Deploy to Vercel Production
npx vercel --prod
```

- **Live Site**: [https://www.leasesights.tech](https://www.leasesights.tech)
