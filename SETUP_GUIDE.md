# 🚀 Quick Setup Guide - Gmail OAuth

## Fix the "Google Client ID is not configured" Error

### Step 1: Create `.env.local` File

Create a file named `.env.local` in your project root directory (same folder as `package.json`).

**On Windows (PowerShell):**
```powershell
New-Item -Path .env.local -ItemType File
```

**On Mac/Linux:**
```bash
touch .env.local
```

### Step 2: Get Your Google Client ID

#### Option A: Quick Setup (5 minutes)

1. **Go to Google Cloud Console:**
   - Visit: https://console.cloud.google.com/
   - Sign in with your Google account

2. **Create or Select Project:**
   - Click the project dropdown at the top
   - Click "New Project" or select an existing one
   - Give it a name (e.g., "Gmail Extractor")
   - Click "Create"

3. **Enable Gmail API:**
   - In the search bar, type "Gmail API"
   - Click on "Gmail API" from results
   - Click the blue "Enable" button

4. **Create OAuth Credentials:**
   - Go to: https://console.cloud.google.com/apis/credentials
   - Click "Create Credentials" → "OAuth client ID"
   - If prompted, configure OAuth consent screen:
     - User Type: "External" (unless you have Google Workspace)
     - App name: "Gmail Data Extractor"
     - User support email: Your email
     - Developer contact: Your email
     - Click "Save and Continue" through the steps
   - Back to Credentials:
     - Application type: "Web application"
     - Name: "Gmail Extractor Web Client"
     - Authorized JavaScript origins: 
       - Add: `http://localhost:3000`
     - Authorized redirect URIs: (leave empty for now)
     - Click "Create"
   - **Copy the Client ID** (it looks like: `123456789-abcdefg.apps.googleusercontent.com`)

### Step 3: Add Client ID to `.env.local`

Open `.env.local` file and add:

```env
NEXT_PUBLIC_GOOGLE_CLIENT_ID=your-client-id-here.apps.googleusercontent.com
```

**Replace `your-client-id-here.apps.googleusercontent.com` with the Client ID you copied.**

Example:
```env
NEXT_PUBLIC_GOOGLE_CLIENT_ID=123456789-abcdefghijklmnop.apps.googleusercontent.com
```

### Step 4: Restart Your Development Server

1. **Stop the current server** (Press `Ctrl + C` in terminal)
2. **Start it again:**
   ```bash
   npm run dev
   ```

### Step 5: Test

1. Open http://localhost:3000
2. Enter your email
3. Click "Connect Gmail & Extract Data"
4. You should see the Google OAuth popup! 🎉

---

## ❌ Still Getting Errors?

### Check These:

1. **File Location:**
   - `.env.local` must be in the root directory (same folder as `package.json`)
   - Not in `app/` or any subfolder

2. **File Name:**
   - Must be exactly `.env.local` (with the dot at the start)
   - Not `env.local` or `.env`

3. **Variable Name:**
   - Must be exactly: `NEXT_PUBLIC_GOOGLE_CLIENT_ID`
   - Case-sensitive, no spaces

4. **Server Restart:**
   - You MUST restart `npm run dev` after creating/modifying `.env.local`
   - Next.js only reads env files on startup

5. **Client ID Format:**
   - Should look like: `xxxxx-xxxxx.apps.googleusercontent.com`
   - No quotes needed in `.env.local`

---

## 📸 Visual Guide

Your project structure should look like this:

```
email-extract-data/
├── .env.local          ← Create this file here
├── app/
│   ├── page.tsx
│   └── layout.tsx
├── package.json
└── README.md
```

Your `.env.local` file should contain:

```
NEXT_PUBLIC_GOOGLE_CLIENT_ID=123456789-abcdefg.apps.googleusercontent.com
```

---

## 🆘 Need Help?

If you're still stuck:
1. Check the browser console for detailed error messages
2. Verify your Client ID is correct in Google Cloud Console
3. Make sure Gmail API is enabled in your Google Cloud project
4. Ensure `http://localhost:3000` is added to Authorized JavaScript origins

