import React, { useState, useRef, useEffect } from "react";

export default function UserRegistrationForm() {
  const [step, setStep] = useState("form");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [userToken, setUserToken] = useState(null);
  const [sumsubLoaded, setSumsubLoaded] = useState(false);
  const [verificationStatus, setVerificationStatus] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [idDetails, setIdDetails] = useState(null);
  const [applicantId, setApplicantId] = useState(null);
  
  const containerRef = useRef(null);
  const sumsubContainerRef = useRef(null);
  const snWrapperRef = useRef(null);
  const accessTokenRef = useRef(null);
  
  const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  // Handle animation when moving between steps
  const handleFlip = async (nextStep, direction = "right") => {
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
  };

  // Generate a unique externalUserId
  const generateExternalUserId = (email) => {
    // Create a simple hash based on email and timestamp
    const timestamp = new Date().getTime();
    return `${email.split('@')[0]}-${timestamp}`;
  };

  // Handle form submission to initiate verification
  const handleFormSubmit = async () => {
    if (!email || !password) {
      setError("Please fill in all required fields");
      return;
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
      const externalUserId = generateExternalUserId(email);
      setApplicantId(externalUserId);
      
      // Request access token from your backend
      const response = await fetch('/api/sumsub-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          externalUserId: externalUserId,
          levelName: 'basic-kyc-level', // Your Sumsub verification level name
          ttlInSecs: 600 // Token valid for 10 minutes
        }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to get verification token');
      }
      
      const data = await response.json();
      setUserToken(data.token);
      accessTokenRef.current = data.token;
      
      // Move to verification step
      handleFlip("verification", "right");
    } catch (err) {
      console.error("Error starting verification:", err);
      setError(err.message || "Failed to start verification");
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch the verification status of an applicant
  const fetchIdDetails = async () => {
    if (!applicantId) return;
    
    try {
      const response = await fetch(`/api/sumsub-id-data?applicantId=${applicantId}`);
      
      if (!response.ok) {
        console.warn("Couldn't fetch ID details");
        return;
      }
      
      const data = await response.json();
      
      if (data && data.documents && data.documents.length > 0) {
        const doc = data.documents[0];
        setIdDetails({
          name: `${doc.firstName || ''} ${doc.lastName || ''}`.trim() || 'Not Available',
          idNumber: doc.idNumber || 'Not Available',
          expiry: doc.expiryDate || 'Not Available',
          dob: doc.dateOfBirth || 'Not Available',
          country: doc.country || 'Not Available'
        });
      }
    } catch (err) {
      console.error("Error fetching ID details:", err);
    }
  };

  // Initialize Sumsub SDK once we have the token
  useEffect(() => {
    let snsInstance = null;
    
    const initSumsub = async () => {
      if (!userToken || !sumsubContainerRef.current || sumsubLoaded) {
        return;
      }
      
      try {
        // Load Sumsub WebSDK script if not already loaded
        if (!window.SumsubWebSdk) {
          const script = document.createElement('script');
          script.src = 'https://static.sumsub.com/idensic/static/sns-websdk-build.js';
          script.async = true;
          
          script.onload = () => initSDK();
          script.onerror = () => {
            setError("Failed to load Sumsub SDK");
            setIsLoading(false);
          };
          
          document.body.appendChild(script);
        } else {
          initSDK();
        }
      } catch (err) {
        console.error("Error initializing Sumsub:", err);
        setError("Failed to initialize verification");
        setIsLoading(false);
      }
    };
    
    const initSDK = () => {
      setIsLoading(true);
      
      try {
        const snWrapperElement = document.createElement('div');
        snWrapperElement.id = 'sumsub-websdk-container';
        sumsubContainerRef.current.appendChild(snWrapperElement);
        snWrapperRef.current = snWrapperElement;
        
        // Initialize Sumsub WebSDK
        snsInstance = window.SumsubWebSdk.init(
          accessTokenRef.current,
          {
            // These options control the appearance and behavior of the SDK
            uiConf: {
              customCssStr: `
                body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
                .title { color: #262626; }
                .button { background-color: #fbbf24 !important; color: #000 !important; }
                .button:hover { background-color: #f59e0b !important; }
              `,
              lang: 'en',
              //logo: 'https://your-logo-url.png', // Optional: add your company logo
              onboardingConf: {
                steps: {
                  IDENTITY: {
                    moduleLiveness: {
                      attemptsCount: 3
                    }
                  }
                }
              }
            },
            
            // Config for the communication flow
            apiUrl: 'https://api.sumsub.com',
            flowName: 'msdk-basic', // Your specific flow from Sumsub
            
            // Access token callback - critical for token refresh
            accessTokenExpirationHandler: async () => {
              try {
                // Get new token when the current one expires
                const response = await fetch('/api/sumsub-token', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ 
                    externalUserId: applicantId,
                    levelName: 'basic-kyc-level',
                    ttlInSecs: 600
                  }),
                });
                
                if (!response.ok) {
                  throw new Error('Failed to refresh token');
                }
                
                const data = await response.json();
                accessTokenRef.current = data.token;
                return data.token;
              } catch (err) {
                console.error("Error refreshing token:", err);
                setError("Session expired. Please try again.");
                return null;
              }
            },
            
            // Callbacks for different events
            events: {
              onMessage: (type, payload) => {
                console.log('Sumsub message:', type, payload);
              },
              onError: (error) => {
                console.error('Sumsub error:', error);
                setError(`Verification error: ${error.message || 'Unknown error'}`);
                setIsLoading(false);
              },
              onStateChange: (state) => {
                console.log('Sumsub state changed:', state);
                if (state === 'final') {
                  setVerificationStatus('pending');
                }
              },
              onDocUploaded: (docType, docStatus) => {
                console.log('Sumsub document uploaded:', docType, docStatus);
                if (docType === 'IDENTITY' && docStatus === 'completed') {
                  // Extract ID details when document is uploaded
                  fetchIdDetails();
                }
              },
              onApplicantSubmitted: (applicationId) => {
                console.log('Applicant submitted:', applicationId);
                setVerificationStatus('submitted');
                // Proceed to check verification status
                checkVerificationStatus(applicationId);
              },
              onApplicantResubmitted: (applicationId) => {
                console.log('Applicant resubmitted:', applicationId);
                setVerificationStatus('submitted');
                checkVerificationStatus(applicationId);
              },
              onInit: () => {
                console.log('Sumsub SDK initialized');
                setSumsubLoaded(true);
                setIsLoading(false);
              }
            }
          }
        );
      } catch (err) {
        console.error("Error in Sumsub initialization:", err);
        setError("Verification initialization failed");
        setIsLoading(false);
      }
    };
    
    initSumsub();
    
    // Cleanup function to destroy SDK instance
    return () => {
      if (snsInstance && snsInstance.destroy) {
        snsInstance.destroy();
      }
      
      if (snWrapperRef.current) {
        snWrapperRef.current.remove();
      }
    };
  }, [userToken, applicantId]);

  // Function to fetch verification status from backend
  const checkVerificationStatus = async (applicationId) => {
    try {
      setIsLoading(true);
      
      // Polling approach - in production, you would use webhooks
      const checkStatus = async () => {
        const response = await fetch(`/api/sumsub-status?applicantId=${applicantId || applicationId}`);
        
        if (!response.ok) {
          throw new Error('Failed to check verification status');
        }
        
        const data = await response.json();
        
        return data;
      };
      
      // Initial check
      let statusData = await checkStatus();
      
      if (statusData.reviewStatus === 'approved') {
        setVerificationStatus('approved');
        setIsLoading(false);
        handleFlip('success', 'right');
        return;
      }
      
      if (statusData.reviewStatus === 'denied') {
        setVerificationStatus('rejected');
        setIsLoading(false);
        setError(statusData.reviewResult?.moderationComment || 'Verification was rejected');
        return;
      }
      
      // If not immediately resolved, set up polling
      const interval = setInterval(async () => {
        try {
          statusData = await checkStatus();
          
          if (statusData.reviewStatus === 'approved') {
            clearInterval(interval);
            setVerificationStatus('approved');
            setIsLoading(false);
            handleFlip('success', 'right');
          } else if (statusData.reviewStatus === 'denied') {
            clearInterval(interval);
            setVerificationStatus('rejected');
            setIsLoading(false);
            setError(statusData.reviewResult?.moderationComment || 'Verification was rejected');
          }
        } catch (error) {
          console.error("Error in status check:", error);
        }
      }, 5000); // Check every 5 seconds
      
      // Stop checking after 2 minutes maximum
      setTimeout(() => {
        clearInterval(interval);
        setIsLoading(false);
        if (verificationStatus !== 'approved' && verificationStatus !== 'rejected') {
          setVerificationStatus('pending');
          setError("Verification is taking longer than expected. You'll be notified when it's complete.");
        }
      }, 120000);
      
    } catch (err) {
      console.error("Error checking verification status:", err);
      setError("Failed to get verification result");
      setIsLoading(false);
    }
  };

  // Retry verification if it failed
  const retryVerification = () => {
    setVerificationStatus(null);
    setError(null);
    
    // Force reload of Sumsub component
    if (snWrapperRef.current) {
      snWrapperRef.current.remove();
    }
    setSumsubLoaded(false);
    
    // Get new token and reinitialize
    handleFormSubmit();
  };

  // Cancel verification and go back to form
  const cancelVerification = () => {
    setUserToken(null);
    setVerificationStatus(null);
    setError(null);
    handleFlip('form', 'left');
  };

  // Card flip animation effect
  useEffect(() => {
    const card = containerRef.current;
    const handleMouseMove = (e) => {
      if (!card) return;
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      const rotateX = ((y - centerY) / centerY) * -5; // Reduced intensity
      const rotateY = ((x - centerX) / centerX) * 5;
      card.style.transform = `rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
    };
    
    const resetRotation = () => {
      if (!card) return;
      card.style.transform = "rotateX(0deg) rotateY(0deg)";
    };
    
    card?.addEventListener("mousemove", handleMouseMove);
    card?.addEventListener("mouseleave", resetRotation);
    
    return () => {
      card?.removeEventListener("mousemove", handleMouseMove);
      card?.removeEventListener("mouseleave", resetRotation);
    };
  }, []);

  // Render verification step with Sumsub integration
  const renderVerificationStep = () => {
    return (
      <div className="text-center space-y-4">
        <h2 className="text-xl font-semibold">
          Identity Verification
        </h2>
        
        {error && (
          <div className="bg-red-50 p-3 rounded-lg border border-red-200">
            <p className="text-red-600 text-sm">{error}</p>
          </div>
        )}
        
        <div 
          ref={sumsubContainerRef} 
          className="w-full min-h-[400px] border border-gray-300 rounded-lg bg-white overflow-hidden"
        >
          {isLoading && !sumsubLoaded && (
            <div className="flex flex-col items-center justify-center h-full p-6">
              <div className="w-12 h-12 border-4 border-gray-300 border-t-yellow-400 rounded-full animate-spin mb-4"></div>
              <p className="text-gray-600">Loading verification...</p>
            </div>
          )}
        </div>
        
        {verificationStatus === 'submitted' && (
          <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
            <p className="text-blue-700 font-medium">Verification in progress</p>
            <p className="text-blue-600 text-sm mt-1">
              We're processing your submission. This may take a few minutes.
            </p>
            <div className="mt-3 flex justify-center">
              <div className="w-8 h-8 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin"></div>
            </div>
          </div>
        )}
        
        {verificationStatus === 'rejected' && (
          <div className="bg-red-50 p-4 rounded-lg border border-red-200">
            <p className="text-red-700 font-medium">Verification Failed</p>
            <p className="text-red-600 text-sm mt-1">
              We couldn't verify your identity. Please try again.
            </p>
            <div className="flex justify-center space-x-4 mt-3">
              <button
                onClick={retryVerification}
                className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg shadow"
              >
                Try Again
              </button>
              <button
                onClick={cancelVerification}
                className="px-4 py-2 bg-gray-500 hover:bg-gray-600 text-white rounded-lg shadow"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
        
        {!error && verificationStatus !== 'submitted' && verificationStatus !== 'rejected' && (
          <div className="text-sm text-gray-600">
            <p>Complete the verification process above to continue</p>
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      ref={containerRef}
      className="p-6 max-w-md mx-auto bg-gradient-to-br from-gray-100 to-gray-300 rounded-3xl shadow-xl transition-transform duration-300 relative border border-gray-300 will-change-transform"
    >
      <style>{`
        button { border-radius: 10px !important; }
        #sumsub-websdk-container { min-height: 400px; }
      `}</style>
      
      {step === "form" && (
        <div className="space-y-4">
          <h2 className="text-2xl font-semibold text-gray-800">Register</h2>
          {error && (
            <div className="bg-red-50 p-3 rounded-lg border border-red-200">
              <p className="text-red-600 text-sm">{error}</p>
            </div>
          )}
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            className="w-full p-2 border border-gray-300 rounded-lg"
            required
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="w-full p-2 border border-gray-300 rounded-lg"
            required
          />
          <div className="flex justify-center">
            <button
              onClick={handleFormSubmit}
              disabled={isLoading}
              className={`${
                isLoading 
                  ? "bg-gray-400 cursor-not-allowed" 
                  : "bg-yellow-400 hover:bg-yellow-300"
              } text-black px-6 py-2 rounded-full shadow-md transition-colors`}
            >
              {isLoading ? "Loading..." : "Continue to Verification"}
            </button>
          </div>
        </div>
      )}

      {step === "verification" && renderVerificationStep()}

      {step === "success" && (
        <div className="text-center space-y-6">
          <div className="text-6xl mb-4">✅</div>
          <h2 className="text-2xl font-semibold text-gray-800">
            Registration Complete!
          </h2>
          <p className="text-gray-600">
            Your identity has been verified successfully.
          </p>
          {idDetails && (
            <div className="text-sm text-left p-4 bg-gray-50 rounded-lg">
              <h3 className="font-medium text-gray-700 mb-2">ID Details</h3>
              <p><span className="font-medium">Name:</span> {idDetails.name}</p>
              <p><span className="font-medium">ID Number:</span> {idDetails.idNumber}</p>
              <p><span className="font-medium">DOB:</span> {idDetails.dob}</p>
              <p><span className="font-medium">Country:</span> {idDetails.country}</p>
              <p><span className="font-medium">Expiry:</span> {idDetails.expiry}</p>
            </div>
          )}
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
