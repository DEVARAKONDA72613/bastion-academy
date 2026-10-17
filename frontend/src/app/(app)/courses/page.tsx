'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';

type Course = {
  id: string;
  title: string;
  slug: string;
  description: string;
  thumbnail_url?: string | null;
  is_premium: boolean;
  required_plan_code: string;
  category_name: string;
  instructor_name: string;
};

function planLabel(value: string) {
  return value === 'FREE' ? 'Free' : value;
}

export default function CoursesPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadCourses = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await api.listCourses();
      setCourses(Array.isArray(result) ? result : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load courses. Check that the backend is running and try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCourses();
  }, [loadCourses]);

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-primary">Learning library</p>
          <h1 className="mt-1 text-2xl font-semibold">Explore courses</h1>
          <p className="mt-2 max-w-2xl text-sm text-text-dim">Browse published courses and continue learning at your own pace.</p>
        </div>
        <Link href="/dashboard" className="w-fit rounded border border-border px-3 py-2 text-xs text-text-dim hover:border-primary hover:text-primary">
          Back to dashboard
        </Link>
      </header>

      {loading ? (
        <p role="status" className="py-8 text-sm text-text-dim">Loading coursesâ€¦</p>
      ) : error ? (
        <div role="alert" className="max-w-xl rounded-lg border border-border bg-elevated p-5">
          <h2 className="text-lg font-semibold">Unable to load courses</h2>
          <p className="mt-2 break-words text-sm text-text-dim">{error}</p>
          <button type="button" onClick={() => void loadCourses()} className="mt-4 rounded border border-border px-4 py-2 text-sm hover:border-primary">
            Try again
          </button>
        </div>
      ) : courses.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <h2 className="text-lg font-semibold">No courses published yet</h2>
          <p className="mt-2 text-sm text-text-dim">Published courses will appear here when they are available.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {courses.map((course) => (
            <Link
              key={course.id}
              href={`/courses/${encodeURIComponent(course.slug)}`}
              className="group flex h-full flex-col overflow-hidden rounded-lg border border-border bg-elevated transition-colors hover:border-primary"
            >
              {course.thumbnail_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={course.thumbnail_url} alt="" className="h-40 w-full bg-surface object-cover" loading="lazy" />
              ) : (
                <div aria-hidden="true" className="flex h-40 items-center justify-center bg-surface font-mono text-3xl text-primary">BA</div>
              )}
              <div className="flex flex-1 flex-col p-4">
                <div className="mb-3 flex flex-wrap items-center gap-2 text-[10px]">
                  {course.category_name && <span className="rounded border border-border px-2 py-1 text-text-dim">{course.category_name}</span>}
                  <span className="rounded bg-primary/10 px-2 py-1 font-mono text-primary">{planLabel(course.required_plan_code || 'FREE')}</span>
                </div>
                <h2 className="text-base font-semibold group-hover:text-primary">{course.title}</h2>
                <p className="mt-2 line-clamp-3 text-sm leading-6 text-text-dim">{course.description || 'Explore this course and its lessons.'}</p>
                <div className="mt-auto flex items-center justify-between gap-3 pt-5 text-xs text-text-dim">
                  <span className="truncate">{course.instructor_name ? `By ${course.instructor_name}` : 'Bastion Academy'}</span>
                  <span className="shrink-0 text-primary">View course â†’</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}