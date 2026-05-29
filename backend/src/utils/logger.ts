import pino from 'pino';

const isDev = process.env.NODE_ENV !== 'production';
const level = process.env.LOG_LEVEL || (isDev ? 'debug' : 'info');

export const logger = pino({
  level,
  transport: isDev
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss Z',
          ignore: 'pid,hostname',
        },
      }
    : undefined,
  base: {
    service: 'flame-core-api',
    region: process.env.REGION_CODE || 'los1',
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

/** Create a child logger with request trace context */
export function createRequestLogger(traceId: string, extra?: Record<string, unknown>) {
  return logger.child({ trace_id: traceId, ...extra });
}

/** Create a child logger for a specific deployment or team */
export function createContextLogger(context: { deployment_id?: string; team_id?: string; project_id?: string; job_id?: string }) {
  return logger.child(context);
}
