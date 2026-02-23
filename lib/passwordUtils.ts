import bcrypt from 'bcrypt';

const SALT_ROUNDS = 12; // High security

/**
 * Hash a plain text password using bcrypt
 * @param plainPassword - Plain text password to hash
 * @returns Hashed password
 */
export const hashPassword = async (plainPassword: string): Promise<string> => {
  if (!plainPassword || plainPassword.length < 8) {
    throw new Error('Password must be at least 8 characters');
  }

  try {
    const hash = await bcrypt.hash(plainPassword, SALT_ROUNDS);
    return hash;
  } catch (err) {
    console.error('Password hashing failed:', err);
    throw new Error('Failed to hash password');
  }
};

/**
 * Verify a plain text password against a hash
 * @param plainPassword - Plain text password
 * @param hash - Hashed password from database
 * @returns True if password matches
 */
export const verifyPassword = async (
  plainPassword: string,
  hash: string
): Promise<boolean> => {
  try {
    const match = await bcrypt.compare(plainPassword, hash);
    return match;
  } catch (err) {
    console.error('Password verification failed:', err);
    return false;
  }
};

/**
 * Validate password strength requirements
 * Requirements:
 * - At least 8 characters
 * - At least 1 uppercase letter
 * - At least 1 lowercase letter
 * - At least 1 number
 * - At least 1 special character
 */
export const isValidPassword = (password: string): boolean => {
  if (!password) return false;

  const hasMinLength = password.length >= 8;
  const hasUppercase = /[A-Z]/.test(password);
  const hasLowercase = /[a-z]/.test(password);
  const hasNumber = /\d/.test(password);
  const hasSpecial = /[@$!%*?&]/.test(password);

  return hasMinLength && hasUppercase && hasLowercase && hasNumber && hasSpecial;
};

/**
 * Get password strength feedback
 */
export const getPasswordStrengthFeedback = (password: string): string[] => {
  const feedback: string[] = [];

  if (password.length < 8) {
    feedback.push('At least 8 characters');
  }
  if (!/[A-Z]/.test(password)) {
    feedback.push('One uppercase letter');
  }
  if (!/[a-z]/.test(password)) {
    feedback.push('One lowercase letter');
  }
  if (!/\d/.test(password)) {
    feedback.push('One number');
  }
  if (!/[@$!%*?&]/.test(password)) {
    feedback.push('One special character (@$!%*?&)');
  }

  return feedback;
};
