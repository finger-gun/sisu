/**
 * Base error class for all Sisu errors.
 * Provides structured error information with error codes and context.
 */
export class SisuError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly context?: unknown
  ) {
    super(message);
    this.name = 'SisuError';
    // Maintain proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Convert error to JSON for logging and tracing
   */
  toJSON(): {
    name: string;
    message: string;
    code: string;
    context?: unknown;
    stack?: string;
  } {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      context: this.context,
      stack: this.stack,
    };
  }
}

/**
 * Error thrown when middleware execution fails.
 * Includes the middleware index to help identify which middleware failed.
 */
export class MiddlewareError extends SisuError {
  constructor(
    message: string,
    public readonly middlewareIndex: number,
    cause?: Error
  ) {
    super(message, 'MIDDLEWARE_ERROR', { middlewareIndex, cause });
    this.name = 'MiddlewareError';
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * Error thrown when tool execution fails.
 * Includes tool name and arguments for debugging.
 */
export class ToolExecutionError extends SisuError {
  constructor(
    message: string,
    public readonly toolName: string,
    public readonly args: unknown,
    cause?: Error
  ) {
    super(message, 'TOOL_EXECUTION_ERROR', { toolName, args, cause });
    this.name = 'ToolExecutionError';
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * Error thrown when adapter/LLM operations fail.
 * Includes model name and provider-specific details.
 */
export class AdapterError extends SisuError {
  constructor(
    message: string,
    public readonly modelName: string,
    public readonly provider?: string,
    cause?: Error
  ) {
    super(message, 'ADAPTER_ERROR', { modelName, provider, cause });
    this.name = 'AdapterError';
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * Error thrown when validation fails (e.g., schema validation for tools).
 * Includes validation errors and the data that failed validation.
 */
export class ValidationError extends SisuError {
  constructor(
    message: string,
    public readonly validationErrors: unknown,
    public readonly data?: unknown,
    cause?: Error
  ) {
    super(message, 'VALIDATION_ERROR', { validationErrors, data, cause });
    this.name = 'ValidationError';
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * Error thrown when a timeout occurs.
 * Includes timeout duration and operation details.
 */
export class TimeoutError extends SisuError {
  constructor(
    message: string,
    public readonly timeoutMs: number,
    public readonly operation?: string,
    cause?: Error
  ) {
    super(message, 'TIMEOUT_ERROR', { timeoutMs, operation, cause });
    this.name = 'TimeoutError';
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * Error thrown when an operation is cancelled (e.g., via AbortSignal).
 * Includes the reason for cancellation if available.
 */
export class CancellationError extends SisuError {
  constructor(
    message: string,
    public readonly reason?: string,
    cause?: Error
  ) {
    super(message, 'CANCELLATION_ERROR', { reason, cause });
    this.name = 'CancellationError';
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * Error thrown when a configuration is invalid.
 * Includes the invalid configuration and expected format.
 */
export class ConfigurationError extends SisuError {
  constructor(
    message: string,
    public readonly config?: unknown,
    public readonly expected?: string,
    cause?: Error
  ) {
    super(message, 'CONFIGURATION_ERROR', { config, expected, cause });
    this.name = 'ConfigurationError';
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * Helper to check if an error is a SisuError
 */
export function isSisuError(error: unknown): error is SisuError {
  return error instanceof SisuError;
}

/**
 * Helper to extract error details for logging
 */
export function getErrorDetails(error: unknown): {
  name: string;
  message: string;
  code?: string;
  context?: unknown;
  stack?: string;
} {
  if (isSisuError(error)) {
    return error.toJSON();
  }
  
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }
  
  return {
    name: 'UnknownError',
    message: String(error),
  };
}