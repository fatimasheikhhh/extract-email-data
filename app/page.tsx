"use client";

import React, { useState } from "react";
import Swal from "sweetalert2";

declare global {
  interface Window {
    google?: any;
  }
}

const GMAIL_SCOPES =
  "https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile";
const N8N_WEBHOOK_URL = "https://techtizz.app.n8n.cloud/webhook/user-email";

export default function HomePage() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [isGoogleLoaded, setIsGoogleLoaded] = useState(false);

  // Load Google Identity Services
  React.useEffect(() => {
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => {
      // Initialize Google Identity Services
      if (window.google)
      {
        // This ensures account selection is available
        window.google.accounts.id.initialize({
          client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "",
          auto_select: false, // Don't auto-select, show account picker
        });
      }
      setIsGoogleLoaded(true);
    };
    document.body.appendChild(script);

    return () => {
      if (document.body.contains(script))
      {
        document.body.removeChild(script);
      }
    };
  }, []);

  // Initiate Gmail OAuth flow
  const initiateGmailOAuth = async () => {
    try
    {
      if (!window.google)
      {
        throw new Error("Google Identity Services not loaded");
      }

      setIsProcessing(true);

      Swal.fire({
        title: "Connecting Gmail...",
        text: "Please select your Google account",
        icon: "info",
        allowOutsideClick: false,
        allowEscapeKey: false,
        showConfirmButton: false,
        didOpen: () => {
          Swal.showLoading();
        },
      });

      const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "";

      if (!clientId)
      {
        throw new Error("Google Client ID missing");
      }

      // Helper: silently fetch user email using token flow (no extra popup if already authorized)
      const fetchEmailSilently = (): Promise<string> =>
        new Promise((resolve, reject) => {
          const tokenClient = window.google?.accounts.oauth2.initTokenClient({
            client_id: clientId,
            scope: GMAIL_SCOPES,
            callback: async (tokenResponse: any) => {
              try
              {
                if (tokenResponse.error)
                {
                  reject(
                    new Error(
                      tokenResponse.error_description ||
                      tokenResponse.error ||
                      "Failed to get access token"
                    )
                  );
                  return;
                }

                const userInfoResponse = await fetch(
                  "https://www.googleapis.com/oauth2/v2/userinfo",
                  {
                    headers: {
                      Authorization: `Bearer ${tokenResponse.access_token}`,
                    },
                  }
                );

                if (!userInfoResponse.ok)
                {
                  const errorData = await userInfoResponse
                    .json()
                    .catch(() => ({}));
                  reject(
                    new Error(
                      errorData.error?.message ||
                      `Failed to fetch user info (${userInfoResponse.status})`
                    )
                  );
                  return;
                }

                const userInfo = await userInfoResponse.json();
                resolve(userInfo.email || "");
              } catch (err: any)
              {
                reject(err);
              }
            },
            error_callback: (err: any) => {
              reject(
                new Error(
                  err?.error_description || err?.error || "Token request failed"
                )
              );
            },
          });

          // Try to use existing session; prompt: '' avoids extra popup if possible
          try
          {
            tokenClient?.requestAccessToken({ prompt: "" });
          } catch (err: any)
          {
            reject(
              new Error(
                err?.message || "Token request blocked. Please allow popups."
              )
            );
          }
        });

      const redirectUri =
        process.env.NEXT_PUBLIC_GOOGLE_REDIRECT_URI || window.location.origin;

      // ✅ AUTHORIZATION CODE FLOW (CORRECT)
      const codeClient = window.google.accounts.oauth2.initCodeClient({
        client_id: clientId,
        scope: GMAIL_SCOPES,
        access_type: "offline", // get refresh token server-side
        prompt: "consent", // ensure consent and account selection
        redirect_uri: redirectUri,
        ux_mode: "popup", // use popup to avoid full-page redirects
        callback: async (response: any) => {
          try
          {
            if (!response.code)
            {
              throw new Error("Authorization code not received");
            }

            // Fetch email using token client (will use same session from code flow)
            let userEmail = "";
            try
            {
              // Use Promise to properly wait for email fetch
              userEmail = await new Promise<string>((resolve, reject) => {
                const tokenClient = window.google?.accounts.oauth2.initTokenClient({
                  client_id: clientId,
                  scope: GMAIL_SCOPES,
                  callback: async (tokenResponse: any) => {
                    try
                    {
                      if (tokenResponse.error)
                      {
                        reject(new Error(tokenResponse.error_description || "Failed to get token"));
                        return;
                      }

                      const userInfoResponse = await fetch(
                        "https://www.googleapis.com/oauth2/v2/userinfo",
                        {
                          headers: {
                            Authorization: `Bearer ${tokenResponse.access_token}`,
                          },
                        }
                      );

                      if (userInfoResponse.ok)
                      {
                        const userInfo = await userInfoResponse.json();
                        const email = userInfo.email || "";
                        console.log("✅ Email fetched:", email);
                        resolve(email);
                      } else
                      {
                        const errorData = await userInfoResponse.json().catch(() => ({}));
                        reject(new Error(errorData.error?.message || "Failed to fetch user info"));
                      }
                    } catch (err: any)
                    {
                      reject(err);
                    }
                  },
                });

                // Request token (will use existing session from code flow)
                try
                {
                  tokenClient?.requestAccessToken({ prompt: "" });
                } catch (err: any)
                {
                  reject(new Error(err?.message || "Token request failed"));
                }
              });
            } catch (err)
            {
              console.warn("⚠️ Could not fetch email:", err);
              // Continue without email - code will still be sent
            }

            // ✅ Send AUTH CODE + email to n8n
            const payload: any = {
              code: response.code,
            };

            // Only add email if we got it
            if (userEmail)
            {
              payload.email = userEmail;
            }

            console.log("Sending to n8n:", payload);

            const res = await fetch(N8N_WEBHOOK_URL, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify(payload),
            });

            if (!res.ok)
            {
              const errText = await res.text().catch(() => "");
              throw new Error(
                `Failed to send auth code to server. Status: ${res.status} ${res.statusText} ${errText}`
              );
            }

            Swal.fire({
              title: "Connected Successfully 🎉",
              text: userEmail
                ? `Connected as ${userEmail}. You won't need to login again.`
                : "Your Gmail is now connected. You won't need to login again.",
              icon: "success",
              confirmButtonText: "OK",
            });

            setIsProcessing(false);
          } catch (err: any)
          {
            console.error(err);
            Swal.fire({
              title: "Error",
              text: err.message || "Failed to connect Gmail",
              icon: "error",
            });
            setIsProcessing(false);
          }
        },
      });

      // 🚀 Start OAuth
      codeClient.requestCode();
    } catch (error: any)
    {
      console.error(error);
      Swal.fire({
        title: "Error",
        text: error.message || "OAuth failed",
        icon: "error",
      });
      setIsProcessing(false);
    }
  };

  // Send data to n8n webhook
  // const sendToN8N = async (userEmail: string, accessToken: string, refreshToken: string) => {
  //   try
  //   {
  //     const response = await fetch(N8N_WEBHOOK_URL, {
  //       method: 'POST',
  //       headers: {
  //         'Content-Type': 'application/json',
  //       },
  //       body: JSON.stringify({
  //         email: userEmail,
  //         access_token: accessToken,
  //         refresh_token: refreshToken,
  //       }),
  //     });

  //     if (!response.ok)
  //     {
  //       throw new Error(`HTTP error! status: ${response.status}`);
  //     }

  //     // Show success alert
  //     Swal.fire({
  //       title: 'Success!',
  //       text: 'Your email data has been successfully sent for processing.',
  //       icon: 'success',
  //       confirmButtonText: 'OK',
  //     });

  //     setIsProcessing(false);
  //   } catch (error)
  //   {
  //     console.error('N8N webhook error:', error);
  //     Swal.fire({
  //       title: 'Error!',
  //       text: 'Failed to send data to server. Please try again.',
  //       icon: 'error',
  //       confirmButtonText: 'OK',
  //     });
  //     setIsProcessing(false);
  //   }
  // };

  // Handle Connect Gmail button click
  const handleConnectGmail = async () => {
    if (!isGoogleLoaded)
    {
      Swal.fire({
        title: "Loading...",
        text: "Google services are still loading. Please wait a moment.",
        icon: "info",
        confirmButtonText: "OK",
      });
      return;
    }

    // Initiate Gmail OAuth
    await initiateGmailOAuth();
  };

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Animated Background with Gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-500 animate-gradient">
        {/* Animated Background Pattern */}
        <div className="absolute inset-0 opacity-20">
          <div className="absolute top-0 left-0 w-96 h-96 bg-blue-400 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-float"></div>
          <div
            className="absolute top-0 right-0 w-96 h-96 bg-purple-400 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-float"
            style={{ animationDelay: "2s" }}
          ></div>
          <div
            className="absolute bottom-0 left-1/2 w-96 h-96 bg-pink-400 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-float"
            style={{ animationDelay: "4s" }}
          ></div>
        </div>

        {/* Grid Pattern Overlay */}
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wNSI+PHBhdGggZD0iTTM2IDM0VjI2aDR2OGgtNHptLTQgMEgyNnY0aDZ2LTR6TTIyIDM0aC00di00aDR2NHptMC0xMkgxOHY0aDR2LTR6TTM2IDIyaC00di00aDR2NHptMTIgMGgtNHYtNGg0djR6TTM2IDM0aDR2NGgtNHYtNHptMTIgMGgtNHY0aDR2LTR6TTM2IDQ2aDR2NGgtNHYtNHptMTIgMGgtNHY0aDR2LTR6TTIyIDQ2aC00djRoNHYtNHptLTEyIDBoLTR2NGg0di00eiIvPjwvZz48L2c+PC9zdmc+')] opacity-30"></div>
      </div>

      {/* Main Content */}
      <div className="relative z-10 min-h-screen flex items-center justify-center p-4 sm:p-6 lg:p-8">
        <div className="w-full max-w-lg">
          {/* Card Container with Glassmorphism */}
          <div className="bg-white/95 dark:bg-gray-900/95 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/20 p-8 sm:p-10 lg:p-12 transform transition-all duration-300 hover:scale-[1.02]">
            {/* Logo/Icon Section */}
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl shadow-lg mb-6 transform transition-transform duration-300 hover:scale-110">
                <svg
                  className="w-10 h-10 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                  />
                </svg>
              </div>
              <h1 className="text-4xl sm:text-5xl font-bold bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 bg-clip-text text-transparent mb-3">
                Gmail Extractor
              </h1>
              <p className="text-gray-600 dark:text-gray-300 text-lg">
                Connect your Gmail account securely
              </p>
              <p className="text-gray-500 dark:text-gray-400 text-sm mt-2">
                Extract and process your email data effortlessly
              </p>
            </div>

            {/* Form Section */}
            <div className="space-y-6">
              {/* Connect Gmail Button */}
              <button
                onClick={handleConnectGmail}
                disabled={isProcessing || !isGoogleLoaded}
                className="w-full group relative overflow-hidden bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 hover:from-blue-700 hover:via-purple-700 hover:to-pink-700 disabled:from-gray-400 disabled:via-gray-400 disabled:to-gray-400 disabled:cursor-not-allowed text-white font-bold py-4 px-6 rounded-xl transition-all duration-300 transform hover:scale-[1.02] hover:shadow-2xl active:scale-[0.98] flex items-center justify-center gap-3 shadow-lg"
              >
                {/* Shimmer Effect */}
                <div className="absolute inset-0 animate-shimmer opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>

                {isProcessing ? (
                  <>
                    <svg
                      className="animate-spin h-6 w-6 text-white"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      ></circle>
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      ></path>
                    </svg>
                    <span className="relative z-10">Processing...</span>
                  </>
                ) : (
                  <>
                    <svg
                      className="w-6 h-6 relative z-10"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                    >
                      <path
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                        fill="#fff"
                      />
                      <path
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                        fill="#fff"
                      />
                      <path
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                        fill="#fff"
                      />
                      <path
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                        fill="#fff"
                      />
                    </svg>
                    <span className="relative z-10">Continue to Gmail</span>
                  </>
                )}
              </button>

              {/* Loading Status */}
              {!isGoogleLoaded && (
                <div className="flex items-center justify-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                  <svg
                    className="animate-spin h-4 w-4"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  <span>Loading Google services...</span>
                </div>
              )}

              {/* Security Badge */}
              <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                <div className="flex items-center justify-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                  <svg
                    className="w-4 h-4 text-green-500"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                    />
                  </svg>
                  <span>Secure OAuth 2.0 Authentication</span>
                </div>
              </div>
            </div>
          </div>

          {/* Additional Info Cards */}
          <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white/80 dark:bg-gray-900/80 backdrop-blur-lg rounded-xl p-4 border border-white/20 text-center">
              <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                🔒
              </div>
              <div className="text-xs font-semibold text-gray-700 dark:text-gray-300 mt-2">
                Secure
              </div>
            </div>
            <div className="bg-white/80 dark:bg-gray-900/80 backdrop-blur-lg rounded-xl p-4 border border-white/20 text-center">
              <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                ⚡
              </div>
              <div className="text-xs font-semibold text-gray-700 dark:text-gray-300 mt-2">
                Fast
              </div>
            </div>
            <div className="bg-white/80 dark:bg-gray-900/80 backdrop-blur-lg rounded-xl p-4 border border-white/20 text-center">
              <div className="text-2xl font-bold text-pink-600 dark:text-pink-400">
                ✨
              </div>
              <div className="text-xs font-semibold text-gray-700 dark:text-gray-300 mt-2">
                Easy
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
