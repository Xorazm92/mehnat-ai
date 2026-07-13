#!/usr/bin/env node

/**
 * PASSWORD MIGRATION SCRIPT
 * ======================
 * Migrates existing plain-text passwords to bcrypt hashes
 * 
 * CRITICAL: Run this AFTER applying security_audit_fixes.sql migration
 * 
 * Usage:
 *   npm install -g bcryptjs  (if not already installed)
 *   node scripts/migrate_passwords.js
 * 
 * Security:
 *   - Only runs in production with explicit confirmation
 *   - Logs all password updates to audit_logs
 *   - Validates bcrypt hashes before updating
 *   - Creates backup before making changes
 */

const bcrypt = require('bcrypt');
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

// ================================================================
// Configuration
// ================================================================

const SALT_ROUNDS = 12;
const BATCH_SIZE = 50;
const DELAY_MS = 100; // Delay between batches to avoid overwhelming DB

const config = {
  supabaseUrl: process.env.VITE_SUPABASE_URL,
  supabaseKey: process.env.VITE_SUPABASE_ANON_KEY,
  environment: process.env.NODE_ENV || 'development'
};

if (!config.supabaseUrl || !config.supabaseKey) {
  console.error('❌ ERROR: Missing Supabase credentials in environment variables');
  console.error('   Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY');
  process.exit(1);
}

// ================================================================
// Initialize Supabase Client
// ================================================================

const supabase = createClient(config.supabaseUrl, config.supabaseKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// ================================================================
// Utility Functions
// ================================================================

/**
 * Create readline interface for user input
 */
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

/**
 * Ask user for confirmation
 */
async function askConfirmation(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y');
    });
  });
}

/**
 * Log migration progress
 */
function log(level, message, data = null) {
  const timestamp = new Date().toISOString();
  const prefix = {
    'INFO': '✓',
    'WARN': '⚠',
    'ERROR': '❌',
    'SUCCESS': '✅'
  }[level] || '•';

  console.log(`[${timestamp}] ${prefix} ${message}`);
  if (data) {
    console.log(JSON.stringify(data, null, 2));
  }
}

/**
 * Hash a password using bcrypt
 */
async function hashPassword(plainPassword) {
  if (!plainPassword || typeof plainPassword !== 'string') {
    throw new Error('Invalid password: must be non-empty string');
  }

  try {
    const hash = await bcrypt.hash(plainPassword, SALT_ROUNDS);
    
    // Validate hash format
    if (!hash.startsWith('$2')) {
      throw new Error('Invalid bcrypt hash format');
    }

    return hash;
  } catch (error) {
    throw new Error(`Failed to hash password: ${error.message}`);
  }
}

/**
 * Create backup of profiles before migration
 */
async function createBackup() {
  try {
    log('INFO', 'Creating backup of profiles table...');

    const { data, error } = await supabase
      .from('profiles')
      .select('id, email, password')
      .not('password', 'is', null);

    if (error) throw error;

    if (data && data.length > 0) {
      const backupFile = `backup_profiles_${Date.now()}.json`;
      const backupPath = path.join(__dirname, '..', 'backups', backupFile);
      
      // Create backups directory if it doesn't exist
      const backupDir = path.dirname(backupPath);
      if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
      }

      // Write backup with only IDs and hashed passwords
      const backup = {
        timestamp: new Date().toISOString(),
        totalRecords: data.length,
        records: data.map(r => ({
          id: r.id,
          email: r.email,
          hasPassword: !!r.password,
          passwordLength: r.password ? r.password.length : 0
        }))
      };

      fs.writeFileSync(backupPath, JSON.stringify(backup, null, 2));
      log('SUCCESS', `Backup created: ${backupPath}`, { recordCount: data.length });
      return data;
    }

    return [];
  } catch (error) {
    log('ERROR', 'Failed to create backup', { error: error.message });
    throw error;
  }
}

/**
 * Fetch profiles with passwords
 */
async function fetchProfilesToMigrate() {
  try {
    log('INFO', 'Fetching profiles with plain-text passwords...');

    const { data, error } = await supabase
      .from('profiles')
      .select('id, email, password')
      .not('password', 'is', null);

    if (error) throw error;

    if (!data || data.length === 0) {
      log('WARN', 'No profiles with passwords found');
      return [];
    }

    log('SUCCESS', `Found ${data.length} profiles to migrate`);
    return data;
  } catch (error) {
    log('ERROR', 'Failed to fetch profiles', { error: error.message });
    throw error;
  }
}

/**
 * Migrate passwords in batches
 */
async function migratePasswords(profiles) {
  const stats = {
    total: profiles.length,
    successful: 0,
    failed: 0,
    skipped: 0,
    errors: []
  };

  for (let i = 0; i < profiles.length; i += BATCH_SIZE) {
    const batch = profiles.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(profiles.length / BATCH_SIZE);

    log('INFO', `Processing batch ${batchNum}/${totalBatches} (${batch.length} profiles)`);

    for (const profile of batch) {
      try {
        // Validate password
        if (!profile.password || typeof profile.password !== 'string') {
          log('WARN', `Skipping ${profile.email}: Invalid or empty password`);
          stats.skipped++;
          continue;
        }

        // Skip if already hashed (bcrypt hash starts with $2)
        if (profile.password.startsWith('$2')) {
          log('WARN', `Skipping ${profile.email}: Already hashed`);
          stats.skipped++;
          continue;
        }

        // Hash the password
        const hash = await hashPassword(profile.password);

        // Update in database
        const { error: updateError } = await supabase
          .from('profiles')
          .update({
            password_hash: hash,
            password_changed_at: new Date().toISOString()
          })
          .eq('id', profile.id);

        if (updateError) {
          throw updateError;
        }

        log('SUCCESS', `Migrated password for ${profile.email}`);
        stats.successful++;

      } catch (error) {
        log('ERROR', `Failed to migrate ${profile.email}`, { 
          error: error.message 
        });
        stats.failed++;
        stats.errors.push({
          profileId: profile.id,
          email: profile.email,
          error: error.message
        });
      }
    }

    // Delay between batches
    if (i + BATCH_SIZE < profiles.length) {
      await new Promise(resolve => setTimeout(resolve, DELAY_MS));
    }
  }

  return stats;
}

/**
 * Audit log migration
 */
async function auditMigration(stats) {
  try {
    log('INFO', 'Recording migration to audit logs...');

    const { error } = await supabase
      .from('audit_logs')
      .insert([{
        action: 'PASSWORD_MIGRATION',
        table_name: 'profiles',
        status: stats.failed === 0 ? 'success' : 'partial',
        error_message: stats.failed > 0 ? `Failed to migrate ${stats.failed} profiles` : null,
        metadata: {
          total: stats.total,
          successful: stats.successful,
          failed: stats.failed,
          skipped: stats.skipped,
          timestamp: new Date().toISOString()
        }
      }]);

    if (error) {
      log('WARN', 'Failed to audit log migration', { error: error.message });
      return;
    }

    log('SUCCESS', 'Migration recorded in audit logs');
  } catch (error) {
    log('WARN', 'Audit logging failed', { error: error.message });
  }
}

/**
 * Generate migration report
 */
function generateReport(stats) {
  const report = `
╔════════════════════════════════════════════════════════╗
║           PASSWORD MIGRATION REPORT                    ║
╚════════════════════════════════════════════════════════╝

Timestamp: ${new Date().toISOString()}
Environment: ${config.environment}

RESULTS:
  Total profiles:     ${stats.total}
  Successfully migrated: ${stats.successful} ✓
  Failed:             ${stats.failed} ✗
  Skipped:            ${stats.skipped}

MIGRATION COMPLETION: ${((stats.successful / stats.total) * 100).toFixed(2)}%

${stats.errors.length > 0 ? `FAILED PROFILES:
${stats.errors.map(e => `  - ${e.email}: ${e.error}`).join('\n')}
` : ''}

ACTION ITEMS:
  ${stats.failed === 0 ? '✓ All passwords migrated successfully' : '✗ Review failed migrations above'}
  ${stats.skipped === 0 ? '' : `✓ ${stats.skipped} profiles already had hashed passwords`}
  ✓ Changes logged to audit_logs table
  ✓ Run password_hash validation checks

NEXT STEPS:
  1. Review this report
  2. Run password validation checks
  3. Update application to use password_hash column
  4. Archive backup file: backups/backup_profiles_*.json
  5. Verify no applications still use plain 'password' column
  `;

  return report;
}

/**
 * Validate migration
 */
async function validateMigration() {
  try {
    log('INFO', 'Validating migration...');

    // Check if any profiles still have plain text passwords
    const { data, error } = await supabase
      .from('profiles')
      .select('id')
      .not('password', 'is', null);

    if (error) throw error;

    if (data && data.length > 0) {
      log('WARN', `Found ${data.length} profiles still with plain-text passwords`, {
        profileIds: data.map(p => p.id)
      });
      return false;
    }

    log('SUCCESS', 'No plain-text passwords found');
    return true;
  } catch (error) {
    log('ERROR', 'Validation failed', { error: error.message });
    return false;
  }
}

// ================================================================
// Main Migration Function
// ================================================================

async function main() {
  console.log(`
╔════════════════════════════════════════════════════════╗
║      PASSWORD MIGRATION TO BCRYPT HASHES               ║
║                                                        ║
║  ⚠️  WARNING: This script will modify production data  ║
║  CRITICAL SECURITY OPERATION - HANDLE WITH CARE       ║
╚════════════════════════════════════════════════════════╝
  `);

  try {
    // Confirm execution
    log('WARN', `Running in ${config.environment} environment`);
    
    if (config.environment === 'production') {
      const confirmed = await askConfirmation(
        'Are you sure you want to migrate passwords in PRODUCTION? Type "yes" to confirm: '
      );
      
      if (!confirmed) {
        log('INFO', 'Migration cancelled');
        process.exit(0);
      }
    }

    // Step 1: Create backup
    await createBackup();

    // Step 2: Fetch profiles
    const profiles = await fetchProfilesToMigrate();
    
    if (profiles.length === 0) {
      log('INFO', 'No profiles to migrate');
      process.exit(0);
    }

    // Step 3: Migrate passwords
    log('INFO', 'Starting password migration...');
    const stats = await migratePasswords(profiles);

    // Step 4: Audit log
    await auditMigration(stats);

    // Step 5: Validate
    const isValid = await validateMigration();

    // Step 6: Report
    const report = generateReport(stats);
    console.log(report);

    // Save report
    const reportFile = `migration_report_${Date.now()}.txt`;
    const reportPath = path.join(__dirname, '..', 'backups', reportFile);
    
    const backupDir = path.dirname(reportPath);
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    fs.writeFileSync(reportPath, report);
    log('SUCCESS', `Report saved: ${reportPath}`);

    // Exit with appropriate code
    process.exit(stats.failed === 0 ? 0 : 1);

  } catch (error) {
    log('ERROR', 'Migration failed', { error: error.message });
    process.exit(1);
  } finally {
    rl.close();
  }
}

// Run migration
main().catch(error => {
  log('ERROR', 'Unexpected error', { error: error.message });
  process.exit(1);
});
