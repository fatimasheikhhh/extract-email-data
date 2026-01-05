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

const N8N_WEBHOOK_URL =
	"https://fqaswarpractice1.app.n8n.cloud/webhook/user-email";

export default function HomePage() {
	const [isGoogleLoaded, setIsGoogleLoaded] = useState(false);
	const [executionId, setExecutionId] = useState<number | null>(null);
	const [workflowStatus, setWorkflowStatus] = useState<string | null>(null);

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
	/* Check for Ongoing Execution on Page Load */
	/* ---------------------------------- */
	useEffect(() => {
		// Agar page refresh ho jaye to latest execution check karo
		const checkOngoingExecution = async () => {
			try
			{
				// Latest execution fetch karo (processing ya completed)
				const { data, error } = await supabase
					.from("workflow_executions")
					.select("id, status")
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
					console.log("Found ongoing/completed execution:", data);
					setExecutionId(data.id);
					setWorkflowStatus(data.status);
				}
			} catch (err)
			{
				console.error("Error checking ongoing execution:", err);
			}
		};

		checkOngoingExecution();
	}, []);

	/* ---------------------------------- */
	/* Fetch Latest Execution from DB */
	/* ---------------------------------- */
	const fetchLatestExecution = async (): Promise<number | null> => {
		const { data, error } = await supabase
			.from("workflow_executions")
			.select("id, status")
			.eq("status", "processing")
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
					if (!response.code) throw new Error("No auth code");

					// ⬇️ n8n webhook call karo (bas trigger karega)
					const n8nResponse = await fetch(N8N_WEBHOOK_URL, {
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({ code: response.code }),
					});

					if (!n8nResponse.ok)
					{
						throw new Error("Failed to start workflow");
					}

					// ⬇️ IMPORTANT: DB se latest execution fetch karo
					// Thoda wait karo taake n8n ne DB me insert kar diya ho
					await new Promise((resolve) => setTimeout(resolve, 2000));

					// Retry logic - max 5 attempts
					let executionId: number | null = null;
					for (let attempt = 0; attempt < 5; attempt++)
					{
						executionId = await fetchLatestExecution();
						if (executionId) break;
						await new Promise((resolve) => setTimeout(resolve, 1000));
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
	/* Realtime Status Updates with Socket */
	/* ---------------------------------- */
	useEffect(() => {
		if (!executionId) return;

		let subscription: ReturnType<typeof supabase.channel> | null = null;

		// ⬇️ Pehle current status fetch karo (agar already completed hai to)
		const fetchCurrentStatus = async () => {
			try
			{
				const { data, error } = await supabase
					.from("workflow_executions")
					.select("status")
					.eq("id", executionId)
					.single();

				if (error)
				{
					console.error("Error fetching status:", error);
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
	}, [executionId]);

	return (
		<div className="min-h-screen relative overflow-hidden">
			{/* Animated Background with Gradient */}
			<div className="absolute inset-0 bg-gradient-to-br from-[#AED175] to-[#4CB2DD] animate-gradient">
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
			<div className="relative z-10 min-h-screen flex items-center justify-center p-4 sm:p-6 lg:p-8 py-8 sm:py-12">
				<div className="w-full max-w-6xl mx-auto">
					<div className="flex flex-col lg:flex-row gap-6 lg:gap-8 xl:gap-10">
						{/* Left Panel - Features */}
						<div className="w-full lg:w-[60%] xl:w-[58%]">
							<div className="bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl p-2 h-full">
								{/* Logo/Icon Section */}
								<div className="justify-center flex flex-col items-center">
									<div className="flex justify-center items-center w-16 h-16 sm:w-20 sm:h-20 bg-gradient-to-br from-[#AED175] to-[#4CB2DD] rounded-2xl mb-3 sm:mb-4 transform transition-transform duration-300 hover:scale-110">
										<img src="/email.png" alt="Logo" width={86} height={78} />
									</div>
									<h1 className="text-xl sm:text-[40px] font-bold bg-gradient-to-r from-[#AED175] to-[#4CB2DD] bg-clip-text text-transparent">
										Gmail Extractor
									</h1>
									<div className="flex justify-center items-end mt-2">
										<img src="/ai.png" alt="" width={162} height={24} />
									</div>
								</div>

								{/* Features Section */}
								<div className="mt-6 sm:mt-8 p-4">
									<h2 className="text-lg sm:text-xl font-semibold text-black mb-4 sm:mb-6">
										Features
									</h2>
									<div className="space-y-4 sm:space-y-5">
										{/* Feature 1 */}
										<div className="flex items-start gap-3 sm:gap-4">
											<div className="flex-shrink-0 w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-pink-100 flex items-center justify-center">
												<svg
													xmlns="http://www.w3.org/2000/svg"
													className="w-5 h-5 sm:w-6 sm:h-6 text-pink-600"
													fill="none"
													stroke="currentColor"
													viewBox="0 0 640 640"
												>
													<path
														strokeLinecap="round"
														strokeLinejoin="round"
														strokeWidth={40}
														d="M184 120C184 89.1 209.1 64 240 64L264 64C281.7 64 296 78.3 296 96L296 544C296 561.7 281.7 576 264 576L232 576C202.2 576 177.1 555.6 170 528C169.3 528 168.7 528 168 528C123.8 528 88 492.2 88 448C88 430 94 413.4 104 400C84.6 385.4 72 362.2 72 336C72 305.1 89.6 278.2 115.2 264.9C108.1 252.9 104 238.9 104 224C104 179.8 139.8 144 184 144L184 120zM456 120L456 144C500.2 144 536 179.8 536 224C536 239 531.9 253 524.8 264.9C550.5 278.2 568 305 568 336C568 362.2 555.4 385.4 536 400C546 413.4 552 430 552 448C552 492.2 516.2 528 472 528C471.3 528 470.7 528 470 528C462.9 555.6 437.8 576 408 576L376 576C358.3 576 344 561.7 344 544L344 96C344 78.3 358.3 64 376 64L400 64C430.9 64 456 89.1 456 120z"
													/>
												</svg>
											</div>
											<div className="flex-1">
												<h3 className="text-md sm:text-md font-bold text-black mb-1">
													AI-Powered Email Understanding
												</h3>
												<p className="text-[10px] sm:text-sm text-[#656565] leading-relaxed">
													Uses AI to automatically read and understand email
													intent and content.
												</p>
											</div>
										</div>

										{/* Feature 2 */}
										<div className="flex items-start gap-3 sm:gap-4">
											<div className="flex-shrink-0 w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-blue-100 flex items-center justify-center">
												<svg
													xmlns="http://www.w3.org/2000/svg"
													viewBox="0 0 24 24"
													fill="none"
													stroke="currentColor"
													className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600"
													strokeWidth="2"
													strokeLinecap="round"
													strokeLinejoin="round"
												>
													<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
													<polyline points="14 2 14 8 20 8" />
													<path d="M12 18v-6" />
													<path d="m9 15 3 3 3-3" />
												</svg>
											</div>
											<div className="flex-1">
												<h3 className="text-md sm:text-md font-bold text-black mb-1">
													Automatic Key Data Extraction
												</h3>
												<p className="text-[10px] sm:text-sm text-[#656565] leading-relaxed">
													Extracts and organizes key business info like leads,
													client names, contacts, and requests.
												</p>
											</div>
										</div>

										{/* Feature 3 */}
										<div className="flex items-start gap-3 sm:gap-4">
											<div className="flex-shrink-0 w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-orange-100 flex items-center justify-center">
												<svg
													className="w-5 h-5 sm:w-6 sm:h-6 text-orange-600"
													fill="none"
													stroke="currentColor"
													viewBox="0 0 24 24"
												>
													<path
														strokeLinecap="round"
														strokeLinejoin="round"
														strokeWidth={2}
														d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
													/>
												</svg>
											</div>
											<div className="flex-1">
												<h3 className="text-md sm:text-md font-bold text-black mb-1">
													Structured CRM & System Integration
												</h3>
												<p className="text-[10px] sm:text-sm text-[#656565] leading-relaxed">
													Converts unstructured emails into structured data for
													CRMs.
												</p>
											</div>
										</div>

										{/* Feature 4 */}
										<div className="flex items-start gap-3 sm:gap-4">
											<div className="flex-shrink-0 w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-blue-100 flex items-center justify-center">
												<svg
													className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600"
													fill="none"
													stroke="currentColor"
													viewBox="0 0 24 24"
												>
													<path
														strokeLinecap="round"
														strokeLinejoin="round"
														strokeWidth={2}
														d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
													/>
												</svg>
											</div>
											<div className="flex-1">
												<h3 className="text-md sm:text-md font-bold text-black mb-1">
													End-to-End Automation
												</h3>
												<p className="text-[10px] sm:text-sm text-[#656565] leading-relaxed">
													Eliminates repetitive manual tasks like reading,
													sorting, tagging, and data entry.
												</p>
											</div>
										</div>

										{/* Feature 5 */}
										<div className="flex items-start gap-3 sm:gap-4">
											<div className="flex-shrink-0 w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-gray-100 flex items-center justify-center">
												<svg
													className="w-5 h-5 sm:w-6 sm:h-6 text-gray-600"
													fill="none"
													stroke="currentColor"
													viewBox="0 0 24 24"
												>
													<path
														strokeLinecap="round"
														strokeLinejoin="round"
														strokeWidth={2}
														d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
													/>
												</svg>
											</div>
											<div className="flex-1">
												<h3 className="text-md sm:text-md font-bold text-black mb-1">
													70% Time Savings
												</h3>
												<p className="text-[10px] sm:text-sm text-[#656565] leading-relaxed">
													Drastically reduces manual email handling.
												</p>
											</div>
										</div>

										{/* Feature 6 */}
										<div className="flex items-start gap-3 sm:gap-4">
											<div className="flex-shrink-0 w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-yellow-100 flex items-center justify-center">
												<svg
													className="w-5 h-5 sm:w-6 sm:h-6 text-yellow-600"
													fill="none"
													stroke="currentColor"
													viewBox="0 0 24 24"
												>
													<path
														strokeLinecap="round"
														strokeLinejoin="round"
														strokeWidth={2}
														d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
													/>
												</svg>
											</div>
											<div className="flex-1">
												<h3 className="text-md sm:text-md font-bold text-black mb-1">
													Lower Operational Costs
												</h3>
												<p className="text-[10px] sm:text-sm text-[#656565] leading-relaxed">
													Fewer hours spent on repetitive admin work.
												</p>
											</div>
										</div>
									</div>
								</div>

								{/* Bottom Text */}
								<div className="mt-6 sm:mt-8 pt-6 sm:pt-8 border-t-2 border-[#8BC6A5] p-4">
									<p className="text-base sm:text-lg font-bold text-black">
										Connect Gmail & Start AI Extraction
									</p>
								</div>
							</div>
						</div>
						{/* Right Panel - Gmail Connect */}
						<div className="w-full max-w-lg mt-56 ">
							{/* Card Container with Glassmorphism */}
							<div className="bg-white/95 dark:bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/20 p-8 sm:p-10 lg:p-12 transform transition-all duration-300 hover:scale-[1.02]">
								{/* Logo/Icon Section */}
								<div className="text-center mb-8">
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
									<div className="pt-4 border-t border-[#8BC6A5]">
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
			</div>
		</div>
	);
}
