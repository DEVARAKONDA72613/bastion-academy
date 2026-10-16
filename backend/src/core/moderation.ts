// Pattern-level moderation checks. These are intentionally conservative and
// simple — a real deployment should back this with a proper moderation API
// (e.g. Perspective API) for profanity/toxicity scoring; this gives you a
// working, honest baseline (link/flood/repetition detection) without one.

const SUSPICIOUS_LINK_PATTERN = /https?:\/\/[^\s]+/gi;
const REPEATED_CHAR_PATTERN = /(.)\1{6,}/; // same char 7+ times in a row
const REPEATED_EMOJI_PATTERN = /([\u{1F300}-\u{1FAFF}])\1{4,}/u;

export type ModerationResult = { allowed: boolean; reason?: string; flagged?: boolean };

export function checkComment(content: string): ModerationResult {
  if (!content || content.trim().length === 0) return { allowed: false, reason: 'empty' };
  if (content.length > 2000) return { allowed: false, reason: 'too_long' };

  const linkMatches = content.match(SUSPICIOUS_LINK_PATTERN);
  if (linkMatches && linkMatches.length > 2) {
    return { allowed: true, flagged: true, reason: 'multiple_links' }; // allow but flag for review, don't auto-delete
  }
  if (REPEATED_CHAR_PATTERN.test(content) || REPEATED_EMOJI_PATTERN.test(content)) {
    return { allowed: true, flagged: true, reason: 'repeated_characters' };
  }
  return { allowed: true };
}

// Simple per-user flood check — call this with the user's recent comment
// timestamps (last 60s) before allowing a new post.
export function isFlooding(recentTimestamps: Date[], windowMs = 60_000, maxInWindow = 5): boolean {
  const cutoff = Date.now() - windowMs;
  return recentTimestamps.filter((t) => t.getTime() > cutoff).length >= maxInWindow;
}
