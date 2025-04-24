import React, { useState, useRef, useEffect } from "react";
import SumsubWebSdk from '@sumsub/websdk-react';

export default function UserRegistrationForm() {
  const [step, setStep] = useState("form");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");

  // Sumsub integration
  const [accessToken, setAccessToken] = useState(null);

  const handleFlip = (nextStep) => {
    setStep(nextStep);
  };

  const handleFormSubmit = () => {
    // After collecting email/phone/password
    handleFlip("sumsub");
  };

  // Fetch Sumsub access token for this user
  useEffect(() => {
    if (step === 'sumsub' && !accessToken) {
      (async () => {
        const res = await fetch('/api/sumsub/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, phone, userId: email })
        });
        const { token } = await res.json();
        setAccessToken(token);
      })();
    }
  }, [step, accessToken, email, phone]);

  // Handle successful verification
  const onMessage = (type, payload) => {
    if (type === 'idCheck.onCompleted') {
      handleFlip('success');
    }
  };

  return (
    <div className="p-6 max-w-md mx-auto bg-white rounded-lg shadow">
      {step === 'form' && (
        <>
          <h2 className="text-xl font-semibold mb-4">Register</h2>
          <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} className="w-full mb-2 p-2 border rounded" />
          <input type="text" placeholder="Phone" value={phone} onChange={e => setPhone(e.target.value)} className="w-full mb-2 p-2 border rounded" />
          <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} className="w-full mb-4 p-2 border rounded" />
          <button onClick={handleFormSubmit} className="w-full py-2 bg-blue-600 text-white rounded">Next: Verify ID</button>
        </>
      )}

      {step === 'sumsub' && (
        <div>
          <h2 className="text-xl font-semibold mb-4">Document Verification</h2>
          {accessToken ? (
            <SumsubWebSdk
              accessToken={accessToken}
              expirationHandler={async () => {
                // Fetch new token if expired
                const res = await fetch('/api/sumsub/token', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, phone, userId: email }) });
                const { token: newToken } = await res.json();
                return newToken;
              }}
              onMessage={onMessage}
              config={{ lang: 'en', levelName: process.env.SUMSUB_LEVEL_NAME }}
              options={{ adaptIframeHeight: true, addViewportTag: false }}
            />
          ) : (
            <p>Loading verification widget…</p>
          )}
        </div>
      )}

      {step === 'success' && (
        <div className="text-center">
          <h2 className="text-2xl font-bold text-green-600">✅ Verification Complete!</h2>
          <p className="mt-2">Your identity has been successfully verified.</p>
        </div>
      )}
    </div>
  );
}
