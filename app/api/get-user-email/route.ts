import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const { code, redirect_uri } = await request.json();

    if (!code) {
      return NextResponse.json(
        { error: "Authorization code is required" },
        { status: 400 }
      );
    }

    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    
    // Use redirect_uri from request, or fallback to environment variable
    // For code flow, redirect_uri must match exactly what was used in OAuth initiation
    const redirectUri = redirect_uri || 
      process.env.NEXT_PUBLIC_REDIRECT_URI || 
      process.env.NEXT_PUBLIC_VERCEL_URL || 
      "http://localhost:3000";
    
    console.log("🔵 Using redirect_uri:", redirectUri);

    if (!clientId || !clientSecret) {
      console.error("Missing Google OAuth credentials");
      console.error("Client ID exists:", !!clientId);
      console.error("Client Secret exists:", !!clientSecret);
      return NextResponse.json(
        { error: "Server configuration error: Missing OAuth credentials" },
        { status: 500 }
      );
    }

    // Exchange authorization code for access token
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        code: code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri || "http://localhost:3000",
        grant_type: "authorization_code",
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error("Token exchange error:", errorText);
      return NextResponse.json(
        { error: "Failed to exchange authorization code" },
        { status: 400 }
      );
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;

    if (!accessToken) {
      return NextResponse.json(
        { error: "No access token received" },
        { status: 400 }
      );
    }

    // Get user info from Google
    const userInfoResponse = await fetch(
      "https://www.googleapis.com/oauth2/v2/userinfo",
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!userInfoResponse.ok) {
      const errorText = await userInfoResponse.text();
      console.error("User info error:", errorText);
      return NextResponse.json(
        { error: "Failed to get user information" },
        { status: 400 }
      );
    }

    const userInfo = await userInfoResponse.json();

    return NextResponse.json({
      email: userInfo.email,
      name: userInfo.name,
      picture: userInfo.picture,
    });
  } catch (error: any) {
    console.error("Error in get-user-email API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

