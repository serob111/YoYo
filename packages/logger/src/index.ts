import pino, { type Logger } from "pino";

export type LogContext = Partial<{
  requestId: string;
  traceId: string;
  organizationId: string;
  userId: string;
  jobId: string;
  conversationId: string;
  connectedAccountId: string;
  provider: string;
  providerEventId: string;
}>;

const REDACT_PATHS = [
  "password",
  "passwordHash",
  "token",
  "accessToken",
  "refreshToken",
  "tokenHash",
  "authorization",
  "req.headers.authorization",
  "req.headers.cookie",
  "*.password",
  "*.passwordHash",
  "*.token",
  "*.tokenHash"
];

export function createLogger(serviceName: string, level = process.env.LOG_LEVEL ?? "info"): Logger {
  return pino({
    name: serviceName,
    level,
    redact: { paths: REDACT_PATHS, censor: "[REDACTED]" },
    formatters: {
      level(label) {
        return { level: label };
      }
    },
    timestamp: pino.stdTimeFunctions.isoTime
  });
}

export function childWithContext(logger: Logger, context: LogContext): Logger {
  return logger.child(context);
}

export type { Logger };
