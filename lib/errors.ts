/**
 * Custom Error Classes for better error handling
 */

/**
 * Base Application Error
 */
export class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details?: any;

  constructor(
    code: string,
    statusCode: number,
    message: string,
    details?: any
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;

    // Maintain proper stack trace
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

/**
 * Resource Not Found Error
 */
export class NotFoundError extends AppError {
  constructor(resource: string, id?: string) {
    const message = id
      ? `${resource} with id ${id} not found`
      : `${resource} not found`;

    super('NOT_FOUND', 404, message);
    Object.setPrototypeOf(this, NotFoundError.prototype);
  }
}

/**
 * Unauthorized Error
 */
export class UnauthorizedError extends AppError {
  constructor(message = 'User not authenticated') {
    super('UNAUTHORIZED', 401, message);
    Object.setPrototypeOf(this, UnauthorizedError.prototype);
  }
}

/**
 * Forbidden Error
 */
export class ForbiddenError extends AppError {
  constructor(message = 'User does not have permission') {
    super('FORBIDDEN', 403, message);
    Object.setPrototypeOf(this, ForbiddenError.prototype);
  }
}

/**
 * Validation Error
 */
export class ValidationError extends AppError {
  public readonly fields: Record<string, string[]>;

  constructor(message: string, fields: Record<string, string[]> = {}) {
    super('VALIDATION_ERROR', 400, message);
    this.fields = fields;
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

/**
 * Conflict Error (e.g., duplicate)
 */
export class ConflictError extends AppError {
  constructor(message: string, code = 'CONFLICT') {
    super(code, 409, message);
    Object.setPrototypeOf(this, ConflictError.prototype);
  }
}

/**
 * Too Many Requests Error (Rate Limiting)
 */
export class RateLimitError extends AppError {
  public readonly retryAfter?: number;

  constructor(message = 'Too many requests', retryAfter?: number) {
    super('RATE_LIMIT_EXCEEDED', 429, message);
    this.retryAfter = retryAfter;
    Object.setPrototypeOf(this, RateLimitError.prototype);
  }
}

/**
 * Database Error
 */
export class DatabaseError extends AppError {
  constructor(message: string, details?: any) {
    super('DATABASE_ERROR', 500, message, details);
    Object.setPrototypeOf(this, DatabaseError.prototype);
  }
}

/**
 * Network Error
 */
export class NetworkError extends AppError {
  constructor(message = 'Network request failed') {
    super('NETWORK_ERROR', 0, message);
    Object.setPrototypeOf(this, NetworkError.prototype);
  }
}

/**
 * Timeout Error
 */
export class TimeoutError extends AppError {
  constructor(message = 'Request timeout') {
    super('TIMEOUT', 408, message);
    Object.setPrototypeOf(this, TimeoutError.prototype);
  }
}

/**
 * Business Logic Error
 */
export class BusinessLogicError extends AppError {
  constructor(message: string, code = 'BUSINESS_LOGIC_ERROR') {
    super(code, 400, message);
    Object.setPrototypeOf(this, BusinessLogicError.prototype);
  }
}

/**
 * Check if error is AppError instance
 */
export const isAppError = (error: any): error is AppError => {
  return error instanceof AppError;
};

/**
 * Check if error is a chunk load error (dynamic import failure)
 */
export const isChunkLoadError = (error: any): boolean => {
  if (!error) return false;
  const message = error.message || String(error);
  return (
    message.includes('Failed to fetch dynamically imported module') ||
    message.includes('Loading chunk') ||
    message.includes('unexpected token <') || // Often happens when index.html is served instead of a JS chunk
    message.includes('NetworkError')
  );
};

/**
 * Get user-friendly error message
 */
export const getErrorMessage = (error: any): string => {
  if (isAppError(error)) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  return 'An unexpected error occurred';
};

/**
 * Get error status code
 */
export const getErrorStatusCode = (error: any): number => {
  if (isAppError(error)) {
    return error.statusCode;
  }

  return 500;
};

/**
 * Log error for debugging
 */
export const logError = (error: any, context?: string) => {
  const timestamp = new Date().toISOString();

  if (isAppError(error)) {
    console.error(
      `[${timestamp}] ${context ? `[${context}] ` : ''}${error.code}: ${error.message}`,
      error.details
    );
  } else if (error instanceof Error) {
    console.error(
      `[${timestamp}] ${context ? `[${context}] ` : ''}${error.name}: ${error.message}`,
      error.stack
    );
  } else {
    console.error(`[${timestamp}] ${context ? `[${context}] ` : ''}Unknown error:`, error);
  }
};
