import React, { useState, useRef, useEffect } from "react";
import * as faceapi from 'face-api.js';

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
  const [faceVerified, setFaceVerified] = useState(false);

  const videoRef = useRef(null);
  const faceVideoRef = useRef(null);
  const canvasRef = useRef(null);
  const faceCanvasRef = useRef(null);
  const containerRef = useRef(null);
  const streamRef = useRef(null);
  const fileInputRef = useRef(null);

  const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

useEffect(() => {
    async function loadModels() {
      const MODEL_URL = '/models';
      await Promise.all([
        faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
        faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
        faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
      ]);
    }
    loadModels();
  }, []);

  // Compute face descriptor from an image element
  async function computeDescriptor(imageEl) {
    const detection = await faceapi
      .detectSingleFace(imageEl)
      .withFaceLandmarks()
      .withFaceDescriptor();
    return detection ? detection.descriptor : null;
  }

  // Compare two descriptors; lower euclidean distance means more similar
  function isMatch(desc1, desc2, threshold = 0.4) {
    const dist = faceapi.euclideanDistance(desc1, desc2);
    return dist < threshold;
  }

  // Trigger verification when user submits ID and live stream is active
  useEffect(() => {
    if (step === 'verification' && photoFront && faceVideoRef.current) {
      (async () => {
        // Prepare ID image
        const idImg = new Image();
        idImg.src = photoFront;
        await idImg.decode();
        const idDesc = await computeDescriptor(idImg);

        // Capture live frame from video
        const canvas = document.createElement('canvas');
        canvas.width = faceVideoRef.current.videoWidth;
        canvas.height = faceVideoRef.current.videoHeight;
        canvas.getContext('2d').drawImage(
          faceVideoRef.current,
          0,
          0,
          canvas.width,
          canvas.height
        );
        const liveImg = new Image();
        liveImg.src = canvas.toDataURL();
        await liveImg.decode();
        const liveDesc = await computeDescriptor(liveImg);

        // Check match
        if (idDesc && liveDesc) {
          const match = isMatch(idDesc, liveDesc);
          setFaceVerified(match);
        }
      })();
    }
  }, [step, photoFront]);

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
    startCamera("user", faceVideoRef);
  };

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

  useEffect(() => {
    let interval;
    const tryStartDetection = () => {
      if (!faceVideoRef.current || !faceCanvasRef.current) return;
      const context = faceCanvasRef.current.getContext("2d");
      interval = setInterval(() => {
        if (!faceVideoRef.current || !faceCanvasRef.current) return;
        context.drawImage(faceVideoRef.current, 0, 0, 320, 240);
        const imageData = context.getImageData(100, 80, 120, 120).data;
        let brightPixels = 0;
        for (let i = 0; i < imageData.length; i += 4) {
          const avg = (imageData[i] + imageData[i + 1] + imageData[i + 2]) / 3;
          if (avg > 60) brightPixels++;
        }
        setFaceDetected(brightPixels > 300);
      }, 1000);
    };
    if (step === "verification" && cameraAvailable) {
      const video = faceVideoRef.current;
      if (video && video.readyState >= 2) {
        tryStartDetection();
      } else if (video) {
        video.onloadedmetadata = tryStartDetection;
      }
    }
    return () => clearInterval(interval);
  }, [step, cameraAvailable]);

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

      {step === "verification" && (
        <div className="text-center space-y-4">
          <h2 className="text-xl font-semibold text-gray-800">
            Face Verification
          </h2>
          <div className="w-[320px] h-[240px] mx-auto rounded-lg relative overflow-hidden">
            <video ref={faceVideoRef} autoPlay muted playsInline />
          {faceVerified
            ? <p style={{ color: 'green' }}>Face Matched ✔️</p>
            : <p style={{ color: 'red' }}>Face Not Matched ❌</p>
          }
            />
            <canvas
              ref={faceCanvasRef}
              width={320}
              height={240}
              className="top-0 left-0 w-full h-full z-20 opacity-40"
            />
            <div className="flex items-center justify-center pointer-events-none z-30">
              <div className="w-40 h-52 rounded-full border-4 border-yellow-300 flex items-center justify-center">
                <div className="w-32 h-44 rounded-full border-2 border-dashed border-yellow-400 opacity-70"></div>
              </div>
            </div>
          </div>
          <p
            className={`text-sm italic ${
              faceDetected ? "text-green-600" : "text-gray-600"
            }`}
          >
            {faceDetected
              ? "Face detected"
              : "Please align your face within the oval for verification."}
          </p>
        </div>
      )}
    </div>
  );
}
