/**
 * Application Configuration Constants
 * Centralized configuration for the entire application
 */

export const CONFIG = {
  // ============= NETWORK SETTINGS =============
  NETWORK: {
    RETRY: {
      MAX_ATTEMPTS: 3,
      INITIAL_DELAY_MS: 1000,
      MAX_DELAY_MS: 10000,
      BACKOFF_MULTIPLIER: 2,
    },
    TIMEOUT_MS: 30000,
    REQUEST_TIMEOUT_MS: 15000,
  },

  // ============= PAGINATION =============
  PAGINATION: {
    DEFAULT_PAGE_SIZE: 20,
    MAX_PAGE_SIZE: 100,
    MIN_PAGE_SIZE: 1,
  },

  // ============= BATCH OPERATIONS =============
  BATCH: {
    SIZE: 100,
    TIMEOUT_MS: 30000,
    MAX_RETRIES: 3,
  },

  // ============= AUTHENTICATION =============
  AUTH: {
    TOKEN_REFRESH_INTERVAL_MS: 5 * 60 * 1000, // 5 minutes
    SESSION_TIMEOUT_MS: 24 * 60 * 60 * 1000, // 24 hours
    LOGOUT_TIMEOUT_MS: 10000,
    PASSWORD_MIN_LENGTH: 8,
  },

  // ============= PASSWORD SECURITY =============
  PASSWORD: {
    MIN_LENGTH: 8,
    MAX_LENGTH: 255,
    SALT_ROUNDS: 12,
    REQUIRE_UPPERCASE: true,
    REQUIRE_LOWERCASE: true,
    REQUIRE_NUMBERS: true,
    REQUIRE_SPECIAL_CHARS: true,
    SPECIAL_CHARS: '@$!%*?&',
  },

  // ============= VALIDATION =============
  VALIDATION: {
    COMPANY_NAME_MAX_LENGTH: 255,
    INN_FORMAT: /^\d{14}$/,
    EMAIL_MAX_LENGTH: 255,
    PHONE_MAX_LENGTH: 20,
    NOTES_MAX_LENGTH: 1000,
  },

  // ============= CACHING =============
  CACHE: {
    STALE_TIME_MS: 5 * 60 * 1000, // 5 minutes
    CACHE_TIME_MS: 10 * 60 * 1000, // 10 minutes
    REFETCH_ON_FOCUS: false,
    REFETCH_ON_MOUNT: true,
  },

  // ============= RATE LIMITING =============
  RATE_LIMIT: {
    LOGIN_ATTEMPTS: 5,
    LOGIN_WINDOW_MS: 15 * 60 * 1000, // 15 minutes
    API_CALLS_PER_MINUTE: 100,
    BATCH_OPERATIONS_PER_MINUTE: 10,
  },

  // ============= UI SETTINGS =============
  UI: {
    TOAST_DURATION_MS: 3000,
    MODAL_ANIMATION_MS: 200,
    DEBOUNCE_MS: 300,
    SEARCH_DEBOUNCE_MS: 500,
  },

  // ============= DATA RETENTION =============
  DATA: {
    AUDIT_LOG_RETENTION_DAYS: 365,
    SOFT_DELETE_RETENTION_DAYS: 30,
    SESSION_LOG_RETENTION_DAYS: 90,
  },

  // ============= SECURITY =============
  SECURITY: {
    ENABLE_HTTPS: true,
    ENABLE_CSP: true,
    ENABLE_HSTS: true,
    ENABLE_X_FRAME_OPTIONS: true,
    ENABLE_X_CONTENT_TYPE_OPTIONS: true,
    ENABLE_X_XSS_PROTECTION: true,
    SECURE_COOKIES: true,
    HTTPONLY_COOKIES: true,
    SAMESITE_COOKIES: 'Strict',
  },

  // ============= LOGGING =============
  LOGGING: {
    LEVEL: process.env.NODE_ENV === 'production' ? 'warn' : 'debug',
    MAX_LOG_SIZE_MB: 10,
    RETENTION_DAYS: 30,
    INCLUDE_STACK_TRACE: true,
  },

  // ============= FEATURE FLAGS =============
  FEATURES: {
    ENABLE_ERROR_TRACKING: true,
    ENABLE_PERFORMANCE_MONITORING: true,
    ENABLE_REAL_TIME_SYNC: true,
    ENABLE_OFFLINE_MODE: false,
    ENABLE_ADVANCED_ANALYTICS: false,
  },
};

// ============= EXPORT SPECIFIC CONFIGS =============

export const { NETWORK, PAGINATION, BATCH, AUTH, PASSWORD, VALIDATION, CACHE, RATE_LIMIT, UI, DATA, SECURITY, LOGGING, FEATURES } = CONFIG;

// ============= UTILITY FUNCTIONS =============

/**
 * Get exponential backoff delay
 */
export const getBackoffDelay = (attempt: number): number => {
  const delay = NETWORK.RETRY.INITIAL_DELAY_MS * Math.pow(NETWORK.RETRY.BACKOFF_MULTIPLIER, attempt);
  return Math.min(delay, NETWORK.RETRY.MAX_DELAY_MS);
};

/**
 * Check if feature is enabled
 */
export const isFeatureEnabled = (feature: keyof typeof FEATURES): boolean => {
  return FEATURES[feature];
};
