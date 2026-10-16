import type { NextFunction, Request, Response } from 'express';

export class AppError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const errors = {
  unauthorized: () => new AppError(401, 'unauthorized', 'You need to be logged in to do that.'),
  forbidden: (msg = "You don't have access to do that.") => new AppError(403, 'forbidden', msg),
  notFound: (thing = 'Resource') => new AppError(404, 'not_found', `${thing} not found.`),
  quotaExceeded: () => new AppError(429, 'quota_exceeded', "You've used all your downloads for today."),
  planRequired: (plan: string) => new AppError(403, 'plan_required', `This requires the ${plan} plan or higher.`),
};

// Central error handler — mounted last in app.ts.
// Never leaks stack traces or internal messages to the client in production.
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message } });
  }
  console.error(err); // real deployment: pipe to structured logging (not stdout)
  return res.status(500).json({ error: { code: 'internal_error', message: 'Something went wrong on our end.' } });
}
