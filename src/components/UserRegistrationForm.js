import React, { useState, useEffect, useRef } from "react";

export default function UserRegistrationForm() {
  // --- State Variables ---
  const [step, setStep] = useState("form"); // Only 'form' step is needed now
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false); // Simple loading state for redirect

  // --- Refs ---
  const containerRef = useRef(null); // Keep for potential styling/animation

  // --- Event Handlers ---

  const handleFormSubmit = (e) => {
    e.preventDefault(); // Prevent default form submission
    setIsSubmitting(true);

    // Define the permalink
    const sumsubPermalink = 'https://in.sumsub.com/websdk/p/MZFLtDeVEmSRxORm';

    // Optionally, you might want to pre-register the user in your system here
    // before redirecting them to Sumsub.

    // Redirect the user to the Sumsub Permalink
    // Add a small delay for visual feedback if desired
    setTimeout(() => {
        window.location.href = sumsubPermalink;
        // No need to setIsSubmitting(false) as the page is navigating away
    }, 300); // 300ms delay example
  };

  // --- Effects ---

  useEffect(() => {
    // This effect can be removed or used for other purposes if needed.
    console.log("UserRegistrationForm mounted");
    return () => {
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

      {/* Only show the form step */}
      {step === "form" && (
        <form onSubmit={handleFormSubmit} className="space-y-4">
          <h2 className="text-2xl font-semibold text-gray-800">Register</h2>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            required
            disabled={isSubmitting} // Disable input while submitting
            className="w-full p-2 border border-gray-300 rounded-lg"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            required
            minLength={8}
            disabled={isSubmitting} // Disable input while submitting
            className="w-full p-2 border border-gray-300 rounded-lg"
          />
          <div className="flex justify-center pt-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className={`bg-yellow-400 hover:bg-yellow-300 text-black px-6 py-2 rounded-full shadow-md transition-opacity ${isSubmitting ? 'opacity-50 cursor-wait' : ''}`}
            >
              {isSubmitting ? 'Proceeding...' : 'Continue to Verification'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
