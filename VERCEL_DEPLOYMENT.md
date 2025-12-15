# 🚀 Vercel Deployment Guide - Urdu/Hindi

## 📍 Aapka Vercel Domain:
**https://extract-email-data.vercel.app**

---

## ✅ Step 1: Google Cloud Console Mein Domain Add Karein

### Important: Pehle yeh karna zaroori hai!

1. **Google Cloud Console** mein jayein:
   - https://console.cloud.google.com/
   - Apna project select karein

2. **OAuth 2.0 Credentials** mein jayein:
   - "APIs & Services" → "Credentials"
   - Apni OAuth Client ID ko click karein (edit karne ke liye)

3. **Authorized JavaScript origins** mein yeh add karein:
   ```
   https://extract-email-data.vercel.app
   ```
   
   **Note:** Agar aapke paas custom domain hai, to wo bhi add karein:
   ```
   https://extract-email-data.vercel.app
   https://your-custom-domain.com  (agar hai to)
   ```

4. **Save** karein

---

## 🔐 Step 2: Vercel Mein Environment Variable Add Karein

### Vercel Dashboard Mein:

1. **Vercel Dashboard** mein jayein:
   - https://vercel.com/dashboard
   - Apna project select karein: `extract-email-data`

2. **Settings** → **Environment Variables** mein jayein

3. **New Environment Variable** add karein:

   **Name:**
   ```
   NEXT_PUBLIC_GOOGLE_CLIENT_ID
   ```

   **Value:**
   ```
   aapka-google-client-id.apps.googleusercontent.com
   ```
   (Yeh Google Cloud Console se copy karein)

4. **Environment** select karein:
   - ✅ Production
   - ✅ Preview
   - ✅ Development
   
   (Teeno select karein taake sab jagah kaam kare)

5. **Save** karein

6. **Important:** Ab **Redeploy** karein:
   - Project page par jayein
   - "Deployments" tab mein
   - Latest deployment ke 3 dots (...) click karein
   - "Redeploy" select karein

---

## ⚠️ Common Issues Aur Solutions

### Issue 1: "Google Client ID is not configured" Error

**Solution:**
- Vercel mein environment variable sahi add hua hai ya nahi check karein
- Variable name exactly `NEXT_PUBLIC_GOOGLE_CLIENT_ID` hona chahiye (case-sensitive)
- Redeploy karein after adding variable

### Issue 2: "Error 400: redirect_uri_mismatch"

**Solution:**
- Google Cloud Console mein `https://extract-email-data.vercel.app` add kiya hai ya nahi check karein
- **Authorized JavaScript origins** mein add karein (redirect URI nahi)
- Agar error aaye to browser console check karein

### Issue 3: OAuth Popup Open Nahi Hota

**Solution:**
- Browser console mein error check karein (F12 press karein)
- Google Client ID sahi hai ya nahi verify karein
- Network tab mein failed requests check karein

### Issue 4: Environment Variable Deploy Ke Baad Kaam Nahi Kar Raha

**Solution:**
- Vercel mein variable add karne ke **baad** redeploy karna zaroori hai
- Build logs check karein (Vercel dashboard → Deployments → Build logs)
- Variable name mein typo to nahi hai check karein

---

## 📋 Checklist Before Deploying

- [ ] Google Cloud Console mein `https://extract-email-data.vercel.app` add kiya
- [ ] Vercel mein `NEXT_PUBLIC_GOOGLE_CLIENT_ID` environment variable add kiya
- [ ] Environment variable ka value sahi hai (Google Client ID)
- [ ] Production, Preview, aur Development - teeno environments select kiye
- [ ] Redeploy kiya hai after adding environment variable
- [ ] Browser console mein koi error nahi aa raha

---

## 🔍 Testing Steps

1. **Deploy ke baad:**
   - https://extract-email-data.vercel.app open karein
   - "Continue to Gmail" button click karein
   - Google OAuth popup aana chahiye

2. **Agar popup nahi aaye:**
   - Browser console open karein (F12)
   - Errors check karein
   - Network tab mein failed requests dekhain

3. **Agar "Configuration Required" error aaye:**
   - Vercel mein environment variable check karein
   - Redeploy karein

---

## 📞 Additional Help

Agar koi issue aaye to:
1. Vercel build logs check karein
2. Browser console mein errors dekhain
3. Google Cloud Console mein OAuth settings verify karein
4. Environment variable ka name aur value double-check karein

---

## 🎯 Quick Summary

**Vercel Mein Ye Add Karein:**
```
Variable Name: NEXT_PUBLIC_GOOGLE_CLIENT_ID
Value: aapka-client-id.apps.googleusercontent.com
Environments: Production, Preview, Development (teeno)
```

**Google Cloud Console Mein Ye Add Karein:**
```
Authorized JavaScript origins: https://extract-email-data.vercel.app
```

**Phir Redeploy Karein!** ✅

