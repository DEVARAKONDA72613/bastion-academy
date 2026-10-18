'use client';

import { useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { AuthCard, Field, inputClass, buttonClass, ErrorText } from '@/components/AuthCard';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api.forgotPassword(email.trim().toLowerCase());
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not request a reset code. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthCard title="Reset your password" subtitle="We'll email you a one-time reset code">
      {!sent ? (
        <form onSubmit={handleSubmit}>
          <ErrorText>{error}</ErrorText>
          <Field label="Account email">
            <input
              type="email"
              className={inputClass}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </Field>
          <button type="submit" className={buttonClass} disabled={loading}>
            {loading ? 'Requesting code…' : 'Send reset code'}
          </button>
        </form>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-text-dim">
            If an account exists for <span className="text-text">{email}</span>, a reset code has been sent. Check your inbox and spam folder.
          </p>
          <a href={`/reset-password?email=${encodeURIComponent(email.trim().toLowerCase())}`} className={`${buttonClass} block text-center`}>
            Enter reset code
          </a>
        </div>
      )}
      <p className="text-text-dim text-sm text-center mt-4">
        Remembered it? <a href="/login" className="text-primary">Back to sign in</a>
      </p>
    </AuthCard>
  );
}