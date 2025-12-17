"use client";

import React, { useEffect, useState } from "react";
import Swal from "sweetalert2";
import { supabase } from "./src/lib/supabase-client";

declare global {
  interface Window {
    google?: any;
  }
}

const GMAIL_SCOPES =
  "https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile";

const N8N_WEBHOOK_URL = "https://techtizz.app.n8n.cloud/webhook/user-email";

export default function HomePage() {
  const [isGoogleLoaded, setIsGoogleLoaded] = useState(false);
  const [executionId, setExecutionId] = useState<number | null>(null);
  const [workflowStatus, setWorkflowStatus] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  /* ---------------------------------- */
  /* Load Google Script */
  /* ---------------------------------- */
  useEffect(() => {
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => setIsGoogleLoaded(true);
    document.body.appendChild(script);

    return () => {
      if (document.body.contains(script))
      {
        document.body.removeChild(script);
      }
    };
  }, []);

  /* ---------------------------------- */
  /* Load User Email from localStorage on Page Load */
  /* ---------------------------------- */
  useEffect(() => {
    // Load saved user email from localStorage
    const savedEmail = localStorage.getItem("gmail_user_email");
    if (savedEmail)
    {
      setUserEmail(savedEmail);
    }
  }, []);

  /* ---------------------------------- */
  /* Check for Ongoing Execution on Page Load */
  /* ---------------------------------- */
  useEffect(() => {
    // Agar page refresh ho jaye to latest execution check karo
    // BUT only if we have a user email
    if (!userEmail) return;

    const checkOngoingExecution = async () => {
      try
      {
        // Latest execution fetch karo (processing ya completed) - BUT ONLY FOR THIS USER
        const { data, error } = await supabase
          .from("workflow_executions")
          .select("id, status, user_email")
          .eq("user_email", userEmail) // ⬇️ IMPORTANT: Filter by user email
          .order("started_at", { ascending: false })
          .limit(1)
          .single();

        if (error || !data)
        {
          // Koi execution nahi mila, ye normal hai
          return;
        }

        // Agar processing ya completed hai to set karo
        if (data.status === "processing" || data.status === "completed")
        {
          console.log("Found ongoing/completed execution for user:", data);
          setExecutionId(data.id);
          setWorkflowStatus(data.status);
        }
      } catch (err)
      {
        console.error("Error checking ongoing execution:", err);
      }
    };

    checkOngoingExecution();
  }, [userEmail]);

  /* ---------------------------------- */
  /* Fetch Latest Execution from DB */
  /* ---------------------------------- */
  const fetchLatestExecution = async (email: string): Promise<number | null> => {
    const { data, error } = await supabase
      .from("workflow_executions")
      .select("id, status, user_email")
      .eq("status", "processing")
      .eq("user_email", email) // ⬇️ IMPORTANT: Filter by user email
      .order("started_at", { ascending: false })
      .limit(1)
      .single();

    if (error || !data)
    {
      console.error("Fetch execution error:", error);
      return null;
    }

    return data.id;
  };


  /* ---------------------------------- */
  /* Gmail OAuth */
  /* ---------------------------------- */
  const initiateGmailOAuth = async () => {
    if (!window.google) return;

    Swal.fire({
      title: "Connecting Gmail...",
      allowOutsideClick: false,
      showConfirmButton: false,
      didOpen: () => Swal.showLoading(),
    });

    const client = window.google.accounts.oauth2.initCodeClient({
      client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID!,
      scope: GMAIL_SCOPES,
      access_type: "offline",
      prompt: "consent",
      callback: async (response: any) => {
        try
        {
          console.log("🔵 OAuth Response received:", response);
          if (!response.code) throw new Error("No auth code");

          // ⬇️ IMPORTANT: Clear previous user's execution state
          // When new OAuth starts, clear old state
          setExecutionId(null);
          setWorkflowStatus(null);

          // ⬇️ DEBUG: Log the auth code
          console.log("🔵 Auth code received:", response.code.substring(0, 20) + "...");

          // ⬇️ IMPORTANT: Get user email from Google FIRST using our API route
          let userEmailFromGoogle: string | null = null;

          try
          {
            console.log("🔵 Getting user email from Google...");
            console.log("🔵 Current origin:", window.location.origin);
            const emailResponse = await fetch("/api/get-user-email", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                code: response.code,
                redirect_uri: window.location.origin // Pass current origin as redirect URI
              }),
            });

            if (emailResponse.ok)
            {
              const emailData = await emailResponse.json();
              userEmailFromGoogle = emailData.email;
              console.log("✅ Email from Google API:", userEmailFromGoogle);

              // ⬇️ Store email immediately
              if (userEmailFromGoogle)
              {
                setUserEmail(userEmailFromGoogle);
                localStorage.setItem("gmail_user_email", userEmailFromGoogle);
                console.log("✅ Email stored in state and localStorage");
              }
            } else
            {
              const errorData = await emailResponse.json();
              console.error("❌ Error getting email from API:", errorData);
            }
          } catch (emailError: any)
          {
            console.error("❌ Error calling get-user-email API:", emailError);
            // Continue anyway, we'll try to get email from n8n or DB
          }

          // ⬇️ n8n webhook call karo
          // n8n will exchange the code, get user email, and store it in DB
          console.log("🔵 Calling n8n webhook...");
          const n8nResponse = await fetch(N8N_WEBHOOK_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              code: response.code,
              user_email: userEmailFromGoogle || undefined // Send email if we have it
            }),
          });

          console.log("🔵 n8n Response status:", n8nResponse.status);

          if (!n8nResponse.ok)
          {
            const errorText = await n8nResponse.text();
            console.error("❌ n8n Error:", errorText);
            throw new Error("Failed to start workflow");
          }

          // ⬇️ Try to get email from n8n response if we don't have it yet
          if (!userEmailFromGoogle)
          {
            try
            {
              const n8nData = await n8nResponse.json();
              console.log("🔵 n8n Response data:", n8nData);
              if (n8nData.user_email)
              {
                userEmailFromGoogle = n8nData.user_email;
                console.log("✅ Email from n8n response:", userEmailFromGoogle);
                if (userEmailFromGoogle)
                {
                  setUserEmail(userEmailFromGoogle);
                  localStorage.setItem("gmail_user_email", userEmailFromGoogle);
                }
              }
            } catch (e)
            {
              console.log("⚠️ n8n response is not JSON, will get email from DB");
            }
          }

          // ⬇️ Final check - if we still don't have email, show error
          if (!userEmailFromGoogle)
          {
            console.error("❌ CRITICAL: Could not get user email from any source!");
            console.error("❌ This means email will be null and workflow won't be user-specific!");
            Swal.fire({
              icon: "warning",
              title: "Email Not Found",
              text: "Could not retrieve your email. The workflow may not be user-specific. Please check server logs.",
            });
            // Don't throw error, continue with workflow but log the issue
          } else
          {
            console.log("✅✅✅ SUCCESS: User email captured:", userEmailFromGoogle);
            console.log("✅ Email is stored in state:", userEmail);
            console.log("✅ Email is in localStorage:", localStorage.getItem("gmail_user_email"));
          }

          // ⬇️ IMPORTANT: DB se latest execution fetch karo
          // Thoda wait karo taake n8n ne DB me insert kar diya ho with user_email
          console.log("⏳ Waiting for n8n to create execution in DB...");
          await new Promise((resolve) => setTimeout(resolve, 2000));

          // Retry logic - max 15 attempts to get the execution with user_email
          let executionId: number | null = null;
          let foundUserEmail: string | null = userEmailFromGoogle; // Use email from n8n if available

          for (let attempt = 0; attempt < 15; attempt++)
          {
            console.log(`🔍 Attempt ${attempt + 1}/15: Looking for execution with user_email...`);

            // Get the most recent processing execution
            const { data, error } = await supabase
              .from("workflow_executions")
              .select("id, status, user_email, started_at")
              .eq("status", "processing")
              .order("started_at", { ascending: false })
              .limit(5); // Get last 5 to find the right one

            console.log("🔍 Found executions:", data);
            console.log("🔍 Error:", error);

            if (data && data.length > 0)
            {
              // If we have email from n8n, find execution matching that email
              if (foundUserEmail)
              {
                const matchingExecution = data.find(exec => exec.user_email === foundUserEmail);
                if (matchingExecution && matchingExecution.user_email)
                {
                  executionId = matchingExecution.id;
                  foundUserEmail = matchingExecution.user_email;
                  console.log("✅ Found execution matching email:", foundUserEmail, "Execution ID:", executionId);
                  break;
                }
              }

              // Otherwise, find the first one with user_email
              const executionWithEmail = data.find(exec => exec.user_email);
              if (executionWithEmail && executionWithEmail.user_email)
              {
                executionId = executionWithEmail.id;
                foundUserEmail = executionWithEmail.user_email;
                console.log("✅ Found execution with email:", foundUserEmail, "Execution ID:", executionId);

                // ⬇️ IMPORTANT: Check if this is a different user
                if (userEmail && userEmail !== foundUserEmail)
                {
                  console.log("⚠️ Different user detected:", userEmail, "vs", foundUserEmail);
                  // This execution belongs to a different user, don't use it
                  executionId = null;
                  foundUserEmail = null;
                  // Wait a bit more and try again
                  await new Promise((resolve) => setTimeout(resolve, 1000));
                  continue;
                }

                break;
              } else
              {
                console.log("⚠️ Execution found but no user_email yet, waiting...");
              }
            }

            await new Promise((resolve) => setTimeout(resolve, 1000));
          }

          // ⬇️ Store current user email if we found it
          if (foundUserEmail)
          {
            console.log("✅ Storing user email:", foundUserEmail);
            setUserEmail(foundUserEmail);
            localStorage.setItem("gmail_user_email", foundUserEmail);
          } else
          {
            console.error("❌ Could not find user_email after 15 attempts");
          }

          // If we still don't have executionId, try one more time without filters
          if (!executionId)
          {
            console.log("⚠️ Trying fallback: Get latest execution without filters...");
            const { data } = await supabase
              .from("workflow_executions")
              .select("id, status, user_email, started_at")
              .order("started_at", { ascending: false })
              .limit(1)
              .single();

            if (data)
            {
              console.log("🔍 Fallback execution found:", data);
              executionId = data.id;
              if (data.user_email)
              {
                foundUserEmail = data.user_email;
                if (foundUserEmail)
                {
                  setUserEmail(foundUserEmail);
                  localStorage.setItem("gmail_user_email", foundUserEmail);
                  console.log("✅ Using fallback email:", foundUserEmail);
                }
              } else
              {
                console.error("❌ Fallback execution also has no user_email");
              }
            }
          }

          if (!executionId)
          {
            throw new Error("Execution not found in database");
          }

          setExecutionId(executionId);
          setWorkflowStatus("processing");

          Swal.fire("Connected 🎉", "Workflow started", "success");
        } catch (err: any)
        {
          Swal.fire("Error", err.message, "error");
        }
      },
    });

    client.requestCode();
  };

  /* ---------------------------------- */
  /* Clear User Data / Switch Account */
  /* ---------------------------------- */
  const clearUserData = () => {
    setUserEmail(null);
    setExecutionId(null);
    setWorkflowStatus(null);
    localStorage.removeItem("gmail_user_email");
    Swal.fire("Cleared", "You can now connect with a different account", "info");
  };

  /* ---------------------------------- */
  /* Realtime Status Updates with Socket */
  /* ---------------------------------- */
  useEffect(() => {
    if (!executionId || !userEmail) return;

    let subscription: ReturnType<typeof supabase.channel> | null = null;

    // ⬇️ Pehle current status fetch karo (agar already completed hai to)
    const fetchCurrentStatus = async () => {
      try
      {
        const { data, error } = await supabase
          .from("workflow_executions")
          .select("status, user_email")
          .eq("id", executionId)
          .single();

        if (error)
        {
          console.error("Error fetching status:", error);
          return;
        }

        // ⬇️ IMPORTANT: Verify this execution belongs to current user
        if (data && data.user_email && data.user_email !== userEmail)
        {
          console.warn("Execution belongs to different user, ignoring");
          setExecutionId(null);
          setWorkflowStatus(null);
          return;
        }

        if (data && data.status)
        {
          console.log("Current status from DB:", data.status);
          setWorkflowStatus(data.status);

          // Agar already completed hai to alert show karo
          if (data.status === "completed")
          {
            Swal.fire("Completed 🎉", "Workflow finished", "success");
          }
        }
      } catch (err)
      {
        console.error("Error in fetchCurrentStatus:", err);
      }
    };

    // Initial status fetch
    fetchCurrentStatus();

    // ⬇️ Realtime subscription setup karo
    subscription = supabase
      .channel(`workflow-execution-${executionId}`, {
        config: {
          broadcast: { self: true },
        },
      })
      .on(
        "postgres_changes",
        {
          event: "UPDATE", // Sirf UPDATE events listen karo
          schema: "public",
          table: "workflow_executions",
          filter: `id=eq.${executionId}`,
        },
        (payload) => {
          console.log("Realtime payload received:", payload);
          console.log("New data:", payload.new);
          console.log("Old data:", payload.old);

          if (
            payload.new &&
            typeof payload.new === "object" &&
            "status" in payload.new
          )
          {
            // ⬇️ IMPORTANT: Verify this execution belongs to current user
            const payloadEmail = (payload.new as { user_email?: string }).user_email;
            if (payloadEmail && payloadEmail !== userEmail)
            {
              console.warn("Realtime update for different user, ignoring");
              return;
            }

            const newStatus = (payload.new as { status: string }).status;
            const oldStatus = payload.old
              ? (payload.old as { status: string }).status
              : null;

            console.log(`Status changed: ${oldStatus} -> ${newStatus}`);

            // Status update karo
            setWorkflowStatus(newStatus);

            // Agar completed ho gaya to alert show karo
            if (newStatus === "completed")
            {
              Swal.fire("Completed 🎉", "Workflow finished", "success");
            }
          }
        }
      )
      .subscribe((status) => {
        console.log("Subscription status:", status);
        if (status === "SUBSCRIBED")
        {
          console.log("✅ Successfully subscribed to realtime updates");
        } else if (status === "CHANNEL_ERROR")
        {
          console.error("❌ Channel subscription error");
        } else if (status === "TIMED_OUT")
        {
          console.error("⏱️ Subscription timed out");
        } else if (status === "CLOSED")
        {
          console.log("🔒 Channel closed");
        }
      });

    // Cleanup function
    return () => {
      if (subscription)
      {
        console.log("Cleaning up subscription for executionId:", executionId);
        supabase.removeChannel(subscription);
      }
    };
  }, [executionId, userEmail]);

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Animated Background with Gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#AED175] to-[#4CB2DD]  animate-gradient">
        {/* Animated Background Pattern */}
        <div className="absolute inset-0 opacity-20">
          <div className="absolute top-0 left-0 w-96 h-96 bg-blue-400 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-float"></div>
          <div
            className="absolute top-0 right-0 w-96 h-96 bg-purple-400 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-float"
            style={{ animationDelay: "2s" }}
          ></div>
          <div
            className="absolute bottom-0 left-1/2 w-96 h-96 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-float"
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
          <div className="bg-white/95 dark:bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/20 p-8 sm:p-10 lg:p-12 transform transition-all duration-300 hover:scale-[1.02]">
            {/* Logo/Icon Section */}
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-[#AED175] to-[#4CB2DD] rounded-2xl mb-6 transform transition-transform duration-300 hover:scale-110">
                <img src={"/email.png"} alt="email image" />
              </div>
              <h1 className="text-4xl sm:text-5xl font-bold bg-gradient-to-r from-[#AED175] to-[#4CB2DD] bg-clip-text text-transparent mb-3">
                Gmail Extractor
              </h1>
              <p className="text-gray-600 dark:text-gray-400 text-lg">
                Connect your Gmail account securely
              </p>
              <p className="text-gray-600 dark:text-gray-600 text-sm mt-2">
                Extract and process your email data effortlessly
              </p>
            </div>

            {/* Form Section */}
            <div className="space-y-6">
              {/* Connect Gmail Button */}
              <button
                onClick={initiateGmailOAuth}
                disabled={
                  !isGoogleLoaded ||
                  workflowStatus === "processing" ||
                  workflowStatus === "completed"
                }
                className="w-full group relative overflow-hidden bg-gradient-to-r from-[#AED175] to-[#4CB2DD] hover:from-[#AED175] hover:to-[#4CB2DD]  disabled:from-[#AED175] disabled:to-[#4CB2DD] disabled:hover:from-[#AED175] disabled:to-[#4CB2DD] disabled:cursor-not-allowed text-white font-bold py-4 px-6 rounded-xl transition-all duration-300 transform hover:scale-[1.02] hover:shadow-2xl active:scale-[0.98] flex items-center justify-center gap-3 shadow-lg"
              >
                {/* Shimmer Effect */}
                <div className="absolute inset-0 animate-shimmer opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>

                {workflowStatus === "completed" ? (
                  <>Completed </>
                ) : workflowStatus === "processing" ? (
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

              {/* Current User Email Display */}
              {userEmail && (
                <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                  <div className="flex items-center gap-2">
                    <svg
                      className="w-5 h-5 text-gray-500"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                      />
                    </svg>
                    <span className="text-sm text-gray-700 dark:text-gray-300 font-medium">
                      {userEmail}
                    </span>
                  </div>
                  <button
                    onClick={clearUserData}
                    className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-medium underline"
                  >
                    Switch Account
                  </button>
                </div>
              )}

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
            <div className="bg-white/80 dark:bg-white/80 backdrop-blur-lg rounded-xl p-4 border border-white/20 text-center">
              <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                🔒
              </div>
              <div className="text-xs font-semibold text-gray-700 dark:text-gray-500 mt-2">
                Secure
              </div>
            </div>
            <div className="bg-white/80 dark:bg-white/80 backdrop-blur-lg rounded-xl p-4 border border-white/20 text-center">
              <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                ⚡
              </div>
              <div className="text-xs font-semibold text-gray-700 dark:text-gray-500 mt-2">
                Fast
              </div>
            </div>
            <div className="bg-white/80 dark:bg-white/80 backdrop-blur-lg rounded-xl p-4 border border-white/20 text-center">
              <div className="text-2xl font-bold text-pink-600 dark:text-pink-400">
                ✨
              </div>
              <div className="text-xs font-semibold text-gray-700 dark:text-gray-500 mt-2">
                Easy
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
