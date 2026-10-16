'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api';

export default function CourseDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const [course, setCourse] = useState<any>(null);
  const [progress, setProgress] = useState<any>(null);

  useEffect(() => {
    api.getCourse(slug).then((c) => {
      setCourse(c);
      api.getCourseProgress(c.id).then(setProgress).catch(() => {});
    }).catch(() => {});
  }, [slug]);

  if (!course) return <p className="text-text-dim">Loading…</p>;

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-1">{course.title}</h1>
      <p className="text-text-dim mb-1">by {course.instructor_name}</p>
      <p className="text-text-dim mb-6">{course.description}</p>
      {progress && (
        <div className="mb-6">
          <div className="h-1.5 bg-border rounded-full overflow-hidden w-full max-w-sm">
            <div className="h-full bg-primary" style={{ width: `${progress.percent}%` }} />
          </div>
          <p className="text-text-dim text-xs mt-1">{progress.completed}/{progress.total} lessons complete</p>
        </div>
      )}
      <div className="flex flex-col gap-2">
        {course.videos.map((v: any, i: number) =>
          v.locked ? (
            <div key={v.id} className="flex justify-between items-center bg-elevated border border-border rounded p-4 opacity-60">
              <span>{i + 1}. {v.title} 🔒</span>
              <span className="text-xs font-mono text-accent">{v.required_plan_code}</span>
            </div>
          ) : (
            <Link key={v.id} href={`/watch/${v.id}`} className="flex justify-between items-center bg-elevated border border-border rounded p-4 hover:border-primary">
              <span>{i + 1}. {v.title}</span>
              <span className="text-text-dim text-xs font-mono">{Math.round(v.duration_seconds / 60)} min</span>
            </Link>
          )
        )}
      </div>
    </div>
  );
}
