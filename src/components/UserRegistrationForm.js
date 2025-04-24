import React, { useState, useEffect } from 'react';
import { launchIdAndLiveness } from '../sumsub-id-and-liveness';

export default function UserRegistrationForm() {
  const [step, setStep] = useState('form');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [externalUserId, setExternalUserId] = useState(null);
  const [userToken, setUserToken] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  // Submit form and get initial id-and-liveness token
  const handleFormSubmit = async () => {
    if (!email || !password) {
      setError('Please enter both email and password');
      return;
    }
    setError(null);
    setIsLoading(true);

    // Generate a unique externalUserId
    const uid = `${email.split('@')[0]}-${Date.now()}`;
    setExternalUserId(uid);

    try {
      const res = await fetch('/api/sumsub-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          externalUserId: uid,
          levelName: 'id-and-liveness',
          ttlInSecs: 600
        }),
      });
      if (!res.ok) throw new Error('Failed to fetch verification token');
      const { token } = await res.json();
      setUserToken(token);
      setStep('verification');
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Token refresh callback
  const refreshTokenFn = async () => {
    try {
      const res = await fetch('/api/sumsub-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          externalUserId,
          levelName: 'id-and-liveness',
          ttlInSecs: 600
        }),
      });
      if (!res.ok) throw new Error('Failed to refresh token');
      const { token } = await res.json();
      setUserToken(token);
      return token;
    } catch (err) {
      setError(err.message);
      return null;
    }
  };

  // Initialize and launch Sumsub SDK on verification step
  useEffect(() => {
    if (step !== 'verification' || !userToken) return;

    const sdk = launchIdAndLiveness(
      userToken,
      refreshTokenFn,
      '#sumsub-websdk-container'
    );
    return () => sdk.destroy();
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
            className={`w-full py-2 rounded-xl shadow-md transition-colors ${
              isLoading
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-yellow-400 hover:bg-yellow-300 text-black'
            }`}
          >
            {isLoading ? 'Starting...' : 'Continue to Verification'}
          </button>
        </div>
      )}

      {step === 'verification' && (
        <div className="mt-4">
          <div id="sumsub-websdk-container" style={{ minHeight: '400px' }} />
          {error && <p className="text-red-600 mt-2">{error}</p>}
        </div>
      )}

      {step === 'success' && (
        <div className="text-center space-y-4">
          <div className="text-6xl">✅</div>
          <h2 className="text-2xl font-semibold">Verification Complete</h2>
          <p>Your identity has been verified.</p>
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
