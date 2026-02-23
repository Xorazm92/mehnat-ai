# 🔧 ASOS ACCOUNTING MANAGER - REFACTOR GUIDE

## Qo'llanma (Implementation Manual)

---

## PHASE 1: CRITICAL SECURITY (1-2 weeks)

### ✅ TASK 1: Password Hashing (Day 1-2)

#### Step 1: Install bcrypt
```bash
npm install bcrypt
npm install -D @types/bcrypt
```

#### Step 2: Create database migration
**File:** `supabase/migration_hash_passwords.sql`

```sql
-- Migration to add password hashing columns
ALTER TABLE companies 
ADD COLUMN password_hash TEXT,
ADD COLUMN password_salt TEXT;

-- Create function to hash password
CREATE OR REPLACE FUNCTION hash_password(password TEXT)
RETURNS TEXT LANGUAGE plpgsql AS $$
BEGIN
  -- Note: bcrypt hashing happens on application layer
  -- This is just a placeholder comment
  RETURN password; -- Will be updated by app
END;
$$;

-- Create audit table for password changes
CREATE TABLE password_audit (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  changed_by UUID REFERENCES profiles(id),
  changed_at TIMESTAMPTZ DEFAULT NOW(),
  action TEXT NOT NULL, -- 'created', 'updated', 'reset'
  ip_address TEXT
);

-- Index for quick lookup
CREATE INDEX idx_password_audit_company ON password_audit(company_id, changed_at DESC);

-- Enable RLS on audit table
ALTER TABLE password_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view password audit"
  ON password_audit FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('super_admin', 'chief_accountant')
    )
  );
```

#### Step 3: Create hash utility
**File:** `lib/passwordUtils.ts`

```typescript
import bcrypt from 'bcrypt';

const SALT_ROUNDS = 12; // High security

export const hashPassword = async (plainPassword: string): Promise<string> => {
  try {
    const hash = await bcrypt.hash(plainPassword, SALT_ROUNDS);
    return hash;
  } catch (err) {
    throw new Error(`Failed to hash password: ${err}`);
  }
};

export const verifyPassword = async (
  plainPassword: string,
  hash: string
): Promise<boolean> => {
  try {
    const match = await bcrypt.compare(plainPassword, hash);
    return match;
  } catch (err) {
    throw new Error(`Failed to verify password: ${err}`);
  }
};

export const isValidPassword = (password: string): boolean => {
  // Requirements:
  // - At least 8 characters
  // - At least 1 uppercase letter
  // - At least 1 lowercase letter
  // - At least 1 number
  // - At least 1 special character
  const regex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
  return regex.test(password);
};
```

#### Step 4: Update supabaseData.ts

**Before:**
```typescript
export const upsertCompany = async (company: Company) => {
  const { data, error } = await supabase
    .from('companies')
    .upsert({
      ...company,
      password: company.password, // ❌ Plain text
    });
};
```

**After:**
```typescript
import { hashPassword, isValidPassword } from './passwordUtils';

export const upsertCompany = async (company: Company) => {
  // Validate password before hashing
  if (company.password && !isValidPassword(company.password)) {
    throw new Error(
      'Password must be at least 8 characters with uppercase, lowercase, number, and special character'
    );
  }

  let passwordHash: string | undefined;
  if (company.password) {
    passwordHash = await hashPassword(company.password);
  }

  const { data, error } = await supabase
    .from('companies')
    .upsert({
      id: company.id,
      name: company.name,
      inn: company.inn,
      // ... other fields
      password_hash: passwordHash,
      // password field removed!
    });

  if (error) throw error;

  // Log password change for audit
  if (passwordHash) {
    await supabase
      .from('password_audit')
      .insert({
        company_id: company.id,
        changed_by: (await supabase.auth.getUser()).data.user?.id,
        action: company.id ? 'updated' : 'created',
        ip_address: getClientIp(),
      });
  }

  return data;
};
```

#### Step 5: Migration script to hash existing passwords
**File:** `scripts/migrate_passwords.js`

```javascript
import bcrypt from 'bcrypt';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY // Use service role for admin access
);

const migratePasswords = async () => {
  console.log('Starting password migration...');

  try {
    // Fetch all companies with passwords
    const { data: companies, error } = await supabase
      .from('companies')
      .select('id, password')
      .not('password', 'is', null);

    if (error) throw error;

    console.log(`Found ${companies.length} companies with passwords to hash`);

    let successCount = 0;
    let errorCount = 0;

    for (const company of companies) {
      try {
        // Hash password
        const hash = await bcrypt.hash(company.password, 12);

        // Update with hashed password
        const { error: updateError } = await supabase
          .from('companies')
          .update({
            password_hash: hash,
            password: null, // Clear plaintext
          })
          .eq('id', company.id);

        if (updateError) throw updateError;

        successCount++;
        console.log(`✓ Migrated company ${company.id}`);
      } catch (err) {
        errorCount++;
        console.error(`✗ Failed to migrate company ${company.id}:`, err.message);
      }
    }

    console.log(`\nMigration complete: ${successCount} succeeded, ${errorCount} failed`);
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
};

migratePasswords();
```

#### Step 6: Run migration
```bash
# Run SQL migration first
supabase db push

# Then run hash migration
node scripts/migrate_passwords.js
```

#### Step 7: Update Company type
**File:** `types.ts`

```typescript
export interface Company {
  id: string;
  name: string;
  inn: string;
  // ... other fields
  
  // Remove:
  // password?: string;
  
  // Add (for internal use only - never send to frontend):
  password_hash?: string; // Backend only!
  password_salt?: string; // Backend only!
}

// For form display/edit - separate type
export interface CompanyFormData {
  name: string;
  inn: string;
  login: string;
  password?: string; // Only in form, validated before submit
  // ... other fields
}
```

---

### ✅ TASK 2: Fix RLS Policies (Day 2-3)

#### Problem Analysis

**Current RLS Issues:**
1. ❌ No JWT signature verification
2. ❌ Missing DELETE policies
3. ❌ Missing UPDATE policies for sensitive fields
4. ❌ No recursion limits on RLS queries

#### Solution: Comprehensive RLS Fix

**File:** `supabase/migration_fix_rls.sql`

```sql
-- ==============================================
-- 1. ADD JWT VERIFICATION TRIGGER
-- ==============================================

CREATE OR REPLACE FUNCTION verify_auth_user()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- Verify the user is authenticated
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'User must be authenticated';
  END IF;

  -- Verify JWT hasn't been tampered with
  -- (Supabase handles this automatically, but document it)
  RETURN NEW;
END;
$$;

-- ==============================================
-- 2. ADD MISSING DELETE POLICIES
-- ==============================================

-- Companies Table
CREATE POLICY "Only creator can delete company"
  ON companies FOR DELETE
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

-- Operations Table
CREATE POLICY "Only creator can delete operation"
  ON operations FOR DELETE
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

-- Staff Table  
CREATE POLICY "Only creator can delete staff"
  ON staff FOR DELETE
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

-- Payments Table
CREATE POLICY "Only creator can delete payment"
  ON payments FOR DELETE
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

-- ==============================================
-- 3. ADD UPDATE POLICIES FOR SENSITIVE FIELDS
-- ==============================================

-- Don't allow updating password_hash directly from frontend
CREATE POLICY "No direct password updates from frontend"
  ON companies FOR UPDATE
  USING (false)  -- Always deny
  WITH CHECK (false);

-- Instead, use a separate RPC function
CREATE OR REPLACE FUNCTION update_company_password(
  company_id UUID,
  new_password TEXT
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  password_hash TEXT;
BEGIN
  -- Verify user is creator or admin
  IF NOT (
    (SELECT created_by FROM companies WHERE id = company_id) = auth.uid()
    OR
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('super_admin', 'chief_accountant')
  ) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Hash password (on backend - this is just RPC call)
  -- In real implementation, call backend API instead
  RAISE EXCEPTION 'Use API endpoint to update passwords';
END;
$$;

-- ==============================================
-- 4. ADD AUDIT TRIGGER FOR ALL CHANGES
-- ==============================================

CREATE TABLE IF NOT EXISTS audit_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  table_name TEXT NOT NULL,
  record_id UUID NOT NULL,
  action TEXT NOT NULL, -- 'INSERT', 'UPDATE', 'DELETE'
  old_data JSONB,
  new_data JSONB,
  changed_by UUID REFERENCES profiles(id),
  changed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_log_table_record ON audit_log(table_name, record_id);
CREATE INDEX idx_audit_log_timestamp ON audit_log(changed_at DESC);

CREATE OR REPLACE FUNCTION audit_log_changes()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF (TG_OP = 'DELETE') THEN
    INSERT INTO audit_log (table_name, record_id, action, old_data, changed_by)
    VALUES (
      TG_TABLE_NAME,
      OLD.id,
      TG_OP,
      row_to_json(OLD),
      auth.uid()
    );
    RETURN OLD;
  ELSIF (TG_OP = 'UPDATE') THEN
    INSERT INTO audit_log (table_name, record_id, action, old_data, new_data, changed_by)
    VALUES (
      TG_TABLE_NAME,
      NEW.id,
      TG_OP,
      row_to_json(OLD),
      row_to_json(NEW),
      auth.uid()
    );
    RETURN NEW;
  ELSIF (TG_OP = 'INSERT') THEN
    INSERT INTO audit_log (table_name, record_id, action, new_data, changed_by)
    VALUES (
      TG_TABLE_NAME,
      NEW.id,
      TG_OP,
      row_to_json(NEW),
      auth.uid()
    );
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$;

-- Apply audit trigger to all sensitive tables
CREATE TRIGGER audit_companies_changes
AFTER INSERT OR UPDATE OR DELETE ON companies
FOR EACH ROW EXECUTE FUNCTION audit_log_changes();

CREATE TRIGGER audit_staff_changes
AFTER INSERT OR UPDATE OR DELETE ON staff
FOR EACH ROW EXECUTE FUNCTION audit_log_changes();

CREATE TRIGGER audit_operations_changes
AFTER INSERT OR UPDATE OR DELETE ON operations
FOR EACH ROW EXECUTE FUNCTION audit_log_changes();

-- ==============================================
-- 5. RLS POLICY FOR AUDIT LOG
-- ==============================================

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view audit of their own data"
  ON audit_log FOR SELECT
  USING (changed_by = auth.uid());

CREATE POLICY "Admins can view all audit logs"
  ON audit_log FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('super_admin', 'chief_accountant')
    )
  );

CREATE POLICY "No one can insert audit logs directly"
  ON audit_log FOR INSERT
  WITH CHECK (false);

CREATE POLICY "No one can update audit logs"
  ON audit_log FOR UPDATE
  USING (false)
  WITH CHECK (false);

-- ==============================================
-- 6. TEST POLICIES (Run after migration)
-- ==============================================

-- Test 1: User can only see own companies
-- SELECT * FROM companies WHERE accountant_id = auth.uid();

-- Test 2: User cannot delete other user's company
-- DELETE FROM companies WHERE id != created_by;

-- Test 3: Audit log is immutable
-- UPDATE audit_log SET action = 'FAKE' WHERE id = ...; -- Should fail

-- Test 4: Password field cannot be updated directly
-- UPDATE companies SET password_hash = 'hacked' WHERE id = ...; -- Should fail
```

#### RLS Verification Checklist

```typescript
// File: tests/rls.test.ts
import { createClient } from '@supabase/supabase-js';

describe('RLS Policies', () => {
  test('User cannot view other user companies', async () => {
    const user1 = createClient(url, anonKey);
    const user2 = createClient(url, anonKey);

    // User1 creates company
    const { data: company } = await user1
      .from('companies')
      .insert({ name: 'User1 Company', created_by: user1Id })
      .single();

    // User2 tries to view - should be empty
    const { data: companies } = await user2
      .from('companies')
      .select()
      .eq('id', company.id);

    expect(companies).toHaveLength(0); // ✓ User2 cannot see
  });

  test('User cannot delete other user companies', async () => {
    const { error } = await user2
      .from('companies')
      .delete()
      .eq('id', company.id);

    expect(error).toBeTruthy(); // ✓ Deletion blocked
  });

  test('Audit log is immutable', async () => {
    const { error } = await user1
      .from('audit_log')
      .update({ action: 'FAKE' })
      .eq('id', auditLogId);

    expect(error).toBeTruthy(); // ✓ Cannot update
  });
});
```

---

### ✅ TASK 3: Input Validation (Day 3-4)

#### Step 1: Install validation libraries
```bash
npm install zod dompurify axios
npm install -D @types/dompurify
```

#### Step 2: Create validation schemas
**File:** `lib/validation.ts`

```typescript
import { z } from 'zod';

// ===== COMPANY VALIDATION =====
export const CompanyFormSchema = z.object({
  name: z
    .string()
    .min(1, 'Company name is required')
    .max(255, 'Company name too long')
    .trim(),

  inn: z
    .string()
    .regex(/^\d{14}$/, 'Invalid INN format (must be 14 digits)')
    .trim(),

  login: z
    .string()
    .min(1, 'Login is required')
    .max(255, 'Login too long'),

  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain uppercase letter')
    .regex(/[a-z]/, 'Password must contain lowercase letter')
    .regex(/\d/, 'Password must contain number')
    .regex(/[@$!%*?&]/, 'Password must contain special character (@$!%*?&)')
    .optional(),

  taxType: z.enum(['nds_profit', 'turnover', 'fixed']),
  
  contractAmount: z
    .number()
    .min(0, 'Contract amount must be positive')
    .optional(),
});

export type CompanyFormInput = z.infer<typeof CompanyFormSchema>;

// ===== OPERATION VALIDATION =====
export const OperationSchema = z.object({
  companyId: z
    .string()
    .uuid('Invalid company ID'),

  period: z
    .string()
    .regex(/^\d{4}-\d{2}$/, 'Invalid period format (YYYY-MM)'),

  status: z.enum(['pending', 'in_progress', 'completed', 'rejected']),

  assignedAccountantId: z
    .string()
    .uuid('Invalid staff ID')
    .optional(),

  notes: z
    .string()
    .max(1000, 'Notes too long')
    .optional(),
});

// ===== BATCH IMPORT VALIDATION =====
export const BatchImportSchema = z.array(CompanyFormSchema).min(1);

// ===== HELPER FUNCTIONS =====
export const validateCompanyForm = (data: unknown) => {
  try {
    return CompanyFormSchema.parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { error: error.errors[0].message };
    }
    return { error: 'Validation failed' };
  }
};

export const validateBatch = (data: unknown) => {
  try {
    return BatchImportSchema.parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { error: error.errors[0].message };
    }
    return { error: 'Batch validation failed' };
  }
};
```

#### Step 3: Create sanitization utility
**File:** `lib/sanitize.ts`

```typescript
import DOMPurify from 'dompurify';

// Configure DOMPurify (strict by default)
const config = {
  ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a'], // Only safe HTML
  ALLOWED_ATTR: ['href', 'title'],
  KEEP_CONTENT: true,
};

export const sanitizeHtml = (html: string): string => {
  return DOMPurify.sanitize(html, config);
};

export const sanitizeText = (text: string): string => {
  // For plain text - just trim and encode
  return String(text)
    .trim()
    .replace(/[<>]/g, ''); // Remove angle brackets
};

export const sanitizeEmail = (email: string): string => {
  return String(email).trim().toLowerCase();
};

export const sanitizeInn = (inn: string): string => {
  return String(inn).replace(/\D/g, ''); // Keep only digits
};

// Safe render helper for React
export const SafeText: React.FC<{ children: string }> = ({ children }) => {
  return <span>{sanitizeText(children)}</span>;
};

export const SafeHtml: React.FC<{ html: string }> = ({ html }) => {
  return (
    <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(html) }} />
  );
};
```

#### Step 4: Update API calls to use validation
**File:** `lib/supabaseData.ts`

```typescript
import { validateCompanyForm, validateBatch } from './validation';
import { sanitizeText, sanitizeEmail, sanitizeInn } from './sanitize';

export const upsertCompany = async (company: Partial<Company>) => {
  try {
    // ✓ Validate input
    const validated = validateCompanyForm(company);
    if ('error' in validated) {
      throw new Error(validated.error);
    }

    // ✓ Sanitize sensitive fields
    const sanitized = {
      ...validated,
      name: sanitizeText(validated.name),
      inn: sanitizeInn(validated.inn),
      accountantName: sanitizeText(validated.accountantName || ''),
    };

    const { data, error } = await supabase
      .from('companies')
      .upsert(sanitized);

    if (error) throw error;
    return data;
  } catch (err) {
    console.error('upsertCompany validation failed:', err);
    throw err;
  }
};

export const upsertOperationsBatch = async (operations: OperationEntry[]) => {
  try {
    // ✓ Validate entire batch
    const validated = validateBatch(operations);
    if ('error' in validated) {
      throw new Error(validated.error);
    }

    // ✓ Process in atomic transaction
    const { data, error } = await supabase.rpc(
      'upsert_operations_atomic',
      { operations_input: validated }
    );

    if (error) throw error;
    return data;
  } catch (err) {
    console.error('Batch upsert failed:', err);
    throw err;
  }
};
```

#### Step 5: Update React components
**File:** `components/OrganizationModule.tsx` (example)

```typescript
const [formData, setFormData] = useState<Partial<Company>>({});
const [errors, setErrors] = useState<Record<string, string>>({});

const handleCompanySubmit = async (e: React.FormEvent) => {
  e.preventDefault();

  try {
    // ✓ Validate before submit
    const validation = validateCompanyForm(formData);
    if ('error' in validation) {
      setErrors({ form: validation.error });
      return;
    }

    // ✓ Clear errors
    setErrors({});

    // ✓ Submit to API
    await upsertCompany(validation);

    toast.success('Company saved successfully');
    setFormData({}); // Clear form
  } catch (err) {
    setErrors({
      form: String(err).substring(0, 100), // Limit error message length
    });
    toast.error('Failed to save company');
  }
};

// In JSX
<form onSubmit={handleCompanySubmit}>
  <input
    type="text"
    value={formData.name || ''}
    onChange={(e) =>
      setFormData({ ...formData, name: e.target.value })
    }
    placeholder="Company name"
    maxLength={255} // ✓ HTML5 validation
  />
  {errors.name && <span className="text-red-500">{errors.name}</span>}

  <input
    type="email"
    value={formData.accountantEmail || ''}
    onChange={(e) =>
      setFormData({
        ...formData,
        accountantEmail: sanitizeEmail(e.target.value),
      })
    }
    placeholder="Email"
  />

  <button type="submit">Save Company</button>
</form>
```

#### Step 6: Add Content Security Policy header
**File:** `vite.config.ts`

```typescript
export default defineConfig({
  server: {
    headers: {
      'Content-Security-Policy': [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline'", // Ideally remove unsafe-inline
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: https:",
        "font-src 'self'",
        "connect-src 'self' https://api.supabase.co",
        "frame-ancestors 'none'", // Prevent clickjacking
      ].join('; '),
    }
  },
});
```

---

### ✅ TASK 4: Fix Token Management (Day 4-5)

#### Current Problems
```typescript
// ❌ VULNERABLE: Stored in localStorage
auth: {
  persistSession: true,  // Uses localStorage
}

// ❌ VULNERABLE: Logout doesn't revoke
await supabase.auth.signOut(); // Only removes local storage

// ❌ VULNERABLE: No complete cleanup
clearAuthStorage(); // Doesn't clear IndexedDB, cookies
```

#### Solution: Proper Session Management

**File:** `lib/supabaseClient.ts`

```typescript
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// ✓ Use memory storage (backend will manage tokens via HttpOnly cookies)
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    storage: {
      // ✓ Use sessionStorage (cleared on browser close)
      // Or implement custom storage with backend sync
      getItem: (key) => sessionStorage.getItem(key),
      setItem: (key, value) => sessionStorage.setItem(key, value),
      removeItem: (key) => sessionStorage.removeItem(key),
    },
  },
});

// ✓ Implement token rotation
export const startTokenRotation = () => {
  const ROTATION_INTERVAL = 5 * 60 * 1000; // 5 minutes

  setInterval(async () => {
    try {
      const { data, error } = await supabase.auth.refreshSession();
      if (error) throw error;

      console.log('Token rotated successfully');
    } catch (err) {
      console.error('Token rotation failed:', err);
      // Refresh page to re-authenticate
      window.location.href = '/login';
    }
  }, ROTATION_INTERVAL);
};
```

**File:** `lib/auth.ts` (new file)

```typescript
import { supabase } from './supabaseClient';

interface AuthState {
  session: any | null;
  user: any | null;
  isAuthenticated: boolean;
}

export const getAuthState = async (): Promise<AuthState> => {
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
};

// ✓ Proper logout with token revocation
export const performLogout = async () => {
  try {
    // Step 1: Revoke ALL sessions (global logout)
    const { error } = await supabase.auth.signOut({ scope: 'global' });
    if (error) throw error;

    // Step 2: Clear all storage
    clearAllAuthStorage();

    // Step 3: Invalidate CSRF tokens
    clearCSRFTokens();

    // Step 4: Redirect to login
    window.location.href = '/login';
  } catch (err) {
    console.error('Logout failed:', err);
    // Force logout even if revocation fails
    clearAllAuthStorage();
    window.location.href = '/login';
  }
};

// ✓ Complete storage cleanup
export const clearAllAuthStorage = () => {
  // Clear localStorage
  localStorage.clear();

  // Clear sessionStorage
  sessionStorage.clear();

  // Clear IndexedDB (Supabase uses this)
  try {
    // List of Supabase IndexedDB databases
    const dbNames = [
      'sb_' + import.meta.env.VITE_SUPABASE_URL?.split('/')[2],
    ];

    for (const dbName of dbNames) {
      try {
        indexedDB.deleteDatabase(dbName);
        console.log(`Deleted IndexedDB: ${dbName}`);
      } catch (err) {
        console.warn(`Failed to delete IndexedDB ${dbName}:`, err);
      }
    }
  } catch (err) {
    console.warn('Failed to clear IndexedDB:', err);
  }

  // Clear cookies (if using cookie-based auth)
  document.cookie.split(';').forEach((c) => {
    const name = c.split('=')[0].trim();
    if (name.startsWith('sb-') || name.includes('auth')) {
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC;`;
    }
  });
};

// ✓ CSRF token management
const CSRF_TOKEN_KEY = 'csrf-token';
const CSRF_COOKIE_NAME = '__Secure-CSRF-Token';

export const getCSRFToken = (): string | null => {
  return sessionStorage.getItem(CSRF_TOKEN_KEY);
};

export const setCSRFToken = (token: string) => {
  sessionStorage.setItem(CSRF_TOKEN_KEY, token);

  // Also set as secure HttpOnly cookie (backend should set this)
  // document.cookie = `${CSRF_COOKIE_NAME}=${token}; Secure; HttpOnly; SameSite=Strict`;
};

export const validateCSRFToken = (token: string): boolean => {
  const storedToken = getCSRFToken();
  return storedToken === token;
};

export const clearCSRFTokens = () => {
  sessionStorage.removeItem(CSRF_TOKEN_KEY);
  document.cookie = `${CSRF_COOKIE_NAME}=; expires=Thu, 01 Jan 1970 00:00:00 UTC;`;
};

// ✓ Add CSRF token to all API requests
export const addCSRFTokenToRequest = (headers: Record<string, string>) => {
  const token = getCSRFToken();
  if (token) {
    headers['X-CSRF-Token'] = token;
  }
  return headers;
};
```

**File:** `App.tsx` (update logout handler)

```typescript
import { performLogout, startTokenRotation } from './lib/auth';

const App: React.FC = () => {
  useEffect(() => {
    // Start token rotation on app load
    startTokenRotation();
  }, []);

  const handleLogout = async () => {
    try {
      await performLogout();
    } catch (err) {
      console.error('Logout error:', err);
      // Fallback: just clear and redirect
      localStorage.clear();
      window.location.href = '/login';
    }
  };

  return (
    // ... rest of app
    <button onClick={handleLogout}>Logout</button>
  );
};
```

---

### ✅ TASK 5: Add Error Boundary (4 hours)

**File:** `components/ErrorBoundary.tsx` (new)

```typescript
import React from 'react';
import { AlertCircle } from 'lucide-react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
    };
  }

  static getDerivedStateFromError(error: Error) {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log to error tracking service
    console.error('Error caught by boundary:', error, errorInfo);

    // Send to Sentry or similar
    if (window.__sentry__) {
      window.__sentry__.captureException(error, {
        contexts: {
          react: {
            componentStack: errorInfo.componentStack,
          },
        },
      });
    }
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
    });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center min-h-screen bg-gray-100">
          <div className="bg-white rounded-lg shadow-lg p-8 max-w-md">
            <div className="flex items-center justify-center w-12 h-12 mx-auto bg-red-100 rounded-full">
              <AlertCircle className="text-red-600" size={24} />
            </div>

            <h1 className="mt-4 text-2xl font-bold text-center text-gray-900">
              Something went wrong
            </h1>

            <p className="mt-2 text-center text-gray-600">
              {this.state.error?.message || 'An unexpected error occurred'}
            </p>

            {process.env.NODE_ENV === 'development' && (
              <details className="mt-4 p-3 bg-gray-100 rounded text-sm">
                <summary className="cursor-pointer font-mono text-gray-700">
                  Error Details
                </summary>
                <pre className="mt-2 text-xs whitespace-pre-wrap break-words">
                  {this.state.error?.stack}
                </pre>
              </details>
            )}

            <div className="mt-6 flex gap-3">
              <button
                onClick={this.handleReset}
                className="flex-1 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
              >
                Try Again
              </button>

              <button
                onClick={() => {
                  window.location.href = '/';
                }}
                className="flex-1 px-4 py-2 bg-gray-300 text-gray-900 rounded hover:bg-gray-400"
              >
                Go Home
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
```

**File:** `App.tsx` (wrap main app)

```typescript
import ErrorBoundary from './components/ErrorBoundary';

const App: React.FC = () => {
  return (
    <ErrorBoundary>
      <Suspense fallback={<LoadingScreen />}>
        <Sidebar />
        <TopBar />
        {/* All routes inside error boundary */}
        {activeView === 'dashboard' && <Dashboard />}
        {/* ... other routes ... */}
      </Suspense>
    </ErrorBoundary>
  );
};
```

---

## Summary of Phase 1

✅ **Day 1-2:** Password hashing + migration  
✅ **Day 2-3:** RLS fixes + audit logging  
✅ **Day 3-4:** Input validation + sanitization  
✅ **Day 4-5:** Token management + error boundary  

**After Phase 1:**
- Passwords secured ✓
- Authorization working ✓
- Input validated ✓
- Errors handled ✓
- Security audit passing ✓

---

## PHASE 2: ARCHITECTURE (2-3 weeks)

### State Management with Zustand

**File:** `store/appStore.ts` (new)

```typescript
import { create } from 'zustand';
import type { Company, Staff, Operation, Payment } from '../types';

interface AppStore {
  // State
  companies: Company[];
  staff: Staff[];
  operations: Operation[];
  payments: Payment[];
  isLoading: boolean;

  // Actions
  setCompanies: (companies: Company[]) => void;
  setStaff: (staff: Staff[]) => void;
  setOperations: (operations: Operation[]) => void;
  setPayments: (payments: Payment[]) => void;
  setIsLoading: (loading: boolean) => void;
  
  // Data fetching
  refreshData: () => Promise<void>;
}

export const useAppStore = create<AppStore>((set) => ({
  companies: [],
  staff: [],
  operations: [],
  payments: [],
  isLoading: false,

  setCompanies: (companies) => set({ companies }),
  setStaff: (staff) => set({ staff }),
  setOperations: (operations) => set({ operations }),
  setPayments: (payments) => set({ payments }),
  setIsLoading: (isLoading) => set({ isLoading }),

  refreshData: async () => {
    set({ isLoading: true });
    try {
      const [companies, staff, operations, payments] = await Promise.all([
        fetchCompanies(),
        fetchStaff(),
        fetchOperations(),
        fetchPayments(),
      ]);

      set({ companies, staff, operations, payments });
    } catch (err) {
      console.error('Failed to refresh data:', err);
    } finally {
      set({ isLoading: false });
    }
  },
}));
```

**File:** `components/Dashboard.tsx` (updated to use store)

```typescript
import { useAppStore } from '../store/appStore';

const Dashboard = () => {
  const { companies, staff, isLoading } = useAppStore();

  return (
    <div>
      {isLoading ? (
        <LoadingSpinner />
      ) : (
        <div>
          <h2>Companies: {companies.length}</h2>
          <h2>Staff: {staff.length}</h2>
        </div>
      )}
    </div>
  );
};
```

---

This is the beginning of comprehensive refactoring. Each phase builds on the previous one.

**Next Steps:**
1. Implement Phase 1 this week
2. Test thoroughly
3. Get security review
4. Then proceed to Phase 2
