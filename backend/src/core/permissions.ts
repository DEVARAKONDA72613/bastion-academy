
const PLAN_RANK: Record<string, number> = {
  FREE: 0,
  BRONZE: 1,
  SILVER: 2,
  GOLD: 3,
};

export type Subject = {
  id: string;
  role: 'free' | 'bronze' | 'silver' | 'gold' | 'instructor' | 'admin';
  planCode: string;
  instructorContentAccess?: boolean;
};

type Resource = {
  ownerId?: string;
  requiredPlan?: string;
};

const planRank = (code: string) => PLAN_RANK[code] ?? 0;

/**
 * Central authorization policy.
 * Protected HTTP routes and socket connections must authenticate users
 * before using these permissions.
 */
export function can(
  subject: Subject,
  action: string,
  resource?: Resource
): boolean {
  if (subject.role === 'admin') return true;

  switch (action) {
    case 'video.watch':
      return (
        planRank(subject.planCode) >=
          planRank(resource?.requiredPlan ?? 'FREE') ||
        (subject.role === 'instructor' &&
          !!subject.instructorContentAccess)
      );

    case 'video.download':
      // The transactional download service enforces the plan quota.
      return true;

    case 'course.create':
    case 'course.edit':
    case 'course.video.upload':
      return (
        subject.role === 'instructor' &&
        resource?.ownerId === subject.id
      );

    case 'meeting.host':
      // Any authenticated plan can create a meeting.
      return true;

    case 'meeting.join':
      // Any authenticated plan can join a meeting.
      return true;

    case 'meeting.moderate':
      // Actual host/co-host permissions must be checked by the
      // meeting service for the specific meeting and target participant.
      return true;

    case 'comment.moderate':
    case 'user.manage':
    case 'analytics.platform':
      return false;

    default:
      return false;
  }
}
