'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { AuthCard, Field, inputClass, buttonClass, ErrorText } from '@/components/AuthCard';
import PasswordInput from '@/components/PasswordInput';

function ResetPasswordForm() {
  const params = useSearchParams();
  const [email, setEmail] = useState(params.get('email') ?? '');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api.resetPassword(email.trim().toLowerCase(), otp, newPassword);
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not reset your password. Request a new code and try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthCard title="Choose a new password" subtitle="Use the 6-digit code sent to your email">
      {done ? (
        <div className="space-y-4">
          <p className="text-sm text-text-dim">Your password has been updated. You can now sign in with the new password.</p>
          <a href="/login" className={`${buttonClass} block text-center`}>Return to sign in</a>
        </div>
      ) : (
        <form onSubmit={handleSubmit}>
          <ErrorText>{error}</ErrorText>
          <Field label="Account email">
            <input type="email" className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
          </Field>
          <Field label="6-digit reset code">
            <input
              className={`${inputClass} text-center tracking-[0.5em] font-mono`}
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              required
            />
          </Field>
          <Field label="New password">
            <PasswordInput value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" minLength={8} required />
          </Field>
          <p className="text-xs text-text-dim -mt-2 mb-4">Use at least 8 characters.</p>
          <button type="submit" className={buttonClass} disabled={loading || otp.length !== 6 || newPassword.length < 8}>
            {loading ? 'Updating password…' : 'Update password'}
          </button>
        </form>
      )}
      {!done && <p className="text-text-dim text-sm text-center mt-4"><a href="/forgot-password" className="text-primary">Request another code</a></p>}
    </AuthCard>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-text-dim">Loading reset form…</div>}>
      <ResetPasswordForm />
    </Suspense>
  );
}