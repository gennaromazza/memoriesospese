/**
 * Structured Logging Utilities
 * Provides consistent logging across the questionnaire system
 */

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  CRITICAL = 4
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  context: string;
  operation: string;
  message: string;
  data?: any;
  error?: any;
  userId?: string;
  galleryId?: string;
  questionnaireId?: string;
  tokenId?: string;
}

export interface LoggerConfig {
  minLevel: LogLevel;
  enableConsole: boolean;
  enablePersistence: boolean;
  maxEntries: number;
}

/**
 * Logger strutturato per operazioni questionari
 */
export class QuestionnaireLogger {
  private config: LoggerConfig;
  private entries: LogEntry[] = [];
  private context: string;

  constructor(context: string, config: Partial<LoggerConfig> = {}) {
    this.context = context;
    this.config = {
      minLevel: LogLevel.INFO,
      enableConsole: true,
      enablePersistence: false,
      maxEntries: 1000,
      ...config
    };
  }

  /**
   * Log operazione con livello DEBUG
   */
  debug(operation: string, message: string, data?: any): void {
    this.log(LogLevel.DEBUG, operation, message, data);
  }

  /**
   * Log operazione con livello INFO
   */
  info(operation: string, message: string, data?: any): void {
    this.log(LogLevel.INFO, operation, message, data);
  }

  /**
   * Log operazione con livello WARN
   */
  warn(operation: string, message: string, data?: any): void {
    this.log(LogLevel.WARN, operation, message, data);
  }

  /**
   * Log operazione con livello ERROR
   */
  error(operation: string, message: string, error?: any, data?: any): void {
    this.log(LogLevel.ERROR, operation, message, data, error);
  }

  /**
   * Log operazione con livello CRITICAL
   */
  critical(operation: string, message: string, error?: any, data?: any): void {
    this.log(LogLevel.CRITICAL, operation, message, data, error);
  }

  /**
   * Log con context specifico del questionario
   */
  logTokenOperation(
    level: LogLevel,
    operation: string,
    message: string,
    galleryId?: string,
    questionnaireId?: string,
    tokenId?: string,
    data?: any,
    error?: any
  ): void {
    const entry = this.createLogEntry(level, operation, message, data, error);
    entry.galleryId = galleryId;
    entry.questionnaireId = questionnaireId;
    entry.tokenId = tokenId;
    
    this.addEntry(entry);
  }

  /**
   * Log generico con dati
   */
  private log(
    level: LogLevel, 
    operation: string, 
    message: string, 
    data?: any, 
    error?: any
  ): void {
    if (level < this.config.minLevel) {
      return; // Skip se sotto il livello minimo
    }

    const entry = this.createLogEntry(level, operation, message, data, error);
    this.addEntry(entry);
  }

  /**
   * Crea entry di log strutturata
   */
  private createLogEntry(
    level: LogLevel,
    operation: string,
    message: string,
    data?: any,
    error?: any
  ): LogEntry {
    return {
      timestamp: new Date().toISOString(),
      level,
      context: this.context,
      operation,
      message,
      data,
      error: error ? this.serializeError(error) : undefined
    };
  }

  /**
   * Aggiunge entry ai log
   */
  private addEntry(entry: LogEntry): void {
    // Aggiungi ai log interni
    this.entries.push(entry);
    
    // Mantieni solo le entry più recenti
    if (this.entries.length > this.config.maxEntries) {
      this.entries = this.entries.slice(-this.config.maxEntries);
    }

    // Log su console se abilitato
    if (this.config.enableConsole) {
      this.logToConsole(entry);
    }

    // Persisti se abilitato (implementazione futura)
    if (this.config.enablePersistence) {
      this.persistEntry(entry);
    }
  }

  /**
   * Log su console con formattazione
   */
  private logToConsole(entry: LogEntry): void {
    const levelEmoji = this.getLevelEmoji(entry.level);
    const contextInfo = `[${entry.context}:${entry.operation}]`;
    
    const baseMessage = `${levelEmoji} ${contextInfo} ${entry.message}`;
    
    switch (entry.level) {
      case LogLevel.DEBUG:
        console.debug(baseMessage, entry.data || '');
        break;
      case LogLevel.INFO:
        console.info(baseMessage, entry.data || '');
        break;
      case LogLevel.WARN:
        console.warn(baseMessage, entry.data || '');
        break;
      case LogLevel.ERROR:
      case LogLevel.CRITICAL:
        console.error(baseMessage, entry.error || entry.data || '');
        break;
    }
  }

  /**
   * Persisti entry (implementazione futura)
   */
  private async persistEntry(entry: LogEntry): Promise<void> {
    // TODO: Implementare persistenza su Firestore se necessario
    // Per ora manteniamo solo in memoria
  }

  /**
   * Serializza errore per logging
   */
  private serializeError(error: any): any {
    if (error instanceof Error) {
      return {
        name: error.name,
        message: error.message,
        stack: error.stack,
        code: (error as any).code // Per errori Firebase
      };
    }
    return error;
  }

  /**
   * Ottieni emoji per livello di log
   */
  private getLevelEmoji(level: LogLevel): string {
    switch (level) {
      case LogLevel.DEBUG: return '🔍';
      case LogLevel.INFO: return 'ℹ️';
      case LogLevel.WARN: return '⚠️';
      case LogLevel.ERROR: return '🔴';
      case LogLevel.CRITICAL: return '💥';
      default: return '📝';
    }
  }

  /**
   * Ottieni tutti i log entries
   */
  getEntries(): LogEntry[] {
    return [...this.entries];
  }

  /**
   * Filtra entries per livello
   */
  getEntriesByLevel(level: LogLevel): LogEntry[] {
    return this.entries.filter(entry => entry.level === level);
  }

  /**
   * Ottieni entries recenti
   */
  getRecentEntries(count: number = 10): LogEntry[] {
    return this.entries.slice(-count);
  }

  /**
   * Pulisci tutti i log
   */
  clear(): void {
    this.entries = [];
  }
}

// Instance globale per operazioni questionari
export const questionnaireLogger = new QuestionnaireLogger('QUESTIONNAIRE', {
  minLevel: LogLevel.INFO,
  enableConsole: true
});

// Instance per token operations
export const tokenLogger = new QuestionnaireLogger('TOKEN', {
  minLevel: LogLevel.DEBUG,
  enableConsole: true
});

/**
 * Utility per misurare performance operazioni
 */
export function measurePerformance<T>(
  logger: QuestionnaireLogger,
  operation: string,
  fn: () => Promise<T>
): Promise<T> {
  return new Promise(async (resolve, reject) => {
    const startTime = performance.now();
    
    try {
      logger.info(operation, 'Operation started');
      const result = await fn();
      const duration = performance.now() - startTime;
      
      logger.info(operation, `Operation completed in ${duration.toFixed(2)}ms`, {
        duration,
        success: true
      });
      
      resolve(result);
    } catch (error) {
      const duration = performance.now() - startTime;
      
      logger.error(operation, `Operation failed after ${duration.toFixed(2)}ms`, error, {
        duration,
        success: false
      });
      
      reject(error);
    }
  });
}