import React, { useState, useRef, useEffect } from "react";

export default function UserRegistrationForm() {
  const [step, setStep] = useState("form");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isFlipping, setIsFlipping] = useState(false);
  const [formError, setFormError] = useState(null);
  const [userDetails, setUserDetails] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  const containerRef = useRef(null);

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

  const handleFormSubmit = async () => {
    setFormError(null);
    setIsLoading(true);

    if (!email.trim()) {
      setFormError("Email is required");
      setIsLoading(false);
      return;
    }
    const emailRegex = /^[\s\S]+@[\s\S]+\.[\s\S]+$/;
    if (!emailRegex.test(email)) {
      setFormError("Please enter a valid email address");
      setIsLoading(false);
      return;
    }
    if (!password.trim()) {
      setFormError("Password is required");
      setIsLoading(false);
      return;
    }

    try {
      console.log(`Attempting login for ${email}`);
      const loginRes = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const loginData = await loginRes.json();

      if (loginRes.ok) {
        console.log("Login successful", loginData);
        if (loginData.status === 'approved') {
            await fetchUserDetailsAndProceed(email, "dashboard", "right");
        } else {
            console.log(`User ${email} logged in but status is ${loginData.status}. Proceeding to Veriff.`);
            handleFlip("veriff", "right");
        }
      } else if (loginRes.status === 404 && loginData.code === 'EMAIL_NOT_FOUND') {
        console.log(`Email ${email} not found, proceeding with registration.`);
        const registerRes = await fetch("/api/save-registration", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });

        const registerData = await registerRes.json();

        if (registerRes.ok) {
          console.log("Registration data saved, proceeding to Veriff");
          handleFlip("veriff", "right");
        } else {
          console.error("Registration save failed:", registerData);
          setFormError(registerData.error || "Failed to save registration details.");
        }
      } else if (loginRes.status === 401 && loginData.code === 'INCORRECT_PASSWORD') {
        console.log(`Incorrect password for ${email}`);
        setFormError("Incorrect password for this email address.");
      } else {
        console.error("Login failed:", loginData);
        setFormError(loginData.error || "An unexpected error occurred during login.");
      }
    } catch (error) {
      console.error("Error during form submission:", error);
      setFormError("An error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const fetchUserDetailsAndProceed = async (userEmail, nextStep, direction) => {
    setIsLoading(true);
    try {
      console.log(`Fetching user details for ${userEmail}`);
      const detailsRes = await fetch(`/api/get-user-details?email=${encodeURIComponent(userEmail)}`);
      if (!detailsRes.ok) {
        throw new Error(`Failed to fetch user details: ${detailsRes.statusText}`);
      }
      const detailsData = await detailsRes.json();
      console.log("User details fetched:", detailsData);
      setUserDetails(detailsData);
      handleFlip(nextStep, direction);
    } catch (error) {
      console.error("Error fetching user details:", error);
      setFormError("Could not load user data. Please try logging in again.");
      handleFlip("form", "left");
    } finally {
        setIsLoading(false);
    }
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
        setFormError("Verification service failed to load. Please try again later.");
        return;
      }

      setFormError(null);

      try {
        console.log("Initializing Veriff with API key:", process.env.REACT_APP_VERIFF_API_KEY ? "API key exists" : "API key is missing");
        
        const veriff = window.Veriff({
          apiKey: process.env.REACT_APP_VERIFF_API_KEY,
          parentId: 'veriff-root',
          host: 'https://stationapi.veriff.com',
          onSession: function(err, response) {
            if (err) {
              console.error("Veriff session error:", err);
              setFormError("Failed to start verification session. Please try again.");
              handleFlip("form", "left");
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
      } catch (error) {
          console.error("Error mounting Veriff SDK:", error);
          setFormError("An unexpected error occurred while setting up verification.");
          handleFlip("form", "left");
      }
    }
  }, [step, email]);

  useEffect(() => {
    let intervalId;
    if (step === 'veriff-pending' && email) {
      console.log("Starting DB status polling for:", email);
      intervalId = setInterval(async () => {
        try {
          const response = await fetch(`/api/get-verification-status?email=${encodeURIComponent(email)}`);
          
          if (!response.ok) {
            if (response.status === 404) {
              console.log("Status not found yet, continuing poll...");
            } else {
              console.error("Status poll failed:", response.status, await response.text());
            }
            return; 
          }
          
          const data = await response.json();
          console.log("Poll DB status response:", data);

          if (data.status === 'approved') {
            console.log("Verification approved (from DB poll)!");
            clearInterval(intervalId);
            await fetchUserDetailsAndProceed(email, "dashboard", "right");
          } else if (data.status === 'declined' || data.status === 'expired' || data.status === 'abandoned') {
            console.log(`Verification status (from DB poll): ${data.status}`);
            clearInterval(intervalId);
            setFormError(`Verification ${data.status}. Please try again or contact support.`);
            handleFlip("form", "left");
          } else if (data.status === 'resubmitted') {
            console.log("Verification requires resubmission (from DB poll).");
          }
        } catch (error) {
          console.error("Error polling DB for verification status:", error);
        }
      }, 5000);
    }

    return () => {
      if (intervalId) {
        console.log("Stopping DB status polling for:", email);
        clearInterval(intervalId);
      }
    };
  }, [step, email]);

  return (
    <div
      ref={containerRef}
      className={`p-6 max-w-md mx-auto bg-gradient-to-br from-gray-100 to-gray-300 rounded-3xl shadow-xl transition-transform duration-300 relative border border-gray-300 will-change-transform ${step === 'form' ? 'form-step-height' : ''} ${step === 'dashboard' ? 'dashboard-step-height' : ''}`}
      style={{ minHeight: '500px' }}
    >
      <style>{`
        button { border-radius: 10px !important; }
        #veriff-root iframe { border: none; width: 100%; height: 450px; }
        
        .form-step-height {
          min-height: auto !important;
          height: auto;
          max-height: 450px;
        }
        .form-step-height > div {
             padding-top: 1rem;
             padding-bottom: 1rem;
        }
        .dashboard-step-height {
            min-height: 500px !important;
            height: auto;
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
              className="bg-yellow-400 hover:bg-yellow-300 text-black px-6 py-2 rounded-full shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={isLoading}
            >
              {isLoading ? (
                <span className="flex items-center justify-center">
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-black" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Processing...
                </span>
              ) : (
                "Continue / Login"
              )}
            </button>
          </div>
          {formError && (
            <p className="mt-4 text-center text-red-600 bg-red-100 p-3 rounded-lg border border-red-200">{formError}</p>
          )}
        </div>
      )}

      {step === "veriff" && (
        <div className="text-center space-y-4">
          <h2 className="text-xl font-semibold text-gray-700">Identity Verification</h2>
          {formError && (
             <p className="text-red-600 bg-red-100 p-3 rounded-lg border border-red-200 mb-4">{formError}</p>
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
           <button
            onClick={() => handleFlip("form", "left")}
            className="mt-6 px-5 py-2 bg-gray-500 hover:bg-gray-600 text-white rounded-lg shadow transition-colors"
           >
             Restart Registration
           </button>
         </div>
      )}

      {step === "dashboard" && userDetails && (
        <div className="text-left space-y-4">
          <h2 className="text-2xl font-semibold text-gray-800 text-center mb-6">✅ Welcome!</h2>
          <div className="bg-white p-4 rounded-lg shadow">
              <h3 className="font-semibold text-gray-700">Account Details</h3>
              <p><span className="font-medium">Email:</span> {userDetails.email}</p>
              <p><span className="font-medium">Status:</span> <span className={`font-semibold ${userDetails.status === 'approved' ? 'text-green-600' : 'text-orange-600'}`}>{userDetails.status}</span></p>
              {userDetails.createdAt && <p><span className="font-medium">Registered:</span> {new Date(userDetails.createdAt).toLocaleDateString()}</p>}
              {userDetails.lastUpdated && <p><span className="font-medium">Last Update:</span> {new Date(userDetails.lastUpdated).toLocaleString()}</p>}
          </div>
          {(userDetails.firstName || userDetails.lastName || userDetails.dateOfBirth) && (
              <div className="bg-white p-4 rounded-lg shadow">
                  <h3 className="font-semibold text-gray-700">Personal Information</h3>
                  {userDetails.firstName && <p><span className="font-medium">First Name:</span> {userDetails.firstName}</p>}
                  {userDetails.lastName && <p><span className="font-medium">Last Name:</span> {userDetails.lastName}</p>}
                  {userDetails.dateOfBirth && <p><span className="font-medium">Date of Birth:</span> {new Date(userDetails.dateOfBirth).toLocaleDateString()}</p>}
              </div>
          )}
          {(userDetails.documentType || userDetails.documentNumber || userDetails.documentExpiry || userDetails.documentCountry) && (
              <div className="bg-white p-4 rounded-lg shadow">
                  <h3 className="font-semibold text-gray-700">Verified Document</h3>
                  {userDetails.documentType && <p><span className="font-medium">Type:</span> {userDetails.documentType}</p>}
                  {userDetails.documentNumber && <p><span className="font-medium">Number:</span> {userDetails.documentNumber}</p>}
                  {userDetails.documentExpiry && <p><span className="font-medium">Expiry:</span> {new Date(userDetails.documentExpiry).toLocaleDateString()}</p>}
                  {userDetails.documentCountry && <p><span className="font-medium">Country:</span> {userDetails.documentCountry}</p>}
              </div>
          )}
           <div className="text-center mt-6">
             <button
               onClick={() => handleFlip("form", "left")}
               className="px-5 py-2 bg-gray-500 hover:bg-gray-600 text-white rounded-lg shadow transition-colors"
             >
               Logout
             </button>
           </div>
        </div>
      )}

      {step === "dashboard" && !userDetails && (
         <div className="text-center space-y-4">
           <h2 className="text-xl font-semibold text-gray-700">Loading Dashboard...</h2>
           <div className="mt-4 w-10 h-10 border-4 border-gray-300 border-t-blue-500 rounded-full animate-spin mx-auto"></div>
           <button 
             onClick={() => handleFlip("form", "left")}
             className="mt-4 px-5 py-2 bg-gray-500 hover:bg-gray-600 text-white rounded-lg shadow"
           >
             Back to Login
           </button>
         </div>
      )}
    </div>
  );
}
