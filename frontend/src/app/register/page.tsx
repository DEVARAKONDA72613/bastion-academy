'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { AuthCard, Field, inputClass, buttonClass, ErrorText } from '@/components/AuthCard';

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
      const result = await api.register(email, password, displayName);
      router.push(`/verify?userId=${result.userId}&purpose=registration&email=${encodeURIComponent(email)}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong — try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthCard title="Create your account" subtitle="Start training with Bastion Academy">
      <form onSubmit={handleSubmit}>
        <ErrorText>{error}</ErrorText>
        <Field label="Full name">
          <input className={inputClass} value={displayName} onChange={(e) => setDisplayName(e.target.value)} required maxLength={80} />
        </Field>
        <Field label="Email">
          <input type="email" className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} required />
        </Field>
        <Field label="Password">
          <input type="password" className={inputClass} value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
        </Field>
        <button type="submit" className={buttonClass} disabled={loading}>
          {loading ? 'Creating account…' : 'Create account'}
        </button>
      </form>
      <p className="text-text-dim text-sm text-center mt-4">
        Already have an account? <a href="/login" className="text-primary">Sign in</a>
      </p>
    </AuthCard>
  );
}
