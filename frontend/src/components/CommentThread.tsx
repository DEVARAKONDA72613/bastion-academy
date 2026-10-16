'use client';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/AuthContext';

type Comment = {
  id: string;
  parent_comment_id?: string | null;
  content: string;
  original_language?: string;
  is_edited?: boolean;
  edited_at?: string | null;
  status?: string;
  created_at: string;
  user_id: string | null;
  display_name?: string | null;
  avatar_url?: string | null;
  city?: string | null;
  like_count?: number | string;
  dislike_count?: number | string;
  reply_count?: number | string;
};
type TranslationState = { translated: string; showingOriginal: boolean };

function MentionText({ content }: { content: string }) {
  const pieces = content.split(/(@[\w.-]{1,40})/g);
  return <>{pieces.map((piece, index) => piece.startsWith('@')
    ? <span key={`${piece}-${index}`} className="font-medium text-primary">{piece}</span>
    : <span key={index}>{piece}</span>)}</>;
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export function CommentThread({ videoId }: { videoId: string }) {
  const { user } = useAuth();
  const [comments, setComments] = useState<Comment[]>([]);
  const [replies, setReplies] = useState<Record<string, Comment[]>>({});
  const [content, setContent] = useState('');
  const [sort, setSort] = useState<'newest' | 'oldest' | 'top' | 'relevant'>('newest');
  const [posting, setPosting] = useState(false);
  const [replyTo, setReplyTo] = useState<{ rootId: string; name: string } | null>(null);
  const [replyContent, setReplyContent] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [translations, setTranslations] = useState<Record<string, TranslationState>>({});
  const [language, setLanguage] = useState(user?.preferred_language || 'en');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (user?.preferred_language) setLanguage(user.preferred_language);
  }, [user?.preferred_language]);

  const load = useCallback(async () => {
    try {
      const result = await api.listComments(videoId, sort) as Comment[];
      setComments(result);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Could not load the discussion.');
    }
  }, [videoId, sort]);

  useEffect(() => { void load(); }, [load]);

  async function loadReplies(commentId: string) {
    setExpanded((old) => ({ ...old, [commentId]: !old[commentId] }));
    if (replies[commentId]) return;
    try {
      const result = await api.listReplies(commentId) as Comment[];
      setReplies((old) => ({ ...old, [commentId]: result }));
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Could not load replies.');
    }
  }

  async function submitTopLevel(e: FormEvent) {
    e.preventDefault();
    if (!content.trim()) return;
    setPosting(true);
    setNotice('');
    try {
      await api.postComment(videoId, content.trim());
      setContent('');
      await load();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Comment could not be posted.');
    } finally { setPosting(false); }
  }

  async function submitReply(e: FormEvent, rootId: string) {
    e.preventDefault();
    if (!replyContent.trim() || !replyTo) return;
    setPosting(true);
    setNotice('');
    try {
      const text = replyTo.name ? `@${replyTo.name.replace(/^@/, '').replace(/\s+/g, '_')} ${replyContent.trim()}` : replyContent.trim();
      await api.postComment(videoId, text, rootId);
      setReplyContent('');
      setReplyTo(null);
      setReplies((old) => ({ ...old, [rootId]: [] }));
      const result = await api.listReplies(rootId) as Comment[];
      setReplies((old) => ({ ...old, [rootId]: result }));
      setExpanded((old) => ({ ...old, [rootId]: true }));
      await load();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Reply could not be posted.');
    } finally { setPosting(false); }
  }

  async function saveEdit(commentId: string) {
    setBusyId(commentId);
    setNotice('');
    try {
      await api.editComment(commentId, editContent.trim());
      setEditingId(null);
      await load();
      const roots = Object.keys(replies).filter((id) => replies[id]);
      for (const root of roots) setReplies((old) => ({ ...old, [root]: old[root].map((r) => r.id === commentId ? { ...r, content: editContent.trim(), is_edited: true } : r) }));
    } catch (err) { setNotice(err instanceof Error ? err.message : 'Edit failed.'); }
    finally { setBusyId(null); }
  }

  async function removeComment(commentId: string) {
    if (!window.confirm('Delete this comment? Replies may remain visible in the thread.')) return;
    setBusyId(commentId);
    try {
      await api.deleteComment(commentId);
      await load();
      setReplies((old) => Object.fromEntries(Object.entries(old).map(([root, items]) => [root, items?.map((r) => r.id === commentId ? { ...r, status: 'deleted', content: '[comment deleted]' } : r)])));
    } catch (err) { setNotice(err instanceof Error ? err.message : 'Delete failed.'); }
    finally { setBusyId(null); }
  }

  async function translate(comment: Comment) {
    setBusyId(comment.id);
    try {
      if (translations[comment.id]) {
        setTranslations((old) => ({ ...old, [comment.id]: { ...old[comment.id], showingOriginal: !old[comment.id].showingOriginal } }));
        return;
      }
      const result = await api.translateComment(comment.id, language);
      setTranslations((old) => ({ ...old, [comment.id]: { translated: result.translated, showingOriginal: false } }));
    } catch (err) { setNotice(err instanceof Error ? err.message : 'Translation is currently unavailable.'); }
    finally { setBusyId(null); }
  }

  async function report(commentId: string) {
    const reason = window.prompt('Report reason: spam, harassment, offensive, or other', 'spam');
    if (!reason) return;
    const normalized = reason.trim().toLowerCase();
    if (!['spam', 'harassment', 'offensive', 'other'].includes(normalized)) {
      setNotice('Choose spam, harassment, offensive, or other.');
      return;
    }
    try { await api.reportComment(commentId, normalized); setNotice('Report sent to moderators for review.'); }
    catch (err) { setNotice(err instanceof Error ? err.message : 'Report failed.'); }
  }

  async function vote(commentId: string, voteType: 'like' | 'dislike') {
    try { await api.likeComment(commentId, voteType); await load(); }
    catch (err) { setNotice(err instanceof Error ? err.message : 'Vote failed.'); }
  }

  function renderComment(comment: Comment, rootId?: string) {
    const isTombstone = comment.status === 'deleted';
    const isOwner = !!user?.id && comment.user_id === user.id;
    const insideEditWindow = Date.now() - new Date(comment.created_at).getTime() <= 15 * 60 * 1000;
    const translated = translations[comment.id];
    const displayedContent = isTombstone ? '[comment deleted]' : translated && !translated.showingOriginal ? translated.translated : comment.content;
    const isReply = !!rootId;
    return (
      <article key={comment.id} className={`min-w-0 ${isReply ? 'border-l border-border pl-3' : ''}`}>
        <div className="flex items-start gap-3">
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-surface text-xs font-semibold text-primary">
            {comment.avatar_url ? <img src={comment.avatar_url} alt="" className="h-full w-full object-cover" /> : (comment.display_name || 'U').slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
              <span className="font-medium">{comment.display_name || 'Former member'}</span>
              {comment.city && <span className="text-text-dim">{comment.city}</span>}
              <span className="text-text-dim">{formatDate(comment.created_at)}</span>
              {comment.is_edited && <span className="text-text-dim">· edited</span>}
            </div>
            <p className={`mt-1 whitespace-pre-wrap break-words text-sm leading-6 ${isTombstone ? 'italic text-text-dim' : ''}`}>
              {isTombstone ? displayedContent : <MentionText content={displayedContent} />}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-dim">
              {!isTombstone && <>
                <button onClick={() => vote(comment.id, 'like')} className="hover:text-primary">↑ {comment.like_count ?? 0}</button>
                <button onClick={() => vote(comment.id, 'dislike')} className="hover:text-primary">↓ {comment.dislike_count ?? 0}</button>
                <button onClick={() => { setReplyTo({ rootId: rootId ?? comment.id, name: comment.display_name || '' }); setReplyContent(''); }} className="hover:text-primary">Reply</button>
                <button disabled={busyId === comment.id} onClick={() => translate(comment)} className="hover:text-primary disabled:opacity-50">{translated ? (translated.showingOriginal ? 'Show translation' : 'Show original') : 'Translate'}</button>
                {isOwner && insideEditWindow && <button onClick={() => { setEditingId(comment.id); setEditContent(comment.content); }} className="hover:text-primary">Edit</button>}
                {isOwner && insideEditWindow && <button disabled={busyId === comment.id} onClick={() => void removeComment(comment.id)} className="hover:text-error disabled:opacity-50">Delete</button>}
                <button onClick={() => void report(comment.id)} className="hover:text-error">Report</button>
              </>}
              {!isReply && <button onClick={() => void loadReplies(comment.id)} className="hover:text-primary">{expanded[comment.id] ? 'Hide replies' : `Replies (${comment.reply_count ?? 0})`}</button>}
            </div>
            {editingId === comment.id && <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              <input value={editContent} onChange={(e) => setEditContent(e.target.value)} maxLength={2000} className="min-w-0 flex-1 rounded border border-border bg-surface px-3 py-2 text-sm" aria-label="Edit comment" />
              <button onClick={() => void saveEdit(comment.id)} disabled={!editContent.trim() || busyId === comment.id} className="rounded bg-primary px-3 py-2 text-xs font-medium text-bg disabled:opacity-50">Save</button>
              <button onClick={() => setEditingId(null)} className="rounded border border-border px-3 py-2 text-xs">Cancel</button>
            </div>}
            {replyTo && replyTo.rootId === (rootId ?? comment.id) && <form onSubmit={(e) => void submitReply(e, rootId ?? comment.id)} className="mt-3 flex gap-2">
              <input autoFocus value={replyContent} onChange={(e) => setReplyContent(e.target.value)} placeholder={`Reply to ${replyTo.name || 'this comment'}…`} maxLength={2000} className="min-w-0 flex-1 rounded border border-border bg-surface px-3 py-2 text-sm" />
              <button disabled={posting || !replyContent.trim()} className="rounded bg-primary px-3 py-2 text-xs font-medium text-bg disabled:opacity-50">Send</button>
            </form>}
            {!isReply && expanded[comment.id] && <div className="mt-3 space-y-4">
              {(replies[comment.id] || []).map((reply) => renderComment(reply, comment.id))}
              {replies[comment.id]?.length === 0 && <p className="text-xs text-text-dim">No replies yet.</p>}
            </div>}
          </div>
        </div>
      </article>
    );
  }

  return (
    <section className="min-w-0" aria-label="Video discussion">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-semibold">Discussion <span className="ml-1 font-mono text-xs text-text-dim">{comments.length}</span></h3>
        <div className="flex items-center gap-2">
          <label className="text-xs text-text-dim" htmlFor="comment-language">Translate to</label>
          <select id="comment-language" value={language} onChange={(e) => setLanguage(e.target.value)} className="max-w-28 rounded border border-border bg-surface px-2 py-1 text-xs text-text">
            <option value="en">English</option><option value="hi">Hindi</option><option value="ta">Tamil</option><option value="te">Telugu</option><option value="es">Spanish</option><option value="fr">French</option>
          </select>
          <select aria-label="Sort comments" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className="rounded border border-border bg-surface px-2 py-1 text-xs text-text-dim">
            <option value="newest">Newest</option><option value="oldest">Oldest</option><option value="top">Most liked</option><option value="relevant">Most relevant</option>
          </select>
        </div>
      </div>
      <form onSubmit={submitTopLevel} className="mb-5 flex gap-2">
        <input value={content} onChange={(e) => setContent(e.target.value)} placeholder="Ask a question or share an insight…" maxLength={2000} className="min-w-0 flex-1 rounded border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary" />
        <button disabled={posting || !content.trim()} className="rounded bg-primary px-4 py-2 text-sm font-medium text-bg disabled:opacity-50">Post</button>
      </form>
      {notice && <p role="status" className="mb-3 rounded border border-border bg-surface px-3 py-2 text-xs text-text-dim">{notice}</p>}
      <div className="space-y-5">
        {comments.map((comment) => <div key={comment.id} className="border-b border-border pb-5">{renderComment(comment)}</div>)}
        {comments.length === 0 && <p className="rounded border border-border bg-surface p-4 text-sm text-text-dim">No comments yet. Start the discussion.</p>}
      </div>
      <p className="mt-4 text-[11px] text-text-dim">Please keep the discussion constructive. Translation may be provided by a demo adapter.</p>
    </section>
  );
}
