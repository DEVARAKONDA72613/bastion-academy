'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { applyTheme } from '@/lib/theme';
import { AuthCard, Field, inputClass, buttonClass, ErrorText } from '@/components/AuthCard';
import PasswordInput from '@/components/PasswordInput';
import GoogleSignInButton from '@/components/GoogleSignInButton';

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await api.register(email.trim().toLowerCase(), password, displayName);
      router.push(`/verify?userId=${result.userId}&purpose=registration&email=${encodeURIComponent(email.trim().toLowerCase())}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong — try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleCredential(credential: string) {
    setError('');
    setLoading(true);
    try {
      const result = await api.googleLogin(credential);
      if (result.requiresOtp) {
        router.push(`/verify?userId=${result.userId}&purpose=login&email=${encodeURIComponent(result.email || '')}`);
        return;
      }
      if (result.theme) applyTheme(result.theme);
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Google sign-in failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthCard title="Create your account" subtitle="Start training with Bastion Academy">
      <form onSubmit={handleSubmit}>
        <ErrorText>{error}</ErrorText>
        <Field label="Full name">
          <input className={inputClass} value={displayName} onChange={(e) => setDisplayName(e.target.value)} required maxLength={80} autoComplete="name" />
        </Field>
        <Field label="Email">
          <input type="email" className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
        </Field>
        <Field label="Password">
          <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required minLength={8} />
        </Field>
        <button type="submit" className={buttonClass} disabled={loading}>
          {loading ? 'Creating account…' : 'Create account'}
        </button>
      </form>
      <div className="flex items-center gap-3 my-5 text-xs text-text-dim">
        <span className="h-px bg-border flex-1" /><span>OR CONTINUE WITH</span><span className="h-px bg-border flex-1" />
      </div>
      <GoogleSignInButton onCredential={handleGoogleCredential} disabled={loading} />
      <p className="text-text-dim text-sm text-center mt-4">
        Already have an account? <a href="/login" className="text-primary">Sign in</a>
      </p>
    </AuthCard>
  );
}