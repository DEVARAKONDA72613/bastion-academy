'use client';
import { createContext, useContext, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from './api';

type Me = Awaited<ReturnType<typeof api.getMe>>;
type AuthState = { user: Me | null; loading: boolean; refresh: () => void };

const AuthContext = createContext<AuthState>({ user: null, loading: true, refresh: () => {} });

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      setUser(await api.getMe());
    } catch {
      router.push('/login');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  return <AuthContext.Provider value={{ user, loading, refresh: load }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
