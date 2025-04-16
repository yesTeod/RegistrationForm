import React, { useState, useRef, useEffect } from "react";
 
 export default function UserRegistrationForm() {
   const [step, setStep] = useState("form");
   const [email, setEmail] = useState("");
   const [password, setPassword] = useState("");
   const [photoFront, setPhotoFront] = useState(null);
   const [photoBack, setPhotoBack] = useState(null);
   const [capturingSide, setCapturingSide] = useState("front");
   const [cameraAvailable, setCameraAvailable] = useState(true);
   const [cameraStatus, setCameraStatus] = useState("idle");
   const [isFlipping, setIsFlipping] = useState(false);
   const [faceDetected, setFaceDetected] = useState(false);
   const [mockMode, setMockMode] = useState(false);
   const [previewIndex, setPreviewIndex] = useState(0);
   const [idDetails, setIdDetails] = useState(null); // state for extracted details
   const [isUploading, setIsUploading] = useState(false);
   const [isExtracting, setIsExtracting] = useState(false);

   const videoRef = useRef(null);
   const faceVideoRef = useRef(null);
   const canvasRef = useRef(null);
   const faceCanvasRef = useRef(null);
   const containerRef = useRef(null);
   const streamRef = useRef(null);
   const fileInputRef = useRef(null);
 
   const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

   // Function to compress an image file
   const compressImage = (file) => {
     return new Promise((resolve, reject) => {
       const reader = new FileReader();
       reader.readAsDataURL(file);
       reader.onload = (event) => {
         const img = new Image();
         img.src = event.target.result;
         img.onload = () => {
           const canvas = document.createElement('canvas');
           // Target width and height for compression
           const maxWidth = 800;
           const maxHeight = 600;
           let width = img.width;
           let height = img.height;
           
           // Maintain aspect ratio
           if (width > height) {
             if (width > maxWidth) {
               height = Math.round((height * maxWidth) / width);
               width = maxWidth;
             }
           } else {
             if (height > maxHeight) {
               width = Math.round((width * maxHeight) / height);
               height = maxHeight;
             }
           }
           
           canvas.width = width;
           canvas.height = height;
           const ctx = canvas.getContext('2d');
           ctx.drawImage(img, 0, 0, width, height);
           
           // Convert to lower quality JPEG
           const compressedImage = canvas.toDataURL('image/jpeg', 0.7);
           resolve(compressedImage);
         };
         img.onerror = (error) => reject(error);
       };
       reader.onerror = (error) => reject(error);
     });
   };

   // Handle file upload and compression
   const handleFileUpload = async (event) => {
     const file = event.target.files[0];
     if (!file) return;
     
     try {
       setIsUploading(true);
       const compressedImage = await compressImage(file);
       
       if (capturingSide === "front") {
         setPhotoFront(compressedImage);
         await handleFlip("camera", "right", "back");
       } else {
         setPhotoBack(compressedImage);
         await handleFlip("completed", "right");
       }
     } catch (error) {
       console.error("Error compressing image:", error);
     } finally {
       setIsUploading(false);
     }
   };
 
   // Function to extract ID details using OpenAI Vision API
   async function extractIdDetails(imageData) {
     try {
       setIsExtracting(true);
       const response = await fetch("/api/extract-id", {
         method: "POST",
         headers: { "Content-Type": "application/json" },
         body: JSON.stringify({ image: imageData })
       });
       if (!response.ok) {
         throw new Error("OCR request failed");
       }
       const data = await response.json();
       return data;
     } catch (error) {
       console.error("Error extracting ID details:", error);
       return null;
     } finally {
       setIsExtracting(false);
     }
   }
 
   const handleFlip = async (nextStep, direction = "right", nextCapturingSide = null) => {
     if (isFlipping) return;
     setIsFlipping(true);
     const card = containerRef.current;
     if (card) {
       card.style.transition = "transform 0.6s ease";
       card.style.transform = direction === "left" ? "rotateY(-90deg)" : "rotateY(90deg)";
     }
     await delay(600);
     setStep(nextStep);
     if (nextCapturingSide !== null) {
       setCapturingSide(nextCapturingSide);
     }
     if (card) card.style.transform = "rotateY(0deg)";
     await delay(600);
     setIsFlipping(false);
   };
 
   const startCamera = (facing = "environment", targetRef = videoRef) => {
     setCameraStatus("pending");
     navigator.mediaDevices.getUserMedia({ video: { facingMode: { exact: facing } } })
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
       stream.getTracks().forEach(track => track.stop());
       streamRef.current = null;
     }
   };
 
   const handleFormSubmit = () => {
     setCapturingSide("front");
     startCamera();
     handleFlip("camera", "right");
   };
 
   const capturePhoto = async () => {
     if (videoRef.current && canvasRef.current) {
       const context = canvasRef.current.getContext("2d");
       context.drawImage(videoRef.current, 0, 0, 320, 240);
       const imageData = canvasRef.current.toDataURL("image/png");
       if (capturingSide === "front") {
         setPhotoFront(imageData);
         await handleFlip("camera", "right", "back");
       } else {
         setPhotoBack(imageData);
         stopCamera();
         handleFlip("completed", "right");
       }
     }
   };
 
   const retakePhoto = async (side) => {
     setCapturingSide(side);
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
 
   // When the registration is confirmed (step "completed") trigger the OCR extraction.
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
             Capture {capturingSide === "front" ? "Front" : "Back"} of ID
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
               Capture {capturingSide === "front" ? "Front" : "Back"}
             </button>
             
             {capturingSide === "front" && (
               <>
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
                   {isUploading ? "Processing..." : "Upload Front Image"}
                 </button>
               </>
             )}
           </div>
         </div>
       )}
 
       {step === "completed" && (
         <div className="text-center space-y-6">
           <h2 className="text-2xl font-semibold text-gray-800">
             Registration Confirmation
           </h2>
           <h3 className="text-lg text-gray-700">Email: {email}</h3>
           <div className="flex items-center justify-center">
             <button
               onClick={() => setPreviewIndex(0)}
               className="w-10 h-10 mr-2 rounded-full bg-white/80 text-black flex items-center justify-center shadow-md transition-all duration-200 hover:bg-white hover:scale-110 focus:outline-none focus:ring-2 focus:ring-white/60"
             >
               <svg
                 xmlns="http://www.w3.org/2000/svg"
                 fill="none"
                 viewBox="0 0 24 24"
                 strokeWidth={2}
                 stroke="currentColor"
                 className="w-5 h-5"
               >
                 <path
                   strokeLinecap="round"
                   strokeLinejoin="round"
                   d="M15.75 19.5L8.25 12l7.5-7.5"
                 />
               </svg>
             </button>
             <div className="relative w-full h-60 bg-gray-300 flex items-center justify-center rounded overflow-hidden">
               {(previewIndex === 0 ? photoFront : photoBack) ? (
                 <img
                   src={previewIndex === 0 ? photoFront : photoBack}
                   alt={previewIndex === 0 ? "Front of ID" : "Back of ID"}
                   className="w-full h-full object-cover"
                 />
               ) : (
                 <span className="text-gray-600 text-lg">Photo Missing</span>
               )}
             </div>
             <button
               onClick={() => setPreviewIndex(1)}
               className="w-10 h-10 ml-2 rounded-full bg-white/80 text-black flex items-center justify-center shadow-md transition-all duration-200 hover:bg-white hover:scale-110 focus:outline-none focus:ring-2 focus:ring-white/60"
             >
               <svg
                 xmlns="http://www.w3.org/2000/svg"
                 fill="none"
                 viewBox="0 0 24 24"
                 strokeWidth={2}
                 stroke="currentColor"
                 className="w-5 h-5"
               >
                 <path
                   strokeLinecap="round"
                   strokeLinejoin="round"
                   d="M8.25 4.5l7.5 7.5-7.5 7.5"
                 />
               </svg>
             </button>
           </div>
           <div className="text-sm text-gray-500 font-medium pt-1">
             {previewIndex === 0 ? "Front of ID" : "Back of ID"}
           </div>
           {/* Display extracted ID details in a smaller text size */}
           <div className="mt-4 text-xs text-gray-600">
             {idDetails ? (
               <div>
                 <p><strong>Name:</strong> {idDetails.name}</p>
                 <p><strong>ID No:</strong> {idDetails.idNumber}</p>
                 <p><strong>Expiry:</strong> {idDetails.expiry}</p>
               </div>
             ) : isExtracting ? (
               <div className="flex flex-col items-center justify-center">
                 <p>Scanning ID details...</p>
                 <div className="mt-2 w-8 h-8 border-2 border-gray-300 border-t-yellow-400 rounded-full animate-spin"></div>
               </div>
             ) : (
               <button 
                 onClick={() => extractIdDetails(photoFront).then(setIdDetails)}
                 className="px-4 py-1 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-full text-xs"
               >
                 Scan ID Details
               </button>
             )}
           </div>
           <div className="flex justify-center gap-4 pt-2">
             <button
               onClick={() => retakePhoto(previewIndex === 0 ? "front" : "back")}
               className="px-5 py-2 bg-gray-800 text-white hover:bg-gray-700 transition shadow-md"
             >
               Retake {previewIndex === 0 ? "Front" : "Back"}
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
             <video
               ref={faceVideoRef}
               autoPlay
               playsInline
               muted
               className="top-0 left-0 w-full h-full object-cover rounded-lg z-10"
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
