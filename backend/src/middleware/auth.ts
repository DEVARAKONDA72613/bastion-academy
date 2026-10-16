import type { NextFunction, Request, Response } from 'express';
import { errors } from '../core/errors.js';
import { can, type Subject } from '../core/permissions.js';
import { findSessionByToken, SESSION_COOKIE_NAME } from '../core/session.js';
import { loadSubject } from '../core/subject.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      subject?: Subject;
      sessionId?: string;
    }
  }
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const token = req.cookies?.[SESSION_COOKIE_NAME];
  if (!token) return next(errors.unauthorized());

  const session = await findSessionByToken(token);
  if (!session) return next(errors.unauthorized());

  const subject = await loadSubject(session.user_id);
  if (!subject) return next(errors.unauthorized());

  req.subject = subject;
  req.sessionId = session.id;
  next();
}

export function requirePlan(minPlan: string) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.subject) return next(errors.unauthorized());
    if (!can(req.subject, 'video.watch', { requiredPlan: minPlan })) {
      return next(errors.planRequired(minPlan));
    }
    next();
  };
}

export function requireRole(...roles: Subject['role'][]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.subject) return next(errors.unauthorized());
    if (!roles.includes(req.subject.role)) return next(errors.forbidden());
    next();
  };
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  if (!req.subject) return next(errors.unauthorized());
  if (req.subject.role !== 'admin') return next(errors.forbidden());
  next();
}
