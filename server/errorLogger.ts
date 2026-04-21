export interface ErrorLogEntry {
  timestamp: string;
  endpoint: string;
  method: string;
  errorType: string;
  message: string;
  stack?: string;
  requestBody?: any;
  userId?: string;
  userAgent?: string;
  ip?: string;
}

const errorLogs: ErrorLogEntry[] = [];
const MAX_LOGS = 500;

export function logError(
  endpoint: string,
  method: string,
  error: unknown,
  context?: {
    requestBody?: any;
    userId?: string;
    userAgent?: string;
    ip?: string;
  }
): void {
  const err = error instanceof Error ? error : new Error(String(error));
  
  const entry: ErrorLogEntry = {
    timestamp: new Date().toISOString(),
    endpoint,
    method,
    errorType: err.name || 'Error',
    message: err.message || 'Unknown error',
    stack: err.stack,
    requestBody: context?.requestBody ? sanitizeBody(context.requestBody) : undefined,
    userId: context?.userId,
    userAgent: context?.userAgent,
    ip: context?.ip,
  };

  errorLogs.unshift(entry);
  
  if (errorLogs.length > MAX_LOGS) {
    errorLogs.pop();
  }

  console.error(`[ERROR] ${entry.timestamp} | ${method} ${endpoint}`);
  console.error(`  Type: ${entry.errorType}`);
  console.error(`  Message: ${entry.message}`);
  if (entry.stack) {
    console.error(`  Stack: ${entry.stack.split('\n').slice(0, 5).join('\n    ')}`);
  }
  if (context?.requestBody) {
    console.error(`  Body: ${JSON.stringify(sanitizeBody(context.requestBody)).slice(0, 500)}`);
  }
}

function sanitizeBody(body: any): any {
  if (!body) return body;
  
  const sanitized = { ...body };
  
  const sensitiveKeys = ['password', 'token', 'secret', 'apiKey', 'api_key', 'authorization'];
  for (const key of Object.keys(sanitized)) {
    if (sensitiveKeys.some(sk => key.toLowerCase().includes(sk))) {
      sanitized[key] = '[REDACTED]';
    }
    if (key === 'file' || key === 'buffer') {
      sanitized[key] = `[FILE: ${typeof sanitized[key]}]`;
    }
  }
  
  return sanitized;
}

export function getRecentErrors(limit: number = 100): ErrorLogEntry[] {
  return errorLogs.slice(0, limit);
}

export function getErrorsByEndpoint(endpoint: string): ErrorLogEntry[] {
  return errorLogs.filter(e => e.endpoint.includes(endpoint));
}

export function clearErrorLogs(): void {
  errorLogs.length = 0;
}

export function getErrorStats(): {
  total: number;
  byEndpoint: Record<string, number>;
  byType: Record<string, number>;
  last24h: number;
} {
  const now = Date.now();
  const dayAgo = now - 24 * 60 * 60 * 1000;
  
  const byEndpoint: Record<string, number> = {};
  const byType: Record<string, number> = {};
  let last24h = 0;
  
  for (const entry of errorLogs) {
    byEndpoint[entry.endpoint] = (byEndpoint[entry.endpoint] || 0) + 1;
    byType[entry.errorType] = (byType[entry.errorType] || 0) + 1;
    
    if (new Date(entry.timestamp).getTime() > dayAgo) {
      last24h++;
    }
  }
  
  return {
    total: errorLogs.length,
    byEndpoint,
    byType,
    last24h,
  };
}
