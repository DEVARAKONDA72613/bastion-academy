
'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { applyTheme } from '@/lib/theme';
import {
  AuthCard,
  Field,
  inputClass,
  buttonClass,
  ErrorText,
} from '@/components/AuthCard';

function VerifyForm() {
  const router = useRouter();
  const params = useSearchParams();

  const userId = params.get('userId') ?? '';
  const purpose =
    (params.get('purpose') as 'registration' | 'login') ?? 'login';
  const email = params.get('email') ?? '';

  const [otp, setOtp] = useState('');
  const [trustDevice, setTrustDevice] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const result = await api.verifyOtp(
        userId,
        otp,
        purpose,
        trustDevice
      );

      if (purpose === 'registration') {
        router.push('/login?verified=1');
        return;
      }

      if (result.theme) applyTheme(result.theme);
      router.push('/dashboard');
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Something went wrong — try again.'
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    setError('');
    setMessage('');

    try {
      await api.resendOtp(email, purpose);
      setMessage('A new code has been sent.');
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Could not resend — try again shortly.'
      );
    }
  }

  return (
    <AuthCard
      title="Check your email"
      subtitle={`We sent a 6-digit code to ${email || 'your email'}`}
    >
      <form onSubmit={handleSubmit}>
        <ErrorText>{error}</ErrorText>

        {message && (
          <p className="text-success text-sm mb-4">{message}</p>
        )}

        <Field label="Verification code">
          <input
            className={`${inputClass} text-center tracking-[0.5em] font-mono text-lg`}
            value={otp}
            onChange={(e) =>
              setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))
            }
            maxLength={6}
            inputMode="numeric"
            autoComplete="one-time-code"
            required
          />
        </Field>

        {purpose === 'login' && (
          <label className="flex items-center gap-2 mb-4 text-sm text-text-dim">
            <input
              type="checkbox"
              checked={trustDevice}
              onChange={(e) => setTrustDevice(e.target.checked)}
            />
            Trust this device for 30 days
          </label>
        )}

        <button
          type="submit"
          className={buttonClass}
          disabled={loading || otp.length !== 6}
        >
          {loading ? 'Verifying…' : 'Verify'}
        </button>
      </form>

      <button
        type="button"
        onClick={handleResend}
        className="text-text-dim text-sm text-center mt-4 w-full hover:text-primary"
      >
        Didn't get a code? Resend
      </button>
    </AuthCard>
  );
}

export default function VerifyPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center text-text-dim">
          Loading verification...
        </div>
      }
    >
      <VerifyForm />
    </Suspense>
  );
}
