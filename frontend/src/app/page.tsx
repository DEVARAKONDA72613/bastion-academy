
'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api';

type CourseVideo = {
  id: string;
  title: string;
  duration_seconds: number;
  locked: boolean;
  required_plan_code: string;
};

type Course = {
  id: string;
  title: string;
  instructor_name: string;
  description: string;
  videos: CourseVideo[];
};

type CourseProgress = {
  total: number;
  completed: number;
  percent: number;
};

export default function CourseDetailPage() {
  const { slug } = useParams<{ slug: string }>();

  const [course, setCourse] = useState<Course | null>(null);
  const [progress, setProgress] = useState<CourseProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadCourse = useCallback(async (isActive: () => boolean) => {
    setLoading(true);
    setError('');
    setCourse(null);
    setProgress(null);

    try {
      const result = (await api.getCourse(slug)) as Course;

      if (!isActive()) return;

      if (!result || !result.id) {
        setError('This course could not be found.');
        return;
      }

      setCourse(result);
      setLoading(false);

      try {
        const resultProgress = await api.getCourseProgress(result.id);

        if (isActive()) {
          setProgress(resultProgress);
        }
      } catch {
        // Course content remains available if progress cannot be loaded.
      }

      return;
    } catch {
      if (isActive()) {
        setError(
          'Unable to load this course. Check your connection and try again.'
        );
      }
    } finally {
      if (isActive()) {
        setLoading(false);
      }
    }
  }, [slug]);

  useEffect(() => {
    let active = true;

    void loadCourse(() => active);

    return () => {
      active = false;
    };
  }, [loadCourse]);

  if (loading) {
    return (
      <p className="text-text-dim" role="status">
        Loading course…
      </p>
    );
  }

  if (error || !course) {
    return (
      <div className="max-w-xl py-8">
        <h1 className="text-2xl font-semibold mb-3">
          Unable to open course
        </h1>

        <p className="text-text-dim mb-6">
          {error || 'This course is unavailable.'}
        </p>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => {
              void loadCourse(() => true);
            }}
            className="px-4 py-2 rounded border border-border hover:border-primary"
          >
            Try again
          </button>

          <Link
            href="/courses"
            className="px-4 py-2 rounded bg-primary text-bg"
          >
            Back to courses
          </Link>
        </div>
      </div>
    );
  }

  const videos = course.videos ?? [];

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-1">
        {course.title}
      </h1>

      <p className="text-text-dim mb-1">
        by {course.instructor_name}
      </p>

      <p className="text-text-dim mb-6">
        {course.description}
      </p>

      {progress && (
        <div className="mb-6">
          <div className="h-1.5 bg-border rounded-full overflow-hidden w-full max-w-sm">
            <div
              className="h-full bg-primary"
              style={{
                width: `${Math.min(100, Math.max(0, progress.percent))}%`,
              }}
            />
          </div>

          <p className="text-text-dim text-xs mt-1">
            {progress.completed}/{progress.total} lessons complete
          </p>
        </div>
      )}

      <div className="flex flex-col gap-2">
        {videos.length === 0 ? (
          <p className="text-text-dim py-4">
            No lessons are available in this course yet.
          </p>
        ) : (
          videos.map((video, index) =>
            video.locked ? (
              <div
                key={video.id}
                className="flex justify-between items-center gap-3 bg-elevated border border-border rounded p-4 opacity-60"
              >
                <span>
                  {index + 1}. {video.title} 🔒
                </span>

                <span className="text-xs font-mono text-accent">
                  {video.required_plan_code}
                </span>
              </div>
            ) : (
              <Link
                key={video.id}
                href={`/watch/${video.id}`}
                className="flex justify-between items-center gap-3 bg-elevated border border-border rounded p-4 hover:border-primary"
              >
                <span>
                  {index + 1}. {video.title}
                </span>

                <span className="text-text-dim text-xs font-mono shrink-0">
                  {Math.round(video.duration_seconds / 60)} min
                </span>
              </Link>
            )
          )
        )}
      </div>
    </div>
  );
}
