import React, { useState, useRef, useEffect } from "react";

export default function UserRegistrationForm() {
  const [step, setStep] = useState("form");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [photoFront, setPhotoFront] = useState(null);
  const [cameraAvailable, setCameraAvailable] = useState(true);
  const [cameraStatus, setCameraStatus] = useState("idle");
  const [isFlipping, setIsFlipping] = useState(false);
  const [faceDetected, setFaceDetected] = useState(false);
  const [mockMode, setMockMode] = useState(false);
  const [idDetails, setIdDetails] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [faceVerified, setFaceVerified] = useState(null);
  const [verifying, setVerifying] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [faceError, setFaceError] = useState(null);
  const [verificationAttempts, setVerificationAttempts] = useState(0);
  const [showRetryOptions, setShowRetryOptions] = useState(false);
  const [faceDetectionPaused, setFaceDetectionPaused] = useState(false);
  // Live verification state
  const [liveVerificationEnabled, setLiveVerificationEnabled] = useState(true);
  const [verificationProgress, setVerificationProgress] = useState(0);
  const [lastVerificationTime, setLastVerificationTime] = useState(0);
  const [consecutiveMatches, setConsecutiveMatches] = useState(0);

  const videoRef = useRef(null);
  const faceVideoRef = useRef(null);
  const canvasRef = useRef(null);
  const faceCanvasRef = useRef(null);
  const containerRef = useRef(null);
  const streamRef = useRef(null);
  const fileInputRef = useRef(null);
  const selfieInputRef = useRef(null);
  const lastDetectionTime = useRef(0);
  const verificationTimeoutRef = useRef(null);

  const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  // Handle file upload without compression.
  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    try {
      setIsUploading(true);
      const reader = new FileReader();
      reader.onload = (e) => {
        setPhotoFront(e.target.result);
        handleFlip("completed", "right");
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error("Error processing image:", error);
    } finally {
      setIsUploading(false);
    }
  };

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

  const startCamera = (facing = "environment", targetRef = videoRef) => {
    setCameraStatus("pending");
    // Request a higher resolution stream for a clear, crisp feed.
    navigator.mediaDevices
      .getUserMedia({
        video: {
          facingMode: { exact: facing },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      })
      .then((stream) => {
        streamRef.current = stream;
        if (targetRef.current) {
          targetRef.current.srcObject = stream;
          targetRef.current.play();
        }
        setCameraAvailable(true);
        setCameraStatus("active");
      })
      .catch(() => {
        setCameraAvailable(false);
        setCameraStatus("error");
        setMockMode(false);
      });
  };

  const stopCamera = () => {
    const stream = streamRef.current;
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  };

  const handleFormSubmit = () => {
    startCamera();
    handleFlip("camera", "right");
  };

  const capturePhoto = async () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      // Set canvas dimensions to match the video feed for a clear capture.
      canvas.width = video.videoWidth || 320;
      canvas.height = video.videoHeight || 240;
      const context = canvas.getContext("2d");
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imageData = canvas.toDataURL("image/png");
      setPhotoFront(imageData);
      stopCamera();
      handleFlip("completed", "right");
    }
  };

  const retakePhoto = async () => {
    startCamera();
    await delay(200);
    await handleFlip("camera", "left");
  };

  const handleSubmit = async () => {
    stopCamera();
    await delay(300); // wait for camera to stop cleanly
    await handleFlip("verification", "right");
    await delay(200); // wait for DOM to update
    
    // Reset all verification states
    setFaceVerified(null);
    setVerificationAttempts(0);
    setShowRetryOptions(false);
    setFaceDetectionPaused(false);
    setFaceDetected(false);
    setConsecutiveMatches(0);
    setVerificationProgress(0);
    lastDetectionTime.current = 0;
    setLastVerificationTime(0);
    
    // Start user-facing camera for face verification
    startCamera("user", faceVideoRef);
  };

  // Face detection with rate limiting
  const detectFaceOnServer = async (dataURL) => {
    // Check if throttling needed - only call API every 2 seconds
    const now = Date.now();
    if (now - lastDetectionTime.current < 2000 || faceDetectionPaused) {
      return; // Skip this detection cycle
    }
    
    setDetecting(true);
    setFaceError(null);
    lastDetectionTime.current = now;
    
    try {
      const res = await fetch('/api/detect-face', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: dataURL }),
      });
      const json = await res.json();
      if (!res.ok) {
        setFaceDetected(false);
        setFaceError(json.error || 'Detection error');
      } else {
        const wasDetected = faceDetected;
        setFaceDetected(json.faceDetected);
        
        // If face is detected and live verification is enabled, trigger verification immediately
        if (json.faceDetected && liveVerificationEnabled && !faceDetectionPaused) {
          // Pass the dataURL directly for verification
          attemptLiveVerification(dataURL);
        }
      }
    } catch (e) {
      setFaceDetected(false);
      setFaceError('Network error');
    } finally {
      setDetecting(false);
    }
  };

  // Live verification process
  const attemptLiveVerification = async (dataURL) => {
    const now = Date.now();
    // Only verify every 2 seconds to avoid too many API calls
    if (now - lastVerificationTime < 2000 || verifying || !liveVerificationEnabled || !photoFront) {
      return;
    }
    
    setVerifying(true);
    setLastVerificationTime(now);
    
    try {
      console.log("Attempting live verification...");
      const resp = await fetch('/api/verify-face', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idImage: photoFront, selfie: dataURL }),
      });
      
      if (!resp.ok) {
        console.error("Live face verification failed:", resp.status);
        setConsecutiveMatches(0);
        setVerificationProgress(prev => Math.max(0, prev - 20)); // Decrease progress
        return;
      }
      
      const data = await resp.json();
      console.log("Verification response:", data);
      
      // Update state based on verification result
      if (data.match) {
        console.log("Match detected");
        // Increase consecutive matches
        setConsecutiveMatches(prev => {
          const newCount = prev + 1;
          console.log("Consecutive matches:", newCount);
          
          // If we reached threshold, mark as verified
          if (newCount >= 3) {
            setFaceVerified(true);
            setFaceDetectionPaused(true);
          }
          
          return newCount;
        });
        
        // Increase progress
        setVerificationProgress(prev => {
          const newProgress = Math.min(100, prev + 25);
          
          // If we reached 100%, mark as verified
          if (newProgress >= 100) {
            setFaceVerified(true);
            setFaceDetectionPaused(true);
          }
          
          return newProgress;
        });
      } else {
        // Reset consecutive matches and decrease progress
        setConsecutiveMatches(0);
        setVerificationProgress(prev => Math.max(0, prev - 10));
      }
    } catch (err) {
      console.error("Live face verification error:", err);
      setConsecutiveMatches(0);
      setVerificationProgress(prev => Math.max(0, prev - 10));
    } finally {
      setVerifying(false);
    }
  };

  // On verification step, poll for face detection with rate limiting
  useEffect(() => {
    let interval;
    
    if (step === 'verification' && !faceDetectionPaused) {
      interval = setInterval(() => {
        if (faceCanvasRef.current && faceVideoRef.current && faceVideoRef.current.readyState >= 2) {
          const canvas = faceCanvasRef.current;
          const context = canvas.getContext("2d");
          const video = faceVideoRef.current;
          
          // Ensure canvas dimensions match video
          canvas.width = video.videoWidth || 320;
          canvas.height = video.videoHeight || 240;
          
          // Draw the current video frame to canvas
          context.drawImage(video, 0, 0, canvas.width, canvas.height);
          
          // Get image data for detection/verification
          const dataURL = canvas.toDataURL('image/png');
          
          // Send for face detection
          detectFaceOnServer(dataURL);
        }
      }, 1000); // Check every second, but API calls are throttled internally
    }
    
    return () => clearInterval(interval);
  }, [step, faceDetectionPaused, faceDetected, liveVerificationEnabled]);
  
  // Check verification progress and update status
  useEffect(() => {
    if (consecutiveMatches >= 3 || verificationProgress >= 100) {
      setFaceVerified(true);
      setFaceDetectionPaused(true);
    }
  }, [consecutiveMatches, verificationProgress]);

  // Manual verification function (fallback)
  const verifyFace = async () => {
    setVerifying(true);
    setShowRetryOptions(false);
    setFaceDetectionPaused(true); // Pause detection during verification
    
    try {
      if (!faceCanvasRef.current) {
        throw new Error("Camera not initialized");
      }
      
      const selfieDataURL = faceCanvasRef.current.toDataURL('image/png');
      
      const resp = await fetch('/api/verify-face', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idImage: photoFront, selfie: selfieDataURL }),
      });
      
      if (!resp.ok) {
        // Handle HTTP error responses (e.g., 400 Bad Request)
        const errorData = await resp.json().catch(() => ({ error: 'Unknown error' }));
        console.error("Face verification failed:", resp.status, errorData);
        setFaceVerified(false);
        setVerificationAttempts(prev => prev + 1);
        setShowRetryOptions(true);
        return;
      }
      
      const data = await resp.json();
      setFaceVerified(data.match);
      
      if (!data.match) {
        setVerificationAttempts(prev => prev + 1);
        setShowRetryOptions(true);
      }
    } catch (err) {
      console.error("Face verification error:", err);
      setFaceVerified(false);
      setVerificationAttempts(prev => prev + 1);
      setShowRetryOptions(true);
    } finally {
      setVerifying(false);
    }
  };

  // Reset verification state for retry
  const handleRetryVerification = () => {
    setFaceVerified(null);
    setShowRetryOptions(false);
    setFaceDetectionPaused(false);
    setConsecutiveMatches(0);
    setVerificationProgress(0);
    lastDetectionTime.current = 0; // Reset timer to allow immediate detection
    setLastVerificationTime(0);
  };

  // --- Verify via upload ---
  const handleSelfieUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setVerifying(true);
    setShowRetryOptions(false);
    setFaceDetectionPaused(true); // Pause detection during verification
    
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const dataURL = ev.target.result;
      try {
        const res = await fetch("/api/verify-face", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ idImage: photoFront, selfie: dataURL }),
        });
        
        if (!res.ok) {
          // Handle HTTP error responses
          const errorData = await res.json().catch(() => ({ error: 'Unknown error' }));
          console.error("Face verification failed:", res.status, errorData);
          setFaceVerified(false);
          setVerificationAttempts(prev => prev + 1);
          setShowRetryOptions(true);
          return;
        }
        
        const data = await res.json();
        setFaceVerified(data.match);
        
        if (!data.match) {
          setVerificationAttempts(prev => prev + 1);
          setShowRetryOptions(true);
        }
      } catch (err) {
        console.error("Face verification error:", err);
        setFaceVerified(false);
        setVerificationAttempts(prev => prev + 1);
        setShowRetryOptions(true);
      } finally {
        setVerifying(false);
      }
    };
    reader.readAsDataURL(file);
  };

  // Return to completed step or go to success if verification is successful
  const handleVerificationComplete = () => {
    if (faceVerified) {
      handleFlip("success", "right");
    } else {
      // This shouldn't typically happen as the button is only shown in success case
      handleFlip("completed", "left");
    }
  }

  // This helper function compresses the image dataURL for OCR.
  function compressImageForOCR(dataURL, quality = 0.9) {
    return new Promise((resolve) => {
      const img = new Image();
      img.src = dataURL;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        // Optionally, you can also reduce dimensions here if needed.
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        // Convert image to JPEG with the specified quality.
        const compressedDataURL = canvas.toDataURL('image/jpeg', quality);
        // Estimate file size in KB (base64 encoding approximates to 3/4 the length in bytes)
        const fileSizeKb = Math.round((compressedDataURL.length * (3 / 4)) / 1024);
        if (fileSizeKb > 1024 && quality > 0.1) {
          // Reduce quality further if file size is still too high.
          compressImageForOCR(dataURL, quality - 0.1).then(resolve);
        } else {
          resolve(compressedDataURL);
        }
      };
    });
  }

  async function extractIdDetails(imageData) {
    try {
      setIsExtracting(true);

      // Estimate file size and compress if necessary.
      const fileSizeKb = Math.round((imageData.length * (3 / 4)) / 1024);
      let processedImage = imageData;
      if (fileSizeKb > 1024) {
        processedImage = await compressImageForOCR(imageData);
      }

      const response = await fetch("/api/extract-id", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: processedImage }),
      });
      if (!response.ok) {
        throw new Error("OCR request failed");
      }
      const data = await response.json();
      if (data.error) {
        console.warn("API returned an error:", data.error);
      }
      return data;
    } catch (error) {
      console.error("Error extracting ID details:", error);
      return {
        name: "Not found",
        idNumber: "Not found",
        expiry: "Not found",
      };
    } finally {
      setIsExtracting(false);
    }
  }

  // Trigger OCR extraction when registration is completed.
  useEffect(() => {
    if (step === "completed" && photoFront && !idDetails && !isExtracting) {
      extractIdDetails(photoFront).then((details) => {
        console.log("Extracted ID Details:", details);
        if (details) {
          setIdDetails(details);
        }
      });
    }
  }, [step, photoFront, idDetails, isExtracting]);

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

  // Clean up when component unmounts
  useEffect(() => {
    return () => {
      stopCamera();
      if (verificationTimeoutRef.current) {
        clearTimeout(verificationTimeoutRef.current);
      }
    };
  }, []);

  const renderVerificationStepContent = () => {
    return (
      <div className="text-center space-y-4">
        <h2 className="text-xl font-semibold">
          Face Verification
        </h2>

        <div className="mx-auto w-80 h-60 relative overflow-hidden rounded-lg border">
          {/* Display guide overlay if verification is active */}
          {faceVerified === null && (
            <div className="absolute inset-0 pointer-events-none">
              <div className="w-48 h-48 border-2 border-dashed border-yellow-400 rounded-full mx-auto mt-4 opacity-60"></div>
              <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-32 h-32 border-2 border-yellow-400 rounded-full opacity-60"></div>
            </div>
          )}
          <video ref={faceVideoRef} autoPlay muted playsInline className="w-full h-full object-cover" />
          <canvas ref={faceCanvasRef} width={320} height={240} className="absolute top-0 left-0 opacity-0" />
          
          {/* Progress ring overlay for live verification */}
          {faceVerified === null && faceDetected && verificationProgress > 0 && (
            <div className="absolute inset-0 flex items-center justify-center">
              <svg className="w-48 h-48" viewBox="0 0 100 100">
                <circle 
                  cx="50" cy="50" r="45" 
                  fill="none" 
                  stroke="#EEE" 
                  strokeWidth="5" 
                  opacity="0.3"
                />
                <circle 
                  cx="50" cy="50" r="45" 
                  fill="none" 
                  stroke="#10B981" 
                  strokeWidth="5" 
                  strokeDasharray="283" 
                  strokeDashoffset={283 - (283 * verificationProgress / 100)}
                  transform="rotate(-90 50 50)"
                  strokeLinecap="round"
                  className="transition-all duration-300"
                />
                <text 
                  x="50" y="50" 
                  textAnchor="middle" 
                  dy=".3em" 
                  fill="#10B981" 
                  fontSize="18"
                  fontWeight="bold"
                >
                  {Math.round(verificationProgress)}%
                </text>
              </svg>
            </div>
          )}
        </div>

        {/* Status indicators */}
        {faceVerified === null && (
          <div className="text-sm">
            {detecting && <p className="text-blue-600">Detecting face...</p>}
            {!detecting && faceDetected && verifying && <p className="text-blue-600">Verifying identity...</p>}
            {!detecting && faceDetected && !verifying && <p className="text-green-600">Face detected - Verifying automatically</p>}
            {!detecting && !faceDetected && <p className="text-amber-600">No face detected, please align your face within the frame</p>}
            {faceError && <p className="text-red-600 text-xs">{faceError}</p>}
          </div>
        )}

        {/* Verification success message */}
        {faceVerified === true && (
          <div className="bg-green-100 p-4 rounded-lg border border-green-300">
            <p className="text-green-700 font-medium text-lg">Identity Verified</p>
            <p className="text-green-600 text-sm">Your face has been successfully matched with your ID.</p>
            <button 
              onClick={handleVerificationComplete}
              className="mt-3 px-5 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg shadow transition-colors"
            >
              Continue
            </button>
          </div>
        )}

        {/* Verification failure message with guidance */}
        {faceVerified === false && (
          <div className="bg-red-50 p-4 rounded-lg border border-red-200">
            <p className="text-red-700 font-medium text-lg">Verification Failed</p>
            <p className="text-red-600 text-sm mb-2">
              We couldn't match your face with the ID provided.
            </p>
            
            {showRetryOptions && (
              <div className="space-y-3 mt-2">
                <p className="text-gray-700 text-sm">Please try again with these tips:</p>
                <ul className="text-xs text-left list-disc pl-5 text-gray-600">
                  <li>Ensure good lighting on your face</li>
                  <li>Remove glasses or face coverings</li>
                  <li>Look directly at the camera</li>
                  <li>Avoid shadows on your face</li>
                </ul>
                
                <div className="flex flex-col space-y-2 mt-3">
                  <button
                    onClick={handleRetryVerification}
                    className="w-full px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg shadow"
                  >
                    Try Again
                  </button>
                  
                  {verificationAttempts >= 2 && (
                    <button
                      onClick={() => handleFlip("completed", "left")}
                      className="w-full px-4 py-2 bg-gray-500 hover:bg-gray-600 text-white rounded-lg shadow"
                    >
                      Back to ID Verification
                    </button>
                  )}
                  
                  {verificationAttempts >= 3 && (
                    <button
                      onClick={() => window.location.href = "/contact-support"}
                      className="w-full px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg shadow"
                    >
                      Contact Support
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Manual verification buttons - only show when live verification is active but not succeeded yet */}
        {faceVerified === null && (
          <div className="flex justify-center space-x-4">
            {/* Only show manual verification button if face detection has been active for a while without success */}
            <button
              onClick={verifyFace}
              disabled={!faceDetected || verifying}
              className={`px-4 py-2 rounded-full transition-colors ${
                faceDetected && !verifying
                  ? "bg-yellow-400 hover:bg-yellow-300 text-black"
                  : "bg-gray-300 text-gray-500 cursor-not-allowed"
              }`}
            >
              {verifying ? 'Verifying...' : 'Verify Manually'}
            </button>
            <button
              onClick={() => selfieInputRef.current.click()}
              disabled={verifying}
              className="px-4 py-2 bg-blue-500 hover:bg-blue-400 text-white rounded-full"
            >
              {verifying ? 'Uploading...' : 'Upload Selfie'}
            </button>
          </div>
        )}

        <input
          type="file"
          accept="image/*"
          ref={selfieInputRef}
          onChange={handleSelfieUpload}
          className="hidden"
        />
      </div>
    );
  };

  return (
    <div
      ref={containerRef}
      className="p-6 max-w-md mx-auto bg-gradient-to-br from-gray-100 to-gray-300 rounded-3xl shadow-xl transition-transform duration-300 relative border border-gray-300 will-change-transform"
    >
      <style>{`button { border-radius: 10px !important; }`}</style>
      {step === "form" && (
        <div className="space-y-4">
          <h2 className="text-2xl font-semibold text-gray-800">Register</h2>
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
              Continue
            </button>
          </div>
        </div>
      )}

      {step === "camera" && (
        <div className="text-center space-y-4">
          <h2 className="text-lg font-medium text-gray-700">
            Capture ID Front
          </h2>
          <div className="w-full h-60 bg-gray-300 flex items-center justify-center rounded overflow-hidden">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover rounded"
            />
            <canvas
              ref={canvasRef}
              width={320}
              height={240}
              className="hidden"
            />
          </div>
          <div className="flex flex-col md:flex-row justify-center gap-3 mt-4">
            <button
              onClick={capturePhoto}
              className="bg-yellow-400 hover:bg-yellow-300 text-black px-4 py-2 rounded-full shadow-md"
            >
              Capture Front
            </button>

            <input
              type="file"
              accept="image/*"
              ref={fileInputRef}
              onChange={handleFileUpload}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current.click()}
              disabled={isUploading}
              className="bg-blue-500 hover:bg-blue-400 text-white px-4 py-2 rounded-full shadow-md"
            >
              {isUploading ? "Processing..." : "Upload Image"}
            </button>
          </div>
        </div>
      )}

      {step === "completed" && (
        <div className="text-center space-y-6">
          <h2 className="text-2xl font-semibold text-gray-800">
            Registration Confirmation
          </h2>
          <h3 className="text-lg text-gray-700">Email: {email}</h3>
          <div className="relative w-full h-60 bg-gray-300 flex items-center justify-center rounded overflow-hidden">
            {photoFront ? (
              <img
                src={photoFront}
                alt="Front of ID"
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="text-gray-600 text-lg">Photo Missing</span>
            )}
          </div>
          <div className="text-sm text-gray-500 font-medium pt-1">
            Front of ID
          </div>
          <div className="mt-4 text-xs text-gray-600">
            {idDetails ? (
              <div>
                <p>
                  <strong>Name:</strong> {idDetails.name} {idDetails.fatherName}
                </p>
                <p>
                  <strong>ID No:</strong> {idDetails.idNumber}
                </p>
                <p>
                  <strong>Expiry:</strong> {idDetails.expiry}
                </p>
              </div>
            ) : isExtracting ? (
              <div className="flex flex-col items-center justify-center">
                <p>Scanning ID details...</p>
                <div className="mt-2 w-8 h-8 border-2 border-gray-300 border-t-yellow-400 rounded-full animate-spin"></div>
              </div>
            ) : (
              <button
                onClick={() =>
                  extractIdDetails(photoFront).then(setIdDetails)
                }
                className="px-4 py-1 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-full text-xs"
              >
                Scan ID Details
              </button>
            )}
          </div>
          <div className="flex justify-center gap-4 pt-2">
            <button
              onClick={() => retakePhoto()}
              className="px-5 py-2 bg-gray-800 text-white hover:bg-gray-700 transition shadow-md"
            >
              Retake Photo
            </button>
            <button
              onClick={handleSubmit}
              className="px-6 py-2 bg-yellow-400 hover:bg-yellow-300 text-black transition shadow-md"
            >
              Submit
            </button>
          </div>
        </div>
      )}

      {step === "verification" && renderVerificationStepContent()}

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
      
      <canvas ref={canvasRef} className="hidden" />
      <input type="file" ref={fileInputRef} accept="image/*" onChange={handleFileUpload} className="hidden" />
    </div>
  );
}
