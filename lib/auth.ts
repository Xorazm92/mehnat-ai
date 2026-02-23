import { supabase } from './supabaseClient';

/**
 * Get current authentication state
 */
export const getAuthState = async () => {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session) {
      return {
        session: null,
        user: null,
        isAuthenticated: false,
      };
    }
    return {
      session: data.session,
      user: data.session.user,
      isAuthenticated: true,
    };
  } catch (err) {
    console.error('Failed to get auth state:', err);
    return {
      session: null,
      user: null,
      isAuthenticated: false,
    };
  }
};

/**
 * Perform logout with token revocation
 * Clears all storage and revokes refresh token
 */
export const performLogout = async () => {
  try {
    // Step 1: Revoke ALL sessions (global logout)
    const { error } = await supabase.auth.signOut({ scope: 'global' });
    if (error) {
      console.error('Logout error:', error);
      // Continue with local cleanup even if revocation fails
    }

    // Step 2: Clear all storage
    clearAllAuthStorage();

    // Step 3: Invalidate CSRF tokens
    clearCSRFTokens();

    // Step 4: Redirect to login
    window.location.href = '/login';
  } catch (err) {
    console.error('Logout exception:', err);
    // Force logout even if something fails
    clearAllAuthStorage();
    window.location.href = '/login';
  }
};

/**
 * Complete storage cleanup
 * Clears localStorage, sessionStorage, IndexedDB, and cookies
 */
export const clearAllAuthStorage = () => {
  // Clear localStorage
  try {
    localStorage.clear();
  } catch (err) {
    console.warn('Failed to clear localStorage:', err);
  }

  // Clear sessionStorage
  try {
    sessionStorage.clear();
  } catch (err) {
    console.warn('Failed to clear sessionStorage:', err);
  }

  // Clear IndexedDB (Supabase uses this)
  try {
    const dbNames = ['sb_' + import.meta.env.VITE_SUPABASE_URL?.split('/')[2]];
    for (const dbName of dbNames) {
      try {
        indexedDB.deleteDatabase(dbName);
        console.log(`Cleared IndexedDB: ${dbName}`);
      } catch (err) {
        console.warn(`Failed to clear IndexedDB ${dbName}:`, err);
      }
    }
  } catch (err) {
    console.warn('Failed to clear IndexedDB:', err);
  }

  // Clear authentication-related cookies
  try {
    document.cookie.split(';').forEach((c) => {
      const name = c.split('=')[0].trim();
      if (
        name.startsWith('sb-') ||
        name.includes('auth') ||
        name.includes('token')
      ) {
        document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
      }
    });
  } catch (err) {
    console.warn('Failed to clear cookies:', err);
  }
};

/**
 * CSRF Token Management
 */
const CSRF_TOKEN_KEY = 'csrf-token';
const CSRF_COOKIE_NAME = '__Secure-CSRF-Token';

/**
 * Get CSRF token from storage
 */
export const getCSRFToken = (): string | null => {
  try {
    return sessionStorage.getItem(CSRF_TOKEN_KEY);
  } catch {
    return null;
  }
};

/**
 * Set CSRF token in storage
 */
export const setCSRFToken = (token: string) => {
  try {
    sessionStorage.setItem(CSRF_TOKEN_KEY, token);
  } catch (err) {
    console.warn('Failed to set CSRF token:', err);
  }
};

/**
 * Validate CSRF token
 */
export const validateCSRFToken = (token: string): boolean => {
  const storedToken = getCSRFToken();
  return storedToken === token && !!token;
};

/**
 * Clear CSRF tokens
 */
export const clearCSRFTokens = () => {
  try {
    sessionStorage.removeItem(CSRF_TOKEN_KEY);
  } catch {
    // Ignore
  }

  try {
    document.cookie = `${CSRF_COOKIE_NAME}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
  } catch {
    // Ignore
  }
};

/**
 * Add CSRF token to request headers
 */
export const addCSRFTokenToHeaders = (
  headers: Record<string, string>
): Record<string, string> => {
  const token = getCSRFToken();
  if (token) {
    headers['X-CSRF-Token'] = token;
  }
  return headers;
};

/**
 * Start token rotation interval
 * Refreshes session token every 5 minutes
 * Does NOT abort other requests
 */
export const startTokenRotation = () => {
  const ROTATION_INTERVAL = 5 * 60 * 1000; // 5 minutes

  const rotateToken = async () => {
    try {
      // Add timeout to prevent hanging
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Token rotation timeout')), 10000)
      );

      const rotationPromise = supabase.auth.refreshSession();

      await Promise.race([rotationPromise, timeoutPromise]);
      console.log('[Auth] Token rotated successfully');
    } catch (err: any) {
      // Don't abort other requests on token rotation failure
      const errMsg = err?.message || String(err);
      if (!errMsg.includes('AbortError')) {
        console.warn('[Auth] Token rotation failed (non-critical):', err);
      }
      // Don't redirect to login on token rotation error
      // Only redirect if user explicitly logs out
    }
  };

  // Set interval for future rotations (start after 5 minutes, not immediately)
  const interval = setInterval(rotateToken, ROTATION_INTERVAL);

  // Return function to clear interval
  return () => clearInterval(interval);
};

/**
 * Check if user is authenticated
 */
export const isAuthenticated = async (): Promise<boolean> => {
  const state = await getAuthState();
  return state.isAuthenticated;
};

/**
 * Require authentication
 * Redirects to login if not authenticated
 */
export const requireAuth = async (): Promise<boolean> => {
  const authenticated = await isAuthenticated();
  if (!authenticated) {
    window.location.href = '/login';
    return false;
  }
  return true;
};
