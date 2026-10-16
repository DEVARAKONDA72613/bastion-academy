'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/AuthContext';

export default function DashboardPage() {
  const { user } = useAuth();
  const [courses, setCourses] = useState<any[]>([]);
  const [quota, setQuota] = useState<any>(null);
  const [sub, setSub] = useState<any>(null);

  useEffect(() => {
    api.listCourses().then(setCourses).catch(() => {});
    api.getQuota().then(setQuota).catch(() => {});
    api.getMySubscription().then(setSub).catch(() => {});
  }, []);

  return (
    <div>
      <h1 className="text-3xl font-semibold mb-1">Welcome back, {user?.display_name?.split(' ')[0] ?? ''}</h1>
      <p className="text-text-dim mb-8">Here's where you left off.</p>

      <div className="grid md:grid-cols-2 gap-4 mb-4">
        <div className="bg-elevated border border-border rounded p-5">
          <h3 className="font-semibold mb-2">Continue learning</h3>
          {courses[0] ? (
            <>
              <p className="text-text-dim text-sm mb-3">{courses[0].title}</p>
              <Link href={`/courses/${courses[0].slug}`} className="inline-block bg-primary text-bg px-4 py-2 rounded text-sm font-medium">
                Resume
              </Link>
            </>
          ) : (
            <p className="text-text-dim text-sm">No courses started yet.</p>
          )}
        </div>
        <div className="bg-elevated border border-border rounded p-5">
          <h3 className="font-semibold mb-2">Your plan</h3>
          <p className="text-2xl font-mono text-primary mb-1">{user?.plan_code}</p>
          <p className="text-text-dim text-sm mb-2">{sub?.expires_at ? `Renews ${new Date(sub.expires_at).toLocaleDateString()}` : 'No active paid plan'}</p>
          <Link href="/pricing" className="text-primary text-sm">Manage plan →</Link>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <div className="bg-elevated border border-border rounded p-5">
          <h3 className="font-mono text-2xl mb-1">{quota ? (quota.remaining === 'unlimited' ? '∞' : quota.remaining) : '—'}</h3>
          <p className="text-text-dim text-sm">downloads remaining today</p>
        </div>
        <div className="bg-elevated border border-border rounded p-5 md:col-span-2">
          <h3 className="font-semibold mb-2">Explore courses</h3>
          <div className="flex flex-col gap-2">
            {courses.slice(0, 3).map((c) => (
              <Link key={c.id} href={`/courses/${c.slug}`} className="text-sm text-text hover:text-primary flex justify-between">
                <span>{c.title}</span>
                <span className="text-text-dim font-mono text-xs">{c.required_plan_code}</span>
              </Link>
            ))}
            {courses.length === 0 && <p className="text-text-dim text-sm">No courses published yet.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
