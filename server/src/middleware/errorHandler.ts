import { Request, Response, NextFunction } from 'express';
import { AppError, ValidationError } from '../utils/errors';
import { logger } from '../utils/logger';
import { ZodError } from 'zod';

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof ZodError) {
    res.status(422).json({
      error: 'VALIDATION_ERROR',
      message: 'Validation failed',
      details: err.flatten(),
    });
    return;
  }

  if (err instanceof ValidationError) {
    res.status(err.statusCode).json({
      error: err.code,
      message: err.message,
      details: err.details,
    });
    return;
  }

  if (err instanceof AppError) {
    if (err.statusCode >= 500) {
      logger.error({ err, path: req.path, method: req.method }, 'Server error');
    } else {
      logger.warn({ err, path: req.path, method: req.method }, 'Client error');
    }
    res.status(err.statusCode).json({
      error: err.code ?? 'ERROR',
      message: err.message,
    });
    return;
  }

  // Handle postgres unique violation
  const pgErr = err as { code?: string; constraint?: string; detail?: string };
  if (pgErr.code === '23505') {
    res.status(409).json({
      error: 'CONFLICT',
      message: 'Resource already exists',
      detail: pgErr.detail,
    });
    return;
  }

  logger.error({ err, path: req.path, method: req.method }, 'Unhandled error');
  res.status(500).json({
    error: 'INTERNAL_ERROR',
    message: 'An unexpected error occurred',
  });
}
