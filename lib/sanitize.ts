import DOMPurify from 'dompurify';

// DOMPurify configuration (strict by default)
const purifyConfig = {
  ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'br'],
  ALLOWED_ATTR: ['href', 'title', 'target'],
  KEEP_CONTENT: true,
};

/**
 * Sanitize HTML content to prevent XSS attacks
 * Only allows safe HTML tags
 */
export const sanitizeHtml = (html: string): string => {
  if (!html) return '';
  return DOMPurify.sanitize(html, purifyConfig);
};

/**
 * Sanitize plain text - remove angle brackets
 */
export const sanitizeText = (text: string): string => {
  if (!text) return '';
  return String(text)
    .trim()
    .replace(/[<>]/g, ''); // Remove angle brackets
};

/**
 * Sanitize email address
 */
export const sanitizeEmail = (email: string): string => {
  if (!email) return '';
  return String(email).trim().toLowerCase();
};

/**
 * Sanitize INN (keep only digits)
 */
export const sanitizeInn = (inn: string): string => {
  if (!inn) return '';
  return String(inn).replace(/\D/g, ''); // Keep only digits
};

/**
 * Sanitize phone number (keep only digits and +)
 */
export const sanitizePhone = (phone: string): string => {
  if (!phone) return '';
  return String(phone).replace(/[^\d+\-\s()]/g, '');
};

/**
 * Sanitize company name
 */
export const sanitizeCompanyName = (name: string): string => {
  if (!name) return '';
  return sanitizeText(name).substring(0, 255);
};

/**
 * Remove all HTML tags from string
 */
export const stripHtmlTags = (html: string): string => {
  if (!html) return '';
  return String(html)
    .replace(/<[^>]*>/g, '')
    .trim();
};

/**
 * Sanitize URL to prevent javascript: and data: protocols
 */
export const sanitizeUrl = (url: string): string => {
  if (!url) return '';
  
  try {
    const parsed = new URL(url);
    // Only allow http and https
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return '';
    }
    return parsed.toString();
  } catch {
    return '';
  }
};

/**
 * Sanitize JSON string before parsing
 */
export const sanitizeJsonString = (jsonStr: string): string => {
  if (!jsonStr) return '{}';
  
  try {
    // Parse to validate it's valid JSON, then stringify
    const parsed = JSON.parse(jsonStr);
    return JSON.stringify(parsed);
  } catch {
    return '{}';
  }
};

/**
 * Quick utility to check if string is safe (no HTML)
 */
export const isSafeString = (str: string): boolean => {
  return !/[<>]/.test(str);
};
