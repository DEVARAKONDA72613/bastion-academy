'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { applyTheme } from '@/lib/theme';
import { AuthCard, Field, inputClass, buttonClass, ErrorText } from '@/components/AuthCard';
import PasswordInput from '@/components/PasswordInput';
import GoogleSignInButton from '@/components/GoogleSignInButton';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await api.login(email.trim().toLowerCase(), password);
      if (result.requiresOtp) {
        router.push(`/verify?userId=${result.userId}&purpose=login&email=${encodeURIComponent(email.trim().toLowerCase())}`);
        return;
      }
      if (result.theme) applyTheme(result.theme);
      router.push('/dashboard');
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
        const googleEmail = result.email || '';
        router.push(`/verify?userId=${result.userId}&purpose=login&email=${encodeURIComponent(googleEmail)}`);
        return;
      }
      if (result.theme) applyTheme(result.theme);
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Google sign-in failed. Please try email and password instead.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthCard title="Welcome back" subtitle="Sign in to continue training">
      <form onSubmit={handleSubmit}>
        <ErrorText>{error}</ErrorText>
        <Field label="Email">
          <input type="email" className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required />
        </Field>
        <Field label="Password">
          <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
        </Field>
        <div className="text-right mb-4">
          <a href="/forgot-password" className="text-xs text-text-dim hover:text-primary">Forgot password?</a>
        </div>
        <button type="submit" className={buttonClass} disabled={loading}>
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
      <div className="flex items-center gap-3 my-5 text-xs text-text-dim">
        <span className="h-px bg-border flex-1" /><span>OR CONTINUE WITH</span><span className="h-px bg-border flex-1" />
      </div>
      <GoogleSignInButton onCredential={handleGoogleCredential} disabled={loading} />
      <p className="text-text-dim text-sm text-center mt-4">
        New here? <a href="/register" className="text-primary">Create an account</a>
      </p>
    </AuthCard>
  );
}