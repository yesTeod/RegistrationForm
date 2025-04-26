import React, { useState, useEffect, useRef } from "react";
import snsWebSdk from '@sumsub/websdk'; // Import Sumsub SDK

export default function UserRegistrationForm() {
  // --- State Variables ---
  const [step, setStep] = useState("form"); // 'form', 'sumsub', 'success'
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [sumsubAccessToken, setSumsubAccessToken] = useState(null);
  const [isSumsubLoading, setIsSumsubLoading] = useState(false);
  const [sumsubError, setSumsubError] = useState(null);
  const sumsubContainerRef = useRef(null); // Ref for the Sumsub container

  // --- Refs (Keep containerRef if needed for styling/animation, remove others) ---
  const containerRef = useRef(null); // Keep for potential styling/animation
  // Remove: videoRef, faceVideoRef, canvasRef, faceCanvasRef, fileInputRef, selfieInputRef, streamRef, lastDetectionTime

  // --- Helper Functions ---
  const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  // --- Sumsub Integration ---

  // Function to fetch a new access token from your backend
  const fetchSumsubToken = async () => {
    try {
      // Replace with your actual API endpoint
      const response = await fetch('/api/sumsub-token', {
        method: 'POST', // or 'GET', depending on your backend setup
        headers: {
          'Content-Type': 'application/json',
          // Include any necessary auth headers if required by your backend
        },
        // Add body if needed, e.g., { userId: 'some-user-id' }
        // body: JSON.stringify({ email }) // Example: pass email to associate token
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Failed to fetch token' }));
        throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      if (!data.accessToken) {
        throw new Error("Access token not found in response");
      }
      return data.accessToken;
    } catch (error) {
      console.error("Error fetching Sumsub token:", error);
      setSumsubError(`Failed to initialize verification: ${error.message}`);
      setIsSumsubLoading(false); // Ensure loading state is turned off on error
      return null; // Indicate failure
    }
  };


  // Initialize and launch the Sumsub WebSDK
  const launchWebSdk = (accessToken) => {
    if (!sumsubContainerRef.current) {
        console.error("Sumsub container element not found.");
        setSumsubError("Failed to initialize verification: UI element missing.");
        setIsSumsubLoading(false);
        return;
    }
    
    // Ensure the container is empty before launching
    sumsubContainerRef.current.innerHTML = '';

    try {
        let snsWebSdkInstance = snsWebSdk.init(
            accessToken,
            // Token update callback: fetch a new token when the current one expires
            () => fetchSumsubToken()
        )
        .withConf({
            lang: 'en', // Set language
            // Add other configurations if needed (e.g., custom translations, UI settings)
            // email: email, // Optionally pre-fill email
            // phone: '', // Optionally pre-fill phone
            // uiConf: {
            //     customCss: "https://url.com/styles.css" // Example customization
            // }
        })
        .on('onError', (error) => {
            // General SDK errors
            console.error('Sumsub SDK Error:', error);
            setSumsubError(`Verification error: ${error?.message || 'Unknown SDK error'}`);
            // Optionally revert step or show error message
            // setStep('form'); // Example: Go back to form on critical error
            setIsSumsubLoading(false);
        })
        .onMessage((type, payload) => {
            // Handle different messages from the SDK
            console.log('Sumsub Message:', type, payload);

            // Example: Check for completion status
            // The exact message type/payload might vary based on your flow and Sumsub version.
            // Consult Sumsub documentation for the specific messages for 'id-and-liveness'.
            if (type === 'idCheck.stepCompleted' && payload?.step === 'liveness' && payload?.status === 'success') {
                 console.log('Liveness check successful');
                 // Verification successful (or at least this step is)
                 setStep("success");
                 setIsSumsubLoading(false); // Turn off loading indicator
            } else if (type === 'idCheck.applicantStatus' && payload?.reviewStatus === 'completed') {
                 // This might be another way to check completion, depending on config
                 if (payload?.reviewResult?.reviewAnswer === 'GREEN') {
                    console.log('Applicant status is GREEN');
                    setStep("success");
                 } else {
                    console.log('Applicant status is not GREEN:', payload?.reviewResult?.reviewAnswer);
                    setSumsubError(`Verification completed but requires review or was rejected: ${payload?.reviewResult?.reviewAnswer}`);
                    // Handle RED/other statuses (e.g., show message, redirect)
                 }
                 setIsSumsubLoading(false);
            }
            // Add more handlers as needed for different messages (e.g., user actions, step changes)
        })
        .build();

        // Launch the SDK in the designated container
        snsWebSdkInstance.launch(sumsubContainerRef.current); // Pass the DOM element directly
        setStep("sumsub"); // Move to the Sumsub step
        setIsSumsubLoading(false); // SDK launched, stop loading indicator

    } catch (initError) {
         console.error("Error initializing Sumsub SDK:", initError);
         setSumsubError(`Failed to initialize verification: ${initError.message}`);
         setIsSumsubLoading(false);
    }
  };

  // --- Event Handlers ---

  const handleFormSubmit = async (e) => {
    e.preventDefault(); // Prevent default form submission
    setSumsubError(null); // Clear previous errors
    setIsSumsubLoading(true);

    const token = await fetchSumsubToken();

    if (token) {
      setSumsubAccessToken(token);
      // Launch SDK after token is fetched
      // Use a small delay to ensure state update and rendering before launching
      // setTimeout(() => launchWebSdk(token), 100);
      // Launch directly now that launchWebSdk handles container check
       launchWebSdk(token);
    } else {
      // Error handled within fetchSumsubToken, loading state also reset there
      console.log("Failed to get Sumsub token. Cannot proceed.");
    }
  };

  // Remove handleFlip, startCamera, stopCamera, capturePhoto, retakePhoto, handleSubmit (partially, replaced by handleFormSubmit),
  // detectFaceOnServer, verifyFace, handleRetryVerification, handleSelfieUpload, handleVerificationComplete,
  // compressImageForOCR, extractIdDetails


  // --- Effects ---

  // Remove useEffect for face detection and OCR extraction
  // Remove useEffect for card rotation unless you re-implement a similar effect

  // Clean up Sumsub SDK instance if component unmounts during verification
   useEffect(() => {
    // This effect now primarily focuses on cleanup if needed,
    // The SDK instance management is mostly within launchWebSdk
    return () => {
      // Sumsub SDK might have its own cleanup methods if needed,
      // but usually just removing the container is enough.
      // If snsWebSdkInstance was stored in state or ref, call instance.destroy() here.
      console.log("UserRegistrationForm unmounted");
    };
  }, []);


  // --- Rendering Logic ---

  return (
    <div
      ref={containerRef} // Keep ref if used for styles/animations
      className="p-6 max-w-md mx-auto bg-gradient-to-br from-gray-100 to-gray-300 rounded-3xl shadow-xl relative border border-gray-300"
    >
      <style>{`button { border-radius: 10px !important; }`}</style>

      {/* Step 1: Registration Form */}
      {step === "form" && (
        <form onSubmit={handleFormSubmit} className="space-y-4">
          <h2 className="text-2xl font-semibold text-gray-800">Register</h2>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            required
            className="w-full p-2 border border-gray-300 rounded-lg"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            required
            minLength={8} // Example: add basic validation
            className="w-full p-2 border border-gray-300 rounded-lg"
          />
          {isSumsubLoading && (
            <div className="text-center text-blue-600">
              Initializing verification...
            </div>
          )}
          {sumsubError && (
            <div className="text-center text-red-600 text-sm p-2 bg-red-50 rounded-lg border border-red-200">
              {sumsubError}
            </div>
          )}
          <div className="flex justify-center pt-2">
            <button
              type="submit"
              disabled={isSumsubLoading}
              className={`bg-yellow-400 hover:bg-yellow-300 text-black px-6 py-2 rounded-full shadow-md transition-opacity ${isSumsubLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {isSumsubLoading ? 'Loading...' : 'Continue to Verification'}
            </button>
          </div>
        </form>
      )}

      {/* Step 2: Sumsub Verification */}
      {step === "sumsub" && (
        <div>
          <h2 className="text-xl font-semibold text-center mb-4 text-gray-800">Identity Verification</h2>
          {isSumsubLoading && (
            <div className="text-center text-blue-600 py-10">Loading Verification Module...</div>
          )}
           {sumsubError && (
            <div className="text-center text-red-600 text-sm p-3 bg-red-50 rounded-lg border border-red-200 mb-4">
              {sumsubError}
            </div>
          )}
          {/* Container for the Sumsub WebSDK */}
          <div ref={sumsubContainerRef} id="sumsub-websdk-container" className="min-h-[500px]">
            {/* Sumsub SDK will inject its UI here */}
          </div>
           <button
              onClick={() => { setStep('form'); setSumsubError(null); /* Add any other cleanup */ }}
              className="mt-4 w-full px-4 py-2 bg-gray-500 hover:bg-gray-600 text-white rounded-lg shadow"
            >
              Cancel Verification
            </button>
        </div>
      )}

      {/* Step 3: Success */}
      {step === "success" && (
        <div className="text-center space-y-6 py-8">
          <div className="text-6xl mb-4">✅</div>
          <h2 className="text-2xl font-semibold text-gray-800">
            Verification Complete!
          </h2>
          <p className="text-gray-600">
            Your identity has been verified successfully. You can now proceed.
          </p>
          <button
            onClick={() => window.location.href = "/dashboard"} // Redirect to dashboard or next step
            className="px-8 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg shadow-md"
          >
            Go to Dashboard
          </button>
        </div>
      )}

      {/* Removed camera, completed, verification steps */}
      {/* Remove canvas and hidden inputs */}
    </div>
  );
}
