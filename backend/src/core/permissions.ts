const PLAN_RANK: Record<string, number> = { FREE: 0, BRONZE: 1, SILVER: 2, GOLD: 3 };

export type Subject = {
  id: string;
  role: 'free' | 'bronze' | 'silver' | 'gold' | 'instructor' | 'admin';
  planCode: string;
  instructorContentAccess?: boolean;
};

type Resource = { ownerId?: string; requiredPlan?: string };

const planRank = (code: string) => PLAN_RANK[code] ?? 0;

/**
 * Single source of truth for authorization. Every route handler calls this —
 * never re-implement a plan/role check inline in a route.
 * Deny-by-default: an action with no case here is rejected, not allowed.
 */
export function can(subject: Subject, action: string, resource?: Resource): boolean {
  if (subject.role === 'admin') return true;

  switch (action) {
    case 'video.watch':
      return (
        planRank(subject.planCode) >= planRank(resource?.requiredPlan ?? 'FREE') ||
        (subject.role === 'instructor' && !!subject.instructorContentAccess)
      );

    case 'video.download':
      // Quota amount is enforced separately in the downloads module transaction —
      // this only gates whether the plan can download at all (always true here;
      // FREE still gets 1/day per the plan config).
      return true;

    case 'course.create':
    case 'course.edit':
    case 'course.video.upload':
      return subject.role === 'instructor' && resource?.ownerId === subject.id;

    case 'meeting.host':
      return subject.role === 'instructor' || subject.planCode === 'GOLD';

    case 'meeting.join':
      return subject.planCode !== 'FREE' || subject.role === 'instructor';

    case 'meeting.moderate': // mute/remove/lock — checked again against live participant_role in the DB
      return true; // route handler additionally verifies host/co-host on the specific meeting

    case 'comment.moderate':
    case 'user.manage':
    case 'analytics.platform':
      return false; // admin-only — already returned true above for admins

    default:
      return false;
  }
}
