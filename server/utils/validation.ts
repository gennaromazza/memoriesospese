import { Response } from 'express';

// Standard error response format
export interface ErrorResponse {
  error: string;
  message?: string;
  details?: any;
}

// Standard success response format
export interface SuccessResponse<T = any> {
  success: true;
  data: T;
  message?: string;
}

// Helper function to send standardized error responses
export const sendError = (res: Response, statusCode: number, error: string, message?: string, details?: any) => {
  const response: ErrorResponse = { error };
  if (message) response.message = message;
  if (details) response.details = details;
  return res.status(statusCode).json(response);
};

// Helper function to send standardized success responses
export const sendSuccess = <T>(res: Response, data: T, message?: string, statusCode: number = 200) => {
  const response: SuccessResponse<T> = { success: true, data };
  if (message) response.message = message;
  return res.status(statusCode).json(response);
};

// Validation utilities
export const ValidationUtils = {
  // Email validation
  isValidEmail: (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  },

  // Required field validation
  isRequired: (value: any, fieldName: string): string | null => {
    if (!value || (typeof value === 'string' && !value.trim())) {
      return `${fieldName} è richiesto`;
    }
    return null;
  },

  // String length validation
  maxLength: (value: string, maxLen: number, fieldName: string): string | null => {
    if (value && value.length > maxLen) {
      return `${fieldName} non può superare i ${maxLen} caratteri`;
    }
    return null;
  },

  // File size validation (in bytes)
  maxFileSize: (size: number, maxSize: number): string | null => {
    if (size > maxSize) {
      const maxMB = Math.round(maxSize / (1024 * 1024));
      return `File troppo grande (max ${maxMB}MB)`;
    }
    return null;
  },

  // Item type validation for likes/comments
  isValidItemType: (itemType: string): boolean => {
    return ['photo', 'voice_memo'].includes(itemType);
  },

  // Validate multiple fields at once
  validateFields: (validations: (() => string | null)[]): string[] => {
    const errors: string[] = [];
    validations.forEach(validation => {
      const error = validation();
      if (error) errors.push(error);
    });
    return errors;
  }
};

// Common validation middleware
export const validateUserData = (userEmail: string, userName: string): string[] => {
  return ValidationUtils.validateFields([
    () => ValidationUtils.isRequired(userEmail, 'Email utente'),
    () => ValidationUtils.isRequired(userName, 'Nome utente'),
    () => ValidationUtils.isValidEmail(userEmail) ? null : 'Formato email non valido',
    () => ValidationUtils.maxLength(userName, 100, 'Nome utente')
  ]);
};

export const validateCommentData = (content: string): string[] => {
  return ValidationUtils.validateFields([
    () => ValidationUtils.isRequired(content, 'Contenuto del commento'),
    () => ValidationUtils.maxLength(content, 500, 'Commento')
  ]);
};

export const validateVoiceMemoData = (data: any): string[] => {
  return ValidationUtils.validateFields([
    () => ValidationUtils.isRequired(data.guestName, 'Nome ospite'),
    () => ValidationUtils.isRequired(data.audioUrl, 'URL audio'),
    () => ValidationUtils.isRequired(data.fileName, 'Nome file'),
    () => data.fileSize && data.fileSize > 0 ? null : 'Dimensione file non valida',
    () => ValidationUtils.maxLength(data.guestName, 100, 'Nome ospite'),
    () => data.message ? ValidationUtils.maxLength(data.message, 500, 'Messaggio') : null,
    () => ValidationUtils.maxFileSize(data.fileSize, 50 * 1024 * 1024) // 50MB
  ]);
};