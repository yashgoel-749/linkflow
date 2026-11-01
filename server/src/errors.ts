import { randomUUID } from 'node:crypto';
import type { ErrorRequestHandler, RequestHandler } from 'express';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public fields?: unknown
  ) {
    super(message);
  }
}
export const requestId: RequestHandler = (_req, res, next) => {
  res.locals.requestId = randomUUID();
  res.setHeader('X-Request-Id', res.locals.requestId);
  next();
};
export const errors: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
  void _next;
  let status = 500;
  let code = 'INTERNAL_ERROR';
  let message = 'An unexpected error occurred';
  let fields: unknown;
  if (error instanceof HttpError) ({ status, code, message, fields } = error);
  else if (error instanceof ZodError) {
    status = 400;
    code = 'VALIDATION_ERROR';
    message = 'Invalid input';
    fields = error.flatten();
  } else if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    status = 409;
    code = 'CONFLICT';
    message = 'Email, domain, or alias already exists';
  } else if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
    status = 404;
    code = 'NOT_FOUND';
    message = 'Resource not found';
  } else if (
    error instanceof Prisma.PrismaClientInitializationError ||
    error instanceof Prisma.PrismaClientUnknownRequestError ||
    (error instanceof Prisma.PrismaClientKnownRequestError &&
      ['P1001', 'P1002', 'P1017', 'P2024', 'P2028', 'P2034'].includes(error.code))
  ) {
    status = 503;
    code = 'DATABASE_UNAVAILABLE';
    message = 'Database temporarily unavailable';
  } else if (error instanceof SyntaxError && 'body' in error) {
    status = 400;
    code = 'INVALID_JSON';
    message = 'Invalid JSON body';
  } else if (error instanceof Error && 'status' in error && error.status === 413) {
    status = 413;
    code = 'PAYLOAD_TOO_LARGE';
    message = 'Request body too large';
  }
  if (status >= 500)
    process.stderr.write(
      JSON.stringify({
        level: 'error',
        requestId: res.locals.requestId,
        code,
        error: error instanceof Error ? error.message : 'unknown',
      }) + '\n'
    );
  res.status(status).json({
    error: { code, message, ...(fields === undefined ? {} : { fields }) },
    requestId: res.locals.requestId,
  });
};
