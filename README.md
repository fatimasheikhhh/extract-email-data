This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## 🚀 Gmail Data Extractor

A Next.js application that allows users to connect their Gmail account and extract email data using Google OAuth 2.0.

## 📋 Prerequisites

- Node.js 18+ installed
- A Google Cloud Project with Gmail API enabled
- Google OAuth 2.0 Client ID

## ⚙️ Setup Instructions

### Step 1: Get Google OAuth Client ID

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the **Gmail API**:
   - Navigate to "APIs & Services" → "Library"
   - Search for "Gmail API"
   - Click "Enable"
4. Create OAuth 2.0 Credentials:
   - Go to "APIs & Services" → "Credentials"
   - Click "Create Credentials" → "OAuth client ID"
   - Choose "Web application" as the application type
   - Add authorized JavaScript origins:
     - `http://localhost:3000` (for development)
     - Your production domain (for deployment)
   - Click "Create"
   - Copy the **Client ID** (it looks like: `xxxxx.apps.googleusercontent.com`)

### Step 2: Configure Environment Variables

1. Create a `.env.local` file in the root directory of your project
2. Add your Google Client ID:

```env
NEXT_PUBLIC_GOOGLE_CLIENT_ID=your-client-id-here.apps.googleusercontent.com
```

**Important:** Replace `your-client-id-here.apps.googleusercontent.com` with your actual Client ID from Step 1.

### Step 3: Install Dependencies

```bash
npm install
```

### Step 4: Run the Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## 🔄 How It Works

1. User enters their email address
2. User clicks "Connect Gmail & Extract Data"
3. Google OAuth popup appears for authentication
4. User grants permission to read Gmail
5. Access token is obtained
6. Data is sent to n8n webhook: `https://techtizz.app.n8n.cloud/webhook-test/user-email`
7. Success notification is shown

## 📁 Project Structure

```
email-extract-data/
├── app/
│   ├── page.tsx          # Main component with OAuth flow
│   ├── layout.tsx         # Root layout
│   └── globals.css        # Global styles
├── .env.local             # Environment variables (create this)
└── package.json           # Dependencies
```

## 🛠️ Technologies Used

- **Next.js 16** - React framework
- **TypeScript** - Type safety
- **Tailwind CSS** - Styling
- **SweetAlert2** - Beautiful alerts
- **Google Identity Services** - OAuth 2.0 authentication

## 📝 Notes

- The `.env.local` file is not tracked by git (for security)
- Make sure to restart your dev server after adding environment variables
- For production, set environment variables in your hosting platform (Vercel, Netlify, etc.)

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
