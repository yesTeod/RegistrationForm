import React, { useState, useEffect, useRef } from 'react';

export default function UserRegistrationForm() {
  const [step, setStep] = useState('form');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [userToken, setUserToken] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const containerRef = useRef(null);
  const accessTokenRef = useRef(null);
  const sdkScriptAdded = useRef(false);

  // Request Sumsub access token
  const handleFormSubmit = async () => {
    if (!email || !password) {
      setError('Please enter both email and password');
      return;
    }
    setError(null);
    setIsLoading(true);
    // generate simple externalUserId
    const externalUserId = `${email.split('@')[0]}-${Date.now()}`;

    try {
      const res = await fetch('/api/sumsub-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ externalUserId, levelName: 'basic-kyc-level', ttlInSecs: 600 }),
      });
      if (!res.ok) throw new Error('Token request failed');
      const { token } = await res.json();
      accessTokenRef.current = token;
      setUserToken(token);
      setStep('verification');
    } catch (e) {
      setError(e.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Load SDK script and init when ready
  useEffect(() => {
    if (step !== 'verification' || !userToken) return;

    const initSdk = () => {
      if (!window.SumsubWebSdk || !containerRef.current) return;
      window.SumsubWebSdk.init(accessTokenRef.current, {
        container: containerRef.current,
        apiUrl: 'https://api.sumsub.com',
        flowName: 'msdk-basic',
        uiConf: { lang: 'en' },
        accessTokenExpirationHandler: async () => {
          // refresh token
          const res = await fetch('/api/sumsub-token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ /* same externalUserId and levelName */ }),
          });
          const { token } = await res.json();
          accessTokenRef.current = token;
          return token;
        },
        events: {
          onError: (err) => setError(err.message || 'Verification error'),
          onStateChange: (state) => {
            if (state === 'final') setStep('success');
          },
        },
      });
    };

    if (!sdkScriptAdded.current) {
      const script = document.createElement('script');
      script.src = 'https://static.sumsub.com/idensic/static/sns-websdk-build.js';
      script.async = true;
      script.onload = initSdk;
      document.body.appendChild(script);
      sdkScriptAdded.current = true;
    } else {
      initSdk();
    }
  }, [step, userToken]);

  return (
    <div className="max-w-md mx-auto p-6 bg-white rounded-xl shadow-lg">
      {step === 'form' && (
        <div className="space-y-4">
          <h2 className="text-2xl font-semibold">Register</h2>
          {error && <p className="text-red-600">{error}</p>}
          <input
            type="email"
            placeholder="Email"
            className="w-full p-2 border rounded"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            type="password"
            placeholder="Password"
            className="w-full p-2 border rounded"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button
            onClick={handleFormSubmit}
            disabled={isLoading}
            className={`w-full py-2 rounded-xl shadow-md transition-colors ${isLoading ? 'bg-gray-400 cursor-not-allowed' : 'bg-yellow-400 hover:bg-yellow-300 text-black'}`}
          >
            {isLoading ? 'Starting...' : 'Continue to Verification'}
          </button>
        </div>
      )}

      {step === 'verification' && (
        <div className="mt-4">
          <div ref={containerRef} style={{ minHeight: 400 }} />
          {error && <p className="text-red-600 mt-2">{error}</p>}
        </div>
      )}

      {step === 'success' && (
        <div className="text-center space-y-4">
          <div className="text-6xl">✅</div>
          <h2 className="text-2xl font-semibold">Verification Complete</h2>
          <p>Thank you! Your identity has been verified.</p>
          <button
            onClick={() => window.location.href = '/dashboard'}
            className="mt-2 px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded-xl shadow"
          >
            Go to Dashboard
          </button>
        </div>
      )}
    </div>
  );
}
