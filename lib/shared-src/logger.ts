/**
 * Sistema di logging strutturato con levels appropriati
 * Sostituisce console.log/error/warn con logging professionale
 */

export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: string;
  userId?: string;
  galleryId?: string;
  error?: Error;
  metadata?: Record<string, any>;
}

class Logger {
  private level: LogLevel;
  private isClient: boolean;

  constructor() {
    this.isClient = typeof window !== 'undefined';
    this.level = this.getLogLevel();
  }

  private getLogLevel(): LogLevel {
    if (this.isClient) {
      return import.meta.env.PROD ? LogLevel.WARN : LogLevel.DEBUG;
    } else {
      return process.env.NODE_ENV === 'production' ? LogLevel.WARN : LogLevel.DEBUG;
    }
  }

  private formatMessage(entry: LogEntry): string {
    const levelNames = ['ERROR', 'WARN', 'INFO', 'DEBUG'];
    const parts = [
      `[${entry.timestamp}]`,
      `[${levelNames[entry.level]}]`,
      entry.context ? `[${entry.context}]` : '',
      entry.galleryId ? `[Gallery:${entry.galleryId}]` : '',
      entry.userId ? `[User:${entry.userId}]` : '',
      entry.message
    ].filter(Boolean);

    return parts.join(' ');
  }

  private log(level: LogLevel, message: string, context?: {
    error?: Error;
    userId?: string;
    galleryId?: string;
    metadata?: Record<string, any>;
    contextName?: string;
  }): void {
    if (level > this.level) return;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context: context?.contextName,
      userId: context?.userId,
      galleryId: context?.galleryId,
      error: context?.error,
      metadata: context?.metadata
    };

    const formattedMessage = this.formatMessage(entry);

    // Output appropriate per environment
    if (this.isClient) {
      this.clientLog(level, formattedMessage, entry);
    } else {
      this.serverLog(level, formattedMessage, entry);
    }
  }

  private clientLog(level: LogLevel, message: string, entry: LogEntry): void {
    switch (level) {
      case LogLevel.ERROR:
        console.error(message, entry.error || '');
        break;
      case LogLevel.WARN:
        console.warn(message);
        break;
      case LogLevel.INFO:
        console.info(message);
        break;
      case LogLevel.DEBUG:
        console.log(message);
        break;
    }
  }

  private serverLog(level: LogLevel, message: string, entry: LogEntry): void {
    // In production, integrate with external logging service
    // For now, use structured console output
    const logData = {
      ...entry,
      formattedMessage: message
    };

    switch (level) {
      case LogLevel.ERROR:
        console.error(JSON.stringify(logData));
        break;
      case LogLevel.WARN:
        console.warn(JSON.stringify(logData));
        break;
      case LogLevel.INFO:
        console.info(JSON.stringify(logData));
        break;
      case LogLevel.DEBUG:
        console.log(JSON.stringify(logData));
        break;
    }
  }

  error(message: string, context?: {
    error?: Error;
    userId?: string;
    galleryId?: string;
    metadata?: Record<string, any>;
    contextName?: string;
  }): void {
    this.log(LogLevel.ERROR, message, context);
  }

  warn(message: string, context?: {
    userId?: string;
    galleryId?: string;
    metadata?: Record<string, any>;
    contextName?: string;
  }): void {
    this.log(LogLevel.WARN, message, context);
  }

  info(message: string, context?: {
    userId?: string;
    galleryId?: string;
    metadata?: Record<string, any>;
    contextName?: string;
  }): void {
    this.log(LogLevel.INFO, message, context);
  }

  debug(message: string, context?: {
    userId?: string;
    galleryId?: string;
    metadata?: Record<string, any>;
    contextName?: string;
  }): void {
    this.log(LogLevel.DEBUG, message, context);
  }
}

export const logger = new Logger();

// Utility per creare logger con context predefinito
export function createContextLogger(defaultContext: {
  contextName?: string;
  userId?: string;
  galleryId?: string;
}) {
  return {
    error: (message: string, additionalContext?: {
      error?: Error;
      metadata?: Record<string, any>;
    }) => logger.error(message, { ...defaultContext, ...additionalContext }),

    warn: (message: string, additionalContext?: {
      metadata?: Record<string, any>;
    }) => logger.warn(message, { ...defaultContext, ...additionalContext }),

    info: (message: string, additionalContext?: {
      metadata?: Record<string, any>;
    }) => logger.info(message, { ...defaultContext, ...additionalContext }),

    debug: (message: string, additionalContext?: {
      metadata?: Record<string, any>;
    }) => logger.debug(message, { ...defaultContext, ...additionalContext })
  };
}