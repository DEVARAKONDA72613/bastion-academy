'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@/lib/api';

const SPEEDS = [0.5, 1, 1.25, 1.5, 2];
const DEMO_FALLBACK = 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4';
type NextVideo = { id: string; title: string } | null;
type Props = {
  videoId: string;
  resumeAt?: number;
  nextVideo?: NextVideo;
  theater?: boolean;
  onToggleTheater?: () => void;
  onNext?: () => void;
};

function fmt(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

export function VideoPlayer({ videoId, resumeAt = 0, nextVideo = null, theater = false, onToggleTheater, onNext }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const previewVideoRef = useRef<HTMLVideoElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTouchRef = useRef<{ at: number; x: number } | null>(null);
  const lastPreviewSeekRef = useRef<number>(0);
  const resumePendingRef = useRef(true);
  const [src, setSrc] = useState<string | null>(null);
  const [mock, setMock] = useState(false);
  const [loading, setLoading] = useState(true);
  const [buffering, setBuffering] = useState(false);
  const [mediaError, setMediaError] = useState('');
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(1);
  const [speed, setSpeed] = useState(1);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [muted, setMuted] = useState(false);
  const [captionsOn, setCaptionsOn] = useState(false);
  const [hover, setHover] = useState<{ x: number; time: number } | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [completed, setCompleted] = useState(false);

  const captionsUrl = useMemo(() => {
    if (!mock || typeof URL === 'undefined') return null;
    const webVtt = 'WEBVTT\n\n00:00:00.000 --> 00:00:04.000\nBastion Academy demo video.\n\n00:00:04.000 --> 00:00:08.000\nCustom player preview — real course captions are not connected.\n';
    return URL.createObjectURL(new Blob([webVtt], { type: 'text/vtt' }));
  }, [mock]);

  useEffect(() => () => { if (captionsUrl) URL.revokeObjectURL(captionsUrl); }, [captionsUrl]);

  useEffect(() => {
    let alive = true;
    setLoading(true); setMediaError(''); setSrc(null); setCurrent(0); setDuration(0); setPlaying(false); setCompleted(false); setCountdown(null); setPreviewImage(null);
    resumePendingRef.current = true;
    api.getStreamUrl(videoId).then((res) => {
      if (!alive) return;
      setMock(res.mock);
      setSrc(res.mock ? DEMO_FALLBACK : res.streamUrl);
      setLoading(false);
    }).catch((err) => {
      if (!alive) return;
      setLoading(false);
      setMediaError(err instanceof Error ? err.message : 'This video could not be loaded.');
    });
    return () => { alive = false; };
  }, [videoId]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      const v = videoRef.current;
      if (v && !v.paused && Number.isFinite(v.currentTime)) {
        api.saveProgress(videoId, Math.floor(v.currentTime)).then((result) => setCompleted(result.completed)).catch(() => {});
      }
    }, 10000);
    return () => window.clearInterval(interval);
  }, [videoId]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.volume = volume;
    v.muted = muted;
  }, [volume, muted]);

  useEffect(() => { if (videoRef.current) videoRef.current.playbackRate = speed; }, [speed]);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ videoId: string }>).detail;
      if (detail?.videoId !== videoId && videoRef.current && !videoRef.current.paused) videoRef.current.pause();
    };
    window.addEventListener('bastion:video-playing', handler);
    return () => window.removeEventListener('bastion:video-playing', handler);
  }, [videoId]);

  useEffect(() => {
    if (countdown === null) return;
    if (countdown <= 0) {
      setCountdown(null);
      onNext?.();
      return;
    }
    const timer = window.setTimeout(() => setCountdown((value) => value === null ? null : value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [countdown, onNext]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !video.textTracks.length) return;
    for (let i = 0; i < video.textTracks.length; i++) video.textTracks[i].mode = captionsOn ? 'showing' : 'hidden';
  }, [captionsOn, src, captionsUrl]);

  const saveCurrentProgress = useCallback(() => {
    const v = videoRef.current;
    if (!v || !Number.isFinite(v.currentTime)) return;
    api.saveProgress(videoId, Math.floor(v.currentTime)).then((result) => setCompleted(result.completed)).catch(() => {});
  }, [videoId]);

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      window.dispatchEvent(new CustomEvent('bastion:video-playing', { detail: { videoId } }));
      void v.play().then(() => { setPlaying(true); setCountdown(null); }).catch(() => setMediaError('Playback was blocked. Press play to try again.'));
    } else {
      v.pause(); setPlaying(false); saveCurrentProgress();
    }
  }, [videoId, saveCurrentProgress]);

  const seek = useCallback((delta: number) => {
    const v = videoRef.current;
    if (!v || !Number.isFinite(v.duration)) return;
    v.currentTime = Math.min(Math.max(0, v.currentTime + delta), v.duration);
  }, []);

  function toggleFullscreen() {
    const node = containerRef.current;
    if (!node) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void node.requestFullscreen().catch(() => setMediaError('Fullscreen is not available in this browser.'));
  }

  function togglePiP() {
    const v = videoRef.current as (HTMLVideoElement & { requestPictureInPicture?: () => Promise<PictureInPictureWindow> }) | null;
    if (!v) return;
    if (document.pictureInPictureElement) void document.exitPictureInPicture();
    else if (v.requestPictureInPicture) void v.requestPictureInPicture().catch(() => setMediaError('Picture-in-Picture is unavailable.'));
    else setMediaError('Picture-in-Picture is not supported by this browser.');
  }

  function handleKeydown(e: React.KeyboardEvent<HTMLDivElement>) {
    const target = e.target as HTMLElement;
    if (target.matches('input, textarea, select, [contenteditable="true"]')) return;
    switch (e.key) {
      case ' ': e.preventDefault(); togglePlay(); break;
      case 'ArrowLeft': e.preventDefault(); seek(e.shiftKey ? -30 : -10); break;
      case 'ArrowRight': e.preventDefault(); seek(e.shiftKey ? 30 : 10); break;
      case 'ArrowUp': e.preventDefault(); setVolume((v) => Math.min(1, Math.round((v + 0.1) * 10) / 10)); break;
      case 'ArrowDown': e.preventDefault(); setVolume((v) => Math.max(0, Math.round((v - 0.1) * 10) / 10)); break;
      case 'm': case 'M': setMuted((v) => !v); break;
      case 'f': case 'F': toggleFullscreen(); break;
      case 'p': case 'P': togglePiP(); break;
      case 't': case 'T': onToggleTheater?.(); break;
      case 'c': case 'C': if (mock) setCaptionsOn((v) => !v); break;
      case 'n': case 'N': if (nextVideo && onNext) onNext(); break;
      case '<': setSpeed((v) => SPEEDS[Math.max(0, SPEEDS.indexOf(v) - 1)]); break;
      case '>': setSpeed((v) => SPEEDS[Math.min(SPEEDS.length - 1, SPEEDS.indexOf(v) + 1)]); break;
      default: break;
    }
  }

  function resetHideTimer() {
    setControlsVisible(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setControlsVisible(false), 2800);
  }

  function seekAtClientX(clientX: number, el: HTMLDivElement) {
    const rect = el.getBoundingClientRect();
    const percent = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    if (videoRef.current && duration > 0) videoRef.current.currentTime = percent * duration;
  }

  function updateBuffered(video: HTMLVideoElement) {
    if (!video.duration || !video.buffered.length) { setBuffered(0); return; }
    const end = video.buffered.end(video.buffered.length - 1);
    setBuffered(Math.min(100, (end / video.duration) * 100));
  }

  function updateFramePreview() {
    const video = previewVideoRef.current;
    const canvas = previewCanvasRef.current;
    if (!video || !canvas || video.readyState < 2) return;
    try {
      const context = canvas.getContext('2d');
      if (!context) return;
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      setPreviewImage(canvas.toDataURL('image/jpeg', 0.55));
    } catch {
      // Some CDN hosts do not enable cross-origin canvas access; keep the time preview.
      setPreviewImage(null);
    }
  }

  function handleTimelineHover(clientX: number, element: HTMLDivElement) {
    if (!duration) return;
    const rect = element.getBoundingClientRect();
    const percent = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const time = percent * duration;
    setHover({ x: percent * 100, time });
    const preview = previewVideoRef.current;
    const now = Date.now();
    if (preview && preview.readyState >= 1 && now - lastPreviewSeekRef.current > 180 && Math.abs(preview.currentTime - time) > 1) {
      lastPreviewSeekRef.current = now;
      try { preview.currentTime = Math.min(Math.max(0, time), Math.max(0, (preview.duration || duration) - 0.1)); } catch { /* ignore unsupported seek */ }
    }
  }

  function handleTouchEnd(e: React.TouchEvent<HTMLDivElement>) {
    const touch = e.changedTouches[0];
    const now = Date.now();
    const last = lastTouchRef.current;
    if (last && now - last.at < 300 && Math.abs(touch.clientX - last.x) < 90) {
      const bounds = containerRef.current?.getBoundingClientRect();
      if (bounds) seek(touch.clientX < bounds.left + bounds.width / 2 ? -10 : 10);
      lastTouchRef.current = null;
    } else lastTouchRef.current = { at: now, x: touch.clientX };
  }

  const progressPercent = duration > 0 ? Math.min(100, (current / duration) * 100) : 0;
  const resolution = videoRef.current?.videoHeight ? `${videoRef.current.videoHeight}p` : mock ? 'Demo stream' : 'Source';

  return (
    <div ref={containerRef} tabIndex={0} onKeyDown={handleKeydown} onMouseMove={resetHideTimer} onMouseLeave={() => setControlsVisible(false)} onTouchEnd={handleTouchEnd}
      className={`relative isolate aspect-video w-full overflow-hidden rounded-lg bg-black outline-none ring-offset-2 ring-offset-bg focus-visible:ring-2 focus-visible:ring-primary ${theater ? 'shadow-2xl' : ''}`} aria-label="Custom video player">
      {mock && <div className="absolute left-3 top-3 z-20 rounded border border-white/15 bg-black/70 px-2 py-1 font-mono text-[10px] text-amber-300">DEMO STREAM · STORAGE NOT CONNECTED</div>}
      {completed && <div className="absolute right-3 top-3 z-20 rounded bg-primary/90 px-2 py-1 text-[10px] font-semibold text-bg">COMPLETED</div>}
      {src && <video ref={videoRef} src={src} playsInline preload="metadata" className="h-full w-full cursor-pointer object-contain" onClick={togglePlay}
        onPlay={() => { setPlaying(true); setBuffering(false); setMediaError(''); }} onPause={() => { setPlaying(false); saveCurrentProgress(); }}
        onWaiting={() => setBuffering(true)} onStalled={() => setBuffering(true)} onPlaying={() => setBuffering(false)} onCanPlay={() => setBuffering(false)}
        onTimeUpdate={(e) => { setCurrent(e.currentTarget.currentTime); updateBuffered(e.currentTarget); }}
        onProgress={(e) => updateBuffered(e.currentTarget)}
        onLoadedMetadata={(e) => {
          const v = e.currentTarget;
          setDuration(v.duration);
          if (resumePendingRef.current && resumeAt > 0 && resumeAt < v.duration - 2) v.currentTime = resumeAt;
          resumePendingRef.current = false;
          setLoading(false);
        }}
        onError={() => { setLoading(false); setBuffering(false); setMediaError(mock ? 'The demo video could not load. Check your internet connection.' : 'This video stream failed to load.'); }}
        onEnded={() => { setPlaying(false); saveCurrentProgress(); if (nextVideo && onNext) setCountdown(5); }}>
        {captionsUrl && <track kind="captions" src={captionsUrl} srcLang="en" label="Demo captions" default={captionsOn} />}
      </video>}
      {src && <video ref={previewVideoRef} src={src} crossOrigin="anonymous" muted playsInline preload="metadata" className="hidden" onSeeked={updateFramePreview} onLoadedMetadata={() => { if (hover && previewVideoRef.current) previewVideoRef.current.currentTime = Math.min(hover.time, Math.max(0, (previewVideoRef.current.duration || duration) - 0.1)); }} />}
      <canvas ref={previewCanvasRef} width={160} height={90} className="hidden" aria-hidden="true" />
      {(loading || buffering) && !mediaError && <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-black/35 text-white" aria-live="polite">
        <span className="h-9 w-9 animate-spin rounded-full border-2 border-white/25 border-t-white" />
        <span className="text-xs">{loading ? 'Loading stream…' : 'Buffering…'}</span>
      </div>}
      {mediaError && <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-black/85 p-6 text-center text-white">
        <span className="text-2xl">⚠</span><p className="max-w-sm text-sm">{mediaError}</p>
        {src && <button onClick={() => { setMediaError(''); void videoRef.current?.play().catch(() => {}); }} className="rounded bg-white px-4 py-2 text-sm font-medium text-black">Try again</button>}
      </div>}
      {!playing && !loading && !mediaError && <button onClick={togglePlay} aria-label="Play video" className="absolute left-1/2 top-1/2 z-10 flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/25 bg-black/55 text-xl text-white backdrop-blur">▶</button>}

      {countdown !== null && nextVideo && <div className="absolute right-3 top-12 z-30 w-[min(300px,calc(100%-24px))] rounded-lg border border-white/15 bg-black/90 p-4 text-white shadow-xl">
        <p className="text-[10px] uppercase tracking-[0.18em] text-emerald-300">Up next · {countdown}s</p>
        <p className="mt-1 line-clamp-2 text-sm font-medium">{nextVideo.title}</p>
        <div className="mt-3 flex gap-2"><button onClick={onNext} className="rounded bg-primary px-3 py-1.5 text-xs font-semibold text-bg">Play now</button><button onClick={() => setCountdown(null)} className="rounded border border-white/25 px-3 py-1.5 text-xs">Cancel</button></div>
      </div>}

      <div className={`absolute bottom-0 left-0 right-0 z-20 bg-gradient-to-t from-black/95 via-black/60 to-transparent px-3 pb-3 pt-12 text-white transition-opacity sm:px-4 ${controlsVisible || !playing ? 'opacity-100' : 'pointer-events-none opacity-0'}`}>
        <div role="slider" aria-label="Video timeline" aria-valuemin={0} aria-valuemax={Math.round(duration)} aria-valuenow={Math.round(current)} tabIndex={0}
          onMouseMove={(e) => handleTimelineHover(e.clientX, e.currentTarget)}
          onMouseLeave={() => setHover(null)} onClick={(e) => seekAtClientX(e.clientX, e.currentTarget)}
          onKeyDown={(e) => { if (e.key === 'ArrowLeft') seek(-10); if (e.key === 'ArrowRight') seek(10); }}
          className="group relative mb-3 h-2 cursor-pointer rounded-full bg-white/25 outline-none focus-visible:ring-2 focus-visible:ring-primary">
          <div className="absolute inset-y-0 left-0 rounded-full bg-white/30" style={{ width: `${buffered}%` }} />
          <div className="absolute inset-y-0 left-0 rounded-full bg-primary" style={{ width: `${progressPercent}%` }} />
          <div className="absolute -top-1 h-4 w-1 -translate-x-1/2 rounded bg-primary opacity-0 group-hover:opacity-100" style={{ left: `${progressPercent}%` }} />
          {hover && duration > 0 && <div className="pointer-events-none absolute -top-[112px] z-30 -translate-x-1/2 overflow-hidden rounded border border-white/25 bg-black shadow-lg" style={{ left: `${Math.max(14, Math.min(86, hover.x))}%`, width: 160 }}>
            {previewImage ? <img src={previewImage} alt="Video frame preview" width={160} height={90} className="block h-[90px] w-40 object-cover" /> : <div className="flex h-[90px] w-40 items-center justify-center bg-white/10 text-[10px] text-white/70">Frame preview</div>}
            <span className="block py-1 text-center font-mono text-[11px] text-white">{fmt(hover.time)}</span>
          </div>}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs sm:gap-x-4">
          <button onClick={togglePlay} aria-label={playing ? 'Pause' : 'Play'} className="text-lg leading-none">{playing ? 'Ⅱ' : '▶'}</button>
          <button onClick={() => seek(-10)} title="Seek back 10 seconds" className="whitespace-nowrap">↶ 10s</button>
          <button onClick={() => seek(10)} title="Seek forward 10 seconds" className="whitespace-nowrap">10s ↷</button>
          <span className="whitespace-nowrap font-mono text-[11px]">{fmt(current)} <span className="text-white/50">/ {fmt(duration)}</span> <span className="text-white/60">(−{fmt(Math.max(0, duration - current))})</span></span>
          <button onClick={() => setMuted((v) => !v)} title="Mute (M)" className="text-base">{muted || volume === 0 ? '🔇' : '🔊'}</button>
          <input aria-label="Volume" type="range" min={0} max={1} step={0.05} value={volume} onChange={(e) => setVolume(Number(e.target.value))} className="w-16 accent-primary sm:w-20" />
          <select aria-label="Playback speed" value={speed} onChange={(e) => setSpeed(Number(e.target.value))} className="rounded border border-white/30 bg-black/60 px-1.5 py-1 text-[11px]">
            {SPEEDS.map((s) => <option key={s} value={s}>{s}×</option>)}
          </select>
          <span className="hidden font-mono text-[10px] text-white/65 sm:inline">{resolution}</span>
          <span className="flex-1" />
          {nextVideo && onNext && <button onClick={onNext} title="Next video (N)" className="whitespace-nowrap">Next ▸</button>}
          <button disabled={!mock} onClick={() => setCaptionsOn((v) => !v)} title="Captions (C)" className={`font-semibold disabled:cursor-not-allowed disabled:opacity-40 ${captionsOn ? 'text-primary' : ''}`}>CC</button>
          {onToggleTheater && <button onClick={onToggleTheater} title="Theater mode (T)" className={theater ? 'text-primary' : ''}>▰</button>}
          <button onClick={togglePiP} title="Picture in Picture (P)">PiP</button>
          <button onClick={toggleFullscreen} title="Fullscreen (F)" className="text-base">⛶</button>
        </div>
        <p className="mt-2 hidden text-[10px] text-white/55 sm:block">Space play/pause · ←/→ seek 10s · Shift+←/→ 30s · ↑/↓ volume · M mute · F fullscreen · P PiP · T theater · C captions · N next · Shift+, / Shift+. speed</p>
      </div>
    </div>
  );
}
