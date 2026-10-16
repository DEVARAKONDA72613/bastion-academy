'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { VideoPlayer } from '@/components/VideoPlayer';
import { CommentThread } from '@/components/CommentThread';
import { api, ApiError } from '@/lib/api';

type Video = Awaited<ReturnType<typeof api.getVideo>>;

export default function WatchPage() {
  const { videoId } = useParams<{ videoId: string }>();
  const router = useRouter();
  const [video, setVideo] = useState<Video | null>(null);
  const [downloadMsg, setDownloadMsg] = useState('');
  const [theater, setTheater] = useState(false);
  const [shareMsg, setShareMsg] = useState('');

  useEffect(() => {
    let active = true;
    api.getVideo(videoId).then((data) => { if (active) setVideo(data); }).catch((err) => {
      if (active) setDownloadMsg(err instanceof Error ? err.message : 'Could not load this lesson.');
    });
    return () => { active = false; };
  }, [videoId]);

  const goNext = useCallback(() => {
    if (video?.next_video) router.push(`/watch/${video.next_video.id}`);
  }, [router, video?.next_video]);

  async function handleDownload() {
    setDownloadMsg('Checking plan and quota…');
    try {
      const result = await api.requestDownload(videoId);
      if (!result.mock && typeof result.streamUrl === 'string' && /^https?:\/\//i.test(result.streamUrl)) {
        const anchor = document.createElement('a');
        anchor.href = result.streamUrl;
        anchor.download = `${video?.title ?? 'bastion-video'}.mp4`;
        anchor.rel = 'noopener noreferrer';
        document.body.appendChild(anchor); anchor.click(); anchor.remove();
        setDownloadMsg(result.alreadyRequested ? 'Existing download requested again.' : 'Download started.');
      } else {
        setDownloadMsg('Quota authorization recorded, but real file storage/CDN is not connected. No video file was downloaded.');
      }
    } catch (err) {
      setDownloadMsg(err instanceof ApiError ? err.message : 'Download failed.');
    }
  }

  async function shareLesson() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setShareMsg('Lesson link copied.');
    } catch {
      setShareMsg(window.location.href);
    }
  }

  if (!video) return <div className="py-8 text-sm text-text-dim">{downloadMsg || 'Loading lesson…'}</div>;

  return (
    <div className={theater ? 'space-y-6' : 'grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_280px]'}>
      <div className="min-w-0">
        <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-text-dim">
          <Link href="/courses" className="hover:text-primary">Courses</Link><span>/</span>
          {video.course_slug && <Link href={`/courses/${video.course_slug}`} className="max-w-[60vw] truncate hover:text-primary">{video.course_title || 'Course'}</Link>}
          {video.completed && <span className="rounded bg-primary/15 px-2 py-1 font-medium text-primary">✓ Completed</span>}
        </div>
        <VideoPlayer videoId={videoId} resumeAt={video.resume_position} nextVideo={video.next_video} theater={theater} onToggleTheater={() => setTheater((v) => !v)} onNext={goNext} />
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold sm:text-2xl">{video.title}</h1>
            <p className="mt-2 whitespace-pre-line text-sm leading-6 text-text-dim">{video.description}</p>
            {video.next_video && <button onClick={goNext} className="mt-3 text-sm font-medium text-primary hover:underline">Next lesson: {video.next_video.title} →</button>}
          </div>
          <div className="flex flex-wrap gap-2 sm:justify-end">
            <button onClick={() => void shareLesson()} className="rounded border border-border px-3 py-2 text-xs hover:border-primary">Share ↗</button>
            <button onClick={() => void handleDownload()} className="rounded bg-primary px-3 py-2 text-xs font-semibold text-bg">Download for offline ↓</button>
          </div>
        </div>
        {(downloadMsg || shareMsg) && <div role="status" className="mt-3 break-words rounded border border-border bg-surface px-3 py-2 text-xs text-text-dim">{downloadMsg || shareMsg}</div>}
        <div className="mt-7 border-t border-border pt-6"><CommentThread videoId={videoId} /></div>
      </div>
      {!theater && <aside className="h-fit rounded-lg border border-border bg-elevated p-4 lg:sticky lg:top-20">
        <h2 className="mb-3 text-sm font-semibold">Lesson details</h2>
        <dl className="space-y-3 text-xs">
          <div className="flex items-center justify-between gap-4"><dt className="text-text-dim">Duration</dt><dd>{Math.max(1, Math.round(video.duration_seconds / 60))} min</dd></div>
          <div className="flex items-center justify-between gap-4"><dt className="text-text-dim">Access tier</dt><dd className="font-mono">{video.required_plan_code}</dd></div>
          <div className="flex items-center justify-between gap-4"><dt className="text-text-dim">Progress</dt><dd>{video.completed ? 'Complete' : video.resume_position > 0 ? `Resume at ${Math.floor(video.resume_position / 60)}:${String(video.resume_position % 60).padStart(2, '0')}` : 'Not started'}</dd></div>
        </dl>
        {video.course_slug && <Link href={`/courses/${video.course_slug}`} className="mt-5 block rounded border border-border px-3 py-2 text-center text-xs hover:border-primary">View course curriculum</Link>}
        <Link href="/downloads" className="mt-2 block text-center text-xs text-text-dim hover:text-primary">View download history</Link>
      </aside>}
    </div>
  );
}
