import { describe, it, expect } from 'vitest';
import {
  SisuError,
  MiddlewareError,
  ToolExecutionError,
  AdapterError,
  ValidationError,
  TimeoutError,
  CancellationError,
  ConfigurationError,
  isSisuError,
  getErrorDetails,
} from '../src/errors.js';

describe('SisuError', () => {
  it('should create a basic error with code and message', () => {
    const error = new SisuError('Test error', 'TEST_ERROR');
    
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(SisuError);
    expect(error.name).toBe('SisuError');
    expect(error.message).toBe('Test error');
    expect(error.code).toBe('TEST_ERROR');
    expect(error.context).toBeUndefined();
  });

  it('should include optional context', () => {
    const context = { foo: 'bar', count: 42 };
    const error = new SisuError('Test error', 'TEST_ERROR', context);
    
    expect(error.context).toEqual(context);
  });

  it('should serialize to JSON correctly', () => {
    const error = new SisuError('Test error', 'TEST_ERROR', { foo: 'bar' });
    const json = error.toJSON();
    
    expect(json).toMatchObject({
      name: 'SisuError',
      message: 'Test error',
      code: 'TEST_ERROR',
      context: { foo: 'bar' },
    });
    expect(json.stack).toBeDefined();
  });

  it('should maintain proper stack trace', () => {
    const error = new SisuError('Test error', 'TEST_ERROR');
    expect(error.stack).toBeDefined();
    expect(error.stack).toContain('SisuError');
  });
});

describe('MiddlewareError', () => {
  it('should create middleware error with index', () => {
    const error = new MiddlewareError('Middleware failed', 2);
    
    expect(error).toBeInstanceOf(SisuError);
    expect(error.name).toBe('MiddlewareError');
    expect(error.code).toBe('MIDDLEWARE_ERROR');
    expect(error.message).toBe('Middleware failed');
    expect(error.middlewareIndex).toBe(2);
  });

  it('should include cause error', () => {
    const cause = new Error('Original error');
    const error = new MiddlewareError('Middleware failed', 1, cause);
    
    expect(error.context).toMatchObject({
      middlewareIndex: 1,
      cause,
    });
  });
});

describe('ToolExecutionError', () => {
  it('should create tool execution error with details', () => {
    const args = { city: 'Stockholm' };
    const error = new ToolExecutionError('Tool failed', 'getWeather', args);
    
    expect(error).toBeInstanceOf(SisuError);
    expect(error.name).toBe('ToolExecutionError');
    expect(error.code).toBe('TOOL_EXECUTION_ERROR');
    expect(error.toolName).toBe('getWeather');
    expect(error.args).toEqual(args);
  });

  it('should include cause error', () => {
    const cause = new Error('Network timeout');
    const error = new ToolExecutionError('Tool failed', 'fetchData', {}, cause);
    
    expect(error.context).toMatchObject({
      toolName: 'fetchData',
      args: {},
      cause,
    });
  });
});

describe('AdapterError', () => {
  it('should create adapter error with model details', () => {
    const error = new AdapterError('API error', 'gpt-4', 'openai');
    
    expect(error).toBeInstanceOf(SisuError);
    expect(error.name).toBe('AdapterError');
    expect(error.code).toBe('ADAPTER_ERROR');
    expect(error.modelName).toBe('gpt-4');
    expect(error.provider).toBe('openai');
  });

  it('should work without provider', () => {
    const error = new AdapterError('Model error', 'llama-2');
    
    expect(error.modelName).toBe('llama-2');
    expect(error.provider).toBeUndefined();
  });
});

describe('ValidationError', () => {
  it('should create validation error with details', () => {
    const validationErrors = [
      { field: 'name', message: 'Required' },
      { field: 'age', message: 'Must be positive' },
    ];
    const data = { name: '', age: -1 };
    const error = new ValidationError('Validation failed', validationErrors, data);
    
    expect(error).toBeInstanceOf(SisuError);
    expect(error.name).toBe('ValidationError');
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.validationErrors).toEqual(validationErrors);
    expect(error.data).toEqual(data);
  });

  it('should work without data', () => {
    const error = new ValidationError('Invalid input', { error: 'bad' });
    
    expect(error.validationErrors).toEqual({ error: 'bad' });
    expect(error.data).toBeUndefined();
  });
});

describe('TimeoutError', () => {
  it('should create timeout error with duration', () => {
    const error = new TimeoutError('Operation timed out', 5000, 'fetchData');
    
    expect(error).toBeInstanceOf(SisuError);
    expect(error.name).toBe('TimeoutError');
    expect(error.code).toBe('TIMEOUT_ERROR');
    expect(error.timeoutMs).toBe(5000);
    expect(error.operation).toBe('fetchData');
  });

  it('should work without operation name', () => {
    const error = new TimeoutError('Timeout', 3000);
    
    expect(error.timeoutMs).toBe(3000);
    expect(error.operation).toBeUndefined();
  });
});

describe('CancellationError', () => {
  it('should create cancellation error', () => {
    const error = new CancellationError('User cancelled', 'user_abort');
    
    expect(error).toBeInstanceOf(SisuError);
    expect(error.name).toBe('CancellationError');
    expect(error.code).toBe('CANCELLATION_ERROR');
    expect(error.reason).toBe('user_abort');
  });

  it('should work without reason', () => {
    const error = new CancellationError('Cancelled');
    
    expect(error.reason).toBeUndefined();
  });
});

describe('ConfigurationError', () => {
  it('should create configuration error with details', () => {
    const config = { port: 'invalid' };
    const error = new ConfigurationError(
      'Invalid config',
      config,
      'port must be a number'
    );
    
    expect(error).toBeInstanceOf(SisuError);
    expect(error.name).toBe('ConfigurationError');
    expect(error.code).toBe('CONFIGURATION_ERROR');
    expect(error.config).toEqual(config);
    expect(error.expected).toBe('port must be a number');
  });

  it('should work with minimal parameters', () => {
    const error = new ConfigurationError('Bad config');
    
    expect(error.config).toBeUndefined();
    expect(error.expected).toBeUndefined();
  });
});

describe('isSisuError', () => {
  it('should identify SisuError instances', () => {
    const sisuError = new SisuError('Test', 'TEST');
    const middlewareError = new MiddlewareError('Test', 0);
    const toolError = new ToolExecutionError('Test', 'tool', {});
    
    expect(isSisuError(sisuError)).toBe(true);
    expect(isSisuError(middlewareError)).toBe(true);
    expect(isSisuError(toolError)).toBe(true);
  });

  it('should reject non-SisuError instances', () => {
    const regularError = new Error('Regular error');
    const customError = { name: 'CustomError', message: 'test' };
    
    expect(isSisuError(regularError)).toBe(false);
    expect(isSisuError(customError)).toBe(false);
    expect(isSisuError(null)).toBe(false);
    expect(isSisuError(undefined)).toBe(false);
    expect(isSisuError('error')).toBe(false);
  });
});

describe('getErrorDetails', () => {
  it('should extract details from SisuError', () => {
    const error = new SisuError('Test error', 'TEST_CODE', { foo: 'bar' });
    const details = getErrorDetails(error);
    
    expect(details).toMatchObject({
      name: 'SisuError',
      message: 'Test error',
      code: 'TEST_CODE',
      context: { foo: 'bar' },
    });
    expect(details.stack).toBeDefined();
  });

  it('should extract details from MiddlewareError', () => {
    const error = new MiddlewareError('Failed', 3);
    const details = getErrorDetails(error);
    
    expect(details.name).toBe('MiddlewareError');
    expect(details.code).toBe('MIDDLEWARE_ERROR');
    expect(details.context).toMatchObject({ middlewareIndex: 3 });
  });

  it('should handle regular Error instances', () => {
    const error = new Error('Regular error');
    const details = getErrorDetails(error);
    
    expect(details.name).toBe('Error');
    expect(details.message).toBe('Regular error');
    expect(details.code).toBeUndefined();
    expect(details.stack).toBeDefined();
  });

  it('should handle non-Error objects', () => {
    const details1 = getErrorDetails('string error');
    expect(details1).toEqual({
      name: 'UnknownError',
      message: 'string error',
    });

    const details2 = getErrorDetails({ custom: 'object' });
    expect(details2.name).toBe('UnknownError');
    expect(details2.message).toContain('object');
  });

  it('should handle null and undefined', () => {
    const details1 = getErrorDetails(null);
    expect(details1.name).toBe('UnknownError');
    
    const details2 = getErrorDetails(undefined);
    expect(details2.name).toBe('UnknownError');
  });
});

describe('Error inheritance and instanceof', () => {
  it('should maintain proper prototype chain', () => {
    const error = new MiddlewareError('Test', 0);
    
    expect(error instanceof Error).toBe(true);
    expect(error instanceof SisuError).toBe(true);
    expect(error instanceof MiddlewareError).toBe(true);
  });

  it('should allow catching by base class', () => {
    expect(() => {
      try {
        throw new ToolExecutionError('Failed', 'myTool', {});
      } catch (err) {
        if (err instanceof SisuError) {
          expect(err.code).toBe('TOOL_EXECUTION_ERROR');
        } else {
          throw new Error('Should be SisuError');
        }
      }
    }).not.toThrow();
  });
});

describe('Error context preservation', () => {
  it('should preserve nested cause errors', () => {
    const originalError = new Error('Original');
    const middleError = new MiddlewareError('Middle', 1, originalError);
    const topError = new ToolExecutionError('Top', 'tool', {}, middleError);
    
    const context = topError.context as any;
    expect(context.cause).toBe(middleError);
    expect((context.cause.context as any).cause).toBe(originalError);
  });

  it('should serialize complex context', () => {
    const complexContext = {
      nested: { data: [1, 2, 3] },
      func: 'not serialized',
      date: new Date('2024-01-01'),
    };
    const error = new SisuError('Test', 'TEST', complexContext);
    const json = error.toJSON();
    
    expect(json.context).toBeDefined();
  });
});