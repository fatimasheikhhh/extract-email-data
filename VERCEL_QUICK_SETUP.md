# ⚡ Vercel Deployment - Quick Setup (Urdu/Hindi)

## 🎯 Aapka Domain:
**https://extract-email-data.vercel.app**

---

## 📝 Step-by-Step Instructions

### 1️⃣ Google Cloud Console Setup (Zaroori!)

1. https://console.cloud.google.com/ par jayein
2. Apna project select karein
3. **APIs & Services** → **Credentials** par jayein
4. Apni **OAuth 2.0 Client ID** ko edit karein (pencil icon)
5. **Authorized JavaScript origins** section mein yeh add karein:
   ```
   https://extract-email-data.vercel.app
   ```
6. **Save** button click karein

---

### 2️⃣ Vercel Environment Variable

1. https://vercel.com/dashboard par jayein
2. Apna project **extract-email-data** select karein
3. **Settings** tab click karein
4. Left side se **Environment Variables** select karein
5. **Add New** button click karein
6. Ye details fill karein:

   **Key (Name):**
   ```
   NEXT_PUBLIC_GOOGLE_CLIENT_ID
   ```

   **Value:**
   ```
   aapka-client-id.apps.googleusercontent.com
   ```
   (Yeh Google Cloud Console se copy karein - OAuth Client ID)

   **Environments:** 
   - ✅ Production
   - ✅ Preview  
   - ✅ Development
   
   (Teeno checkboxes tick karein)

7. **Save** button click karein

---

### 3️⃣ Redeploy (Zaroori!)

1. Project page par wapas jayein
2. **Deployments** tab click karein
3. Latest deployment ke right side par **3 dots (...)** click karein
4. **Redeploy** select karein
5. Wait karein deployment complete hone tak

---

## ✅ Testing

1. https://extract-email-data.vercel.app open karein
2. "Continue to Gmail" button click karein
3. Google OAuth popup aana chahiye ✅

---

## ❌ Agar Error Aaye To:

### Error: "Google Client ID is not configured"
**Solution:**
- Vercel mein environment variable add kiya hai ya nahi check karein
- Variable name exactly `NEXT_PUBLIC_GOOGLE_CLIENT_ID` hona chahiye
- Redeploy karein

### Error: "redirect_uri_mismatch" ya "Error 400"
**Solution:**
- Google Cloud Console mein `https://extract-email-data.vercel.app` add kiya hai ya nahi check karein
- **Authorized JavaScript origins** mein add karein (redirect URI nahi)

### OAuth Popup Nahi Khulta
**Solution:**
- Browser console open karein (F12 press karein)
- Errors check karein
- Vercel build logs check karein

---

## 📋 Final Checklist

- [ ] Google Cloud Console mein `https://extract-email-data.vercel.app` add kiya
- [ ] Vercel mein `NEXT_PUBLIC_GOOGLE_CLIENT_ID` add kiya
- [ ] Environment variable ka value sahi hai
- [ ] Production, Preview, Development - teeno select kiye
- [ ] Redeploy kiya hai
- [ ] Website test kiya hai

---

## 🎉 Done!

Agar sab kuch sahi se kiya hai to aapka app ab Vercel par kaam kar raha hoga!

**Important:** Environment variable add karne ke baad **zaroor redeploy karein**, warna changes apply nahi honge.

