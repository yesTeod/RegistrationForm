import React, { useState, useRef, useEffect } from "react";

export default function UserRegistrationForm() {
  const [step, setStep] = useState("form");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isFlipping, setIsFlipping] = useState(false);
  const [veriffError, setVeriffError] = useState(null);

  const containerRef = useRef(null);
  const pollingIntervalRef = useRef(null); // Ref to store interval ID

  const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  const handleFlip = async (nextStep, direction = "right") => {
    if (isFlipping) return;
    setIsFlipping(true);
    const card = containerRef.current;
    if (card) {
      card.style.transition = "transform 0.6s ease";
      card.style.transform =
        direction === "left" ? "rotateY(-90deg)" : "rotateY(90deg)";
    }
    await delay(600);
    setStep(nextStep);
    if (card) card.style.transform = "rotateY(0deg)";
    await delay(600);
    setIsFlipping(false);
  };

  const handleFormSubmit = () => {
    // Validate both email and password before proceeding
    if (!email.trim()) {
      setVeriffError("Email is required");
      return;
    }
    
    // Simple email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setVeriffError("Please enter a valid email address");
      return;
    }
    
    if (!password.trim()) {
      setVeriffError("Password is required");
      return;
    }
    
    // Clear any previous errors
    setVeriffError(null);
    
    // Proceed with verification
    handleFlip("veriff", "right");
  };

  useEffect(() => {
    const card = containerRef.current;
    const handleMouseMove = (e) => {
      if (isFlipping || !card) return;
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      const rotateX = ((y - centerY) / centerY) * -10;
      const rotateY = ((x - centerX) / centerX) * 10;
      card.style.transform = `rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
    };
    const resetRotation = () => {
      if (isFlipping || !card) return;
      card.style.transform = "rotateX(0deg) rotateY(0deg)";
    };
    card?.addEventListener("mousemove", handleMouseMove);
    card?.addEventListener("mouseleave", resetRotation);
    return () => {
      card?.removeEventListener("mousemove", handleMouseMove);
      card?.removeEventListener("mouseleave", resetRotation);
    };
  }, [isFlipping]);

  useEffect(() => {
    if (step === "veriff") {
      if (typeof window.Veriff === 'undefined' || typeof window.veriffSDK === 'undefined') {
        console.error("Veriff SDK scripts not loaded.");
        setVeriffError("Verification service failed to load. Please try again later.");
        return;
      }

      setVeriffError(null);

      try {
        console.log("Initializing Veriff with API key:", process.env.REACT_APP_VERIFF_API_KEY ? "API key exists" : "API key is missing");
        
        const veriff = window.Veriff({
          apiKey: process.env.REACT_APP_VERIFF_API_KEY,
          parentId: 'veriff-root',
          host: 'https://stationapi.veriff.com',
          onSession: function(err, response) {
            if (err) {
              console.error("Veriff session error:", err);
              setVeriffError("Failed to start verification session. Please try again.");
              return;
            }
            console.log("Veriff session created successfully:", response);
            console.log("Verification ID:", response.verification?.id);
            console.log("Verification URL:", response.verification?.url);
            window.veriffSDK.createVeriffFrame({ url: response.verification.url });
            setStep("veriff-pending");
          }
        });

        console.log("Setting Veriff parameters with email:", email);
        veriff.setParams({
          person: {
          },
          vendorData: email
        });

        console.log("Mounting Veriff component");
        veriff.mount({
          formLabel: {
            vendorData: "Email"
          }
        });

        // --- Add event listener for Veriff iframe messages ---
        const handleVeriffMessage = (event) => {
          // Log ALL messages received to see what's coming through
          console.log("Raw message received:", event);

          // Ensure message is from Veriff
          if (event.origin !== 'https://stationapi.veriff.com') { 
            return;
          }

          console.log("Received message from Veriff:", event.data);

          if (event.data === 'CANCELED') {
            console.log("Verification cancelled by user (detected via postMessage).");
            // Clear polling if it's running
            if (pollingIntervalRef.current) {
              clearInterval(pollingIntervalRef.current);
              pollingIntervalRef.current = null;
              console.log("Polling stopped due to cancellation.");
            }
            setVeriffError("Verification process was cancelled.");
            handleFlip("form", "left"); // Go back to form
          } 
          // Optionally handle 'FINISHED' if needed, though polling handles success/failure
          // else if (event.data === 'FINISHED') {
          //   console.log("Verification finished (postMessage). Polling will determine outcome.");
          // }
        };

        window.addEventListener('message', handleVeriffMessage);

        // Cleanup function for the effect
        return () => {
          console.log("Cleaning up Veriff message listener.");
          window.removeEventListener('message', handleVeriffMessage);
        };
        // --- End event listener logic ---

      } catch (error) {
          console.error("Error mounting Veriff SDK:", error);
          setVeriffError("An unexpected error occurred while setting up verification.");
      }
    }
  }, [step, email]);

  // Effect to poll the NEW /api/get-verification-status endpoint
  useEffect(() => {
    // Clear previous interval if it exists (e.g., if email changes)
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }

    if (step === 'veriff-pending' && email) {
      console.log("Starting DB status polling for:", email);
      pollingIntervalRef.current = setInterval(async () => { // Store interval ID in ref
        try {
          // Poll the new serverless function endpoint, passing email as a query param
          const response = await fetch(`/api/get-verification-status?email=${encodeURIComponent(email)}`);
          
          if (!response.ok) {
            // Handle non-2xx responses (e.g., 404 if status not found yet, 500 for server errors)
            if (response.status === 404) {
              console.log("Status not found yet, continuing poll...");
            } else {
              console.error("Status poll failed:", response.status, await response.text());
              // Maybe stop polling after too many failures?
            }
            return; 
          }
          
          const data = await response.json();
          console.log("Poll DB status response:", data);

          // Check the status received from the database via the API
          if (data.status === 'approved') {
            console.log("Verification approved (from DB poll)!");
            clearInterval(pollingIntervalRef.current); // Stop polling using ref
            pollingIntervalRef.current = null;
            handleFlip("success", "right"); // Move to success step
          } else if (data.status === 'declined' || data.status === 'expired' || data.status === 'abandoned') {
            console.log(`Verification status (from DB poll): ${data.status}`);
            clearInterval(pollingIntervalRef.current); // Stop polling using ref
            pollingIntervalRef.current = null;
            setVeriffError(`Verification ${data.status}. Please try again or contact support.`);
            handleFlip("form", "left"); // Go back to form with error
          } else if (data.status === 'resubmitted') {
            console.log("Verification requires resubmission (from DB poll).");
            // Decide how to handle resubmission - maybe stop polling and show message?
            // Or keep polling if Veriff might update again.
            // For now, just log and continue polling.
          }
          // If status is 'pending' or any other non-final state, the interval continues

        } catch (error) {
          console.error("Error polling DB for verification status:", error);
          // Optionally stop polling on network errors
          // clearInterval(intervalId);
        }
      }, 5000); // Poll every 5 seconds (adjust as needed)
    }

    // Cleanup function to clear interval when step changes, email changes, or component unmounts
    return () => {
      if (pollingIntervalRef.current) {
        console.log("Stopping DB status polling for:", email);
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, [step, email]); // Depend on step and email

  return (
    <div
      ref={containerRef}
      className={`p-6 max-w-md mx-auto bg-gradient-to-br from-gray-100 to-gray-300 rounded-3xl shadow-xl transition-transform duration-300 relative border border-gray-300 will-change-transform ${step === 'form' ? 'form-step-height' : ''}`}
      style={{ minHeight: '500px' }}
    >
      <style>{`
        button { border-radius: 10px !important; }
        #veriff-root iframe { border: none; width: 100%; height: 450px; }
        
        .form-step-height {
          min-height: auto !important;
          height: auto;
          max-height: 400px;
        }
        .form-step-height > div {
             padding-top: 1rem;
             padding-bottom: 1rem;
        }
      `}</style>
      {step === "form" && (
        <div className="space-y-3">
          <h2 className="text-xl font-semibold text-gray-800">Register</h2>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            className="w-full p-2 border border-gray-300 rounded-lg"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="w-full p-2 border border-gray-300 rounded-lg"
          />
          <div className="flex justify-center">
            <button
              onClick={handleFormSubmit}
              className="bg-yellow-400 hover:bg-yellow-300 text-black px-6 py-2 rounded-full shadow-md"
            >
              Continue to Verification
            </button>
          </div>
          {veriffError && (
            <p className="mt-4 text-center text-red-600 bg-red-100 p-3 rounded-lg border border-red-200">{veriffError}</p>
          )}
        </div>
      )}

      {step === "veriff" && (
        <div className="text-center space-y-4">
          <h2 className="text-xl font-semibold text-gray-700">Identity Verification</h2>
          {veriffError && (
            <p className="text-red-600 bg-red-100 p-3 rounded-lg border border-red-200">{veriffError}</p>
          )}
          <p className="text-gray-600">Loading verification process...</p>
          <div id="veriff-root" className="w-full"></div>
          <button
            onClick={() => handleFlip("form", "left")}
            className="mt-4 px-5 py-2 bg-gray-500 hover:bg-gray-600 text-white rounded-lg shadow transition-colors"
          >
            Back
          </button>
        </div>
      )}

      {step === "veriff-pending" && (
         <div className="text-center space-y-4">
           <h2 className="text-xl font-semibold text-gray-700">Verification in Progress</h2>
           <p className="text-gray-600">Please complete the identity verification steps presented by Veriff.</p>
           <p className="text-sm text-gray-500 mt-4">Once completed, your registration status will be updated automatically.</p>
           <div className="mt-4 w-10 h-10 border-4 border-gray-300 border-t-blue-500 rounded-full animate-spin mx-auto"></div>
         </div>
      )}

      {step === "success" && (
        <div className="text-center space-y-6">
          <div className="text-6xl mb-4">✅</div>
          <h2 className="text-2xl font-semibold text-gray-800">
            Registration Complete!
          </h2>
          <p className="text-gray-600">
            Your identity has been verified successfully.
          </p>
          <button
            onClick={() => window.location.href = "/dashboard"}
            className="px-8 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg shadow-md"
          >
            Go to Dashboard
          </button>
        </div>
      )}
    </div>
  );
}
