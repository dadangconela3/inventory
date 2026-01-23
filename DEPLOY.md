# Inventory Management System - Vercel Deployment Guide

## Prerequisites
- GitHub account
- Vercel account (sign up with GitHub at vercel.com)
- Supabase project already configured

## Step 1: Prepare Repository

Push your code to GitHub:
```bash
cd d:\applications\inventory\src
git init
git add .
git commit -m "Initial commit - Inventory Management System"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/inventory-system.git
git push -u origin main
```

## Step 2: Deploy to Vercel

1. Go to [vercel.com](https://vercel.com) and sign in with GitHub
2. Click "Add New Project"
3. Import your `inventory-system` repository
4. Configure:
   - **Framework Preset**: Next.js (auto-detected)
   - **Root Directory**: `./` (or `src` if your package.json is there)
   - **Build Command**: `npm run build`
   - **Output Directory**: `.next`

## Step 3: Environment Variables

Add these in Vercel Dashboard → Project Settings → Environment Variables:

| Variable | Value |
|----------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://xxxx.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `eyJhbGciOiJIUzI1NiIs...` |

## Step 4: Supabase Configuration

Add your Vercel domain to Supabase:
1. Supabase Dashboard → Authentication → URL Configuration
2. Add Site URL: `https://your-app.vercel.app`
3. Add Redirect URLs: `https://your-app.vercel.app/**`

## Done!
Your app will be live at: `https://your-app.vercel.app`
