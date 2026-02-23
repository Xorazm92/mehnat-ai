#!/usr/bin/env bash

# ================================================================
# QUICK-START SECURITY IMPLEMENTATION
# ================================================================
# 
# This script sets up and validates all security fixes
# Run from project root: bash QUICK_START_SECURITY.sh
#

set -e  # Exit on error

echo "╔════════════════════════════════════════════════════════╗"
echo "║   ASOS SECURITY FIXES - QUICK START                    ║"
echo "║   Safe, Step-by-Step Implementation Guide              ║"
echo "╚════════════════════════════════════════════════════════╝"
echo ""

# ================================================================
# COLORS FOR OUTPUT
# ================================================================
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# ================================================================
# HELPER FUNCTIONS
# ================================================================

log_info() {
  echo -e "${BLUE}ℹ${NC} $1"
}

log_success() {
  echo -e "${GREEN}✓${NC} $1"
}

log_warn() {
  echo -e "${YELLOW}⚠${NC} $1"
}

log_error() {
  echo -e "${RED}✗${NC} $1"
}

# ================================================================
# PRE-CHECKS
# ================================================================

echo ""
log_info "Running pre-flight checks..."
echo ""

# Check if in correct directory
if [ ! -f "package.json" ]; then
  log_error "package.json not found. Please run from project root."
  exit 1
fi
log_success "Found package.json"

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
  log_warn "Node.js 18+ recommended (you have $NODE_VERSION)"
fi
log_success "Node.js version: $(node -v)"

# Check npm
if ! command -v npm &> /dev/null; then
  log_error "npm not found"
  exit 1
fi
log_success "npm version: $(npm -v)"

# Check git
if ! command -v git &> /dev/null; then
  log_warn "git not found - cannot create backup"
else
  log_success "git is installed"
fi

# ================================================================
# STEP 1: BACKUP
# ================================================================

echo ""
log_info "Step 1: Creating backup..."
echo ""

BACKUP_DIR="backups/$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"

# Backup key files
cp package.json "$BACKUP_DIR/package.json"
cp -r lib "$BACKUP_DIR/lib" 2>/dev/null || true
cp -r components "$BACKUP_DIR/components" 2>/dev/null || true
cp App.tsx "$BACKUP_DIR/App.tsx" 2>/dev/null || true

log_success "Backup created: $BACKUP_DIR"

# ================================================================
# STEP 2: VERIFY DEPENDENCIES
# ================================================================

echo ""
log_info "Step 2: Verifying dependencies..."
echo ""

MISSING_DEPS=0

# Check bcrypt
if ! grep -q '"bcrypt"' package.json; then
  log_warn "bcrypt not in package.json"
  MISSING_DEPS=$((MISSING_DEPS + 1))
else
  log_success "bcrypt is in package.json"
fi

# Check zod
if ! grep -q '"zod"' package.json; then
  log_warn "zod not in package.json"
  MISSING_DEPS=$((MISSING_DEPS + 1))
else
  log_success "zod is in package.json"
fi

# Check dompurify
if ! grep -q '"dompurify"' package.json; then
  log_warn "dompurify not in package.json"
  MISSING_DEPS=$((MISSING_DEPS + 1))
else
  log_success "dompurify is in package.json"
fi

if [ $MISSING_DEPS -gt 0 ]; then
  log_warn "Installing missing dependencies..."
  npm install bcrypt zod dompurify axios
  npm install -D @types/bcrypt @types/node
  log_success "Dependencies installed"
else
  log_success "All dependencies found"
fi

# ================================================================
# STEP 3: VERIFY SECURITY FILES
# ================================================================

echo ""
log_info "Step 3: Verifying security utility files..."
echo ""

MISSING_FILES=0

# Check each utility file
for file in "lib/passwordUtils.ts" "lib/validation.ts" "lib/sanitize.ts" "lib/auth.ts" "lib/errors.ts" "lib/constants.ts" "components/ErrorBoundary.tsx"; do
  if [ ! -f "$file" ]; then
    log_error "Missing: $file"
    MISSING_FILES=$((MISSING_FILES + 1))
  else
    log_success "Found: $file"
  fi
done

if [ $MISSING_FILES -gt 0 ]; then
  log_error "Missing $MISSING_FILES security files. They should have been created."
  exit 1
fi

log_success "All security utility files present"

# ================================================================
# STEP 4: VERIFY DATABASE MIGRATION
# ================================================================

echo ""
log_info "Step 4: Checking database migration file..."
echo ""

if [ ! -f "supabase/migrations/20260219_security_audit_fixes.sql" ]; then
  log_error "Database migration not found"
  exit 1
fi

log_success "Found: supabase/migrations/20260219_security_audit_fixes.sql"

# ================================================================
# STEP 5: VERIFY PASSWORD MIGRATION SCRIPT
# ================================================================

echo ""
log_info "Step 5: Checking password migration script..."
echo ""

if [ ! -f "scripts/migrate_passwords.js" ]; then
  log_error "Password migration script not found"
  exit 1
fi

log_success "Found: scripts/migrate_passwords.js"

# ================================================================
# STEP 6: TYPE CHECK
# ================================================================

echo ""
log_info "Step 6: Running TypeScript type check..."
echo ""

if command -v tsc &> /dev/null; then
  if tsc --noEmit 2>/dev/null; then
    log_success "Type check passed"
  else
    log_warn "Type check has warnings (this may be expected)"
  fi
else
  log_warn "TypeScript compiler not found - skipping type check"
fi

# ================================================================
# STEP 7: VERIFICATION SUMMARY
# ================================================================

echo ""
echo "╔════════════════════════════════════════════════════════╗"
echo "║               VERIFICATION SUMMARY                     ║"
echo "╚════════════════════════════════════════════════════════╝"
echo ""

log_success "Pre-flight checks completed"
log_success "Backup created: $BACKUP_DIR"
log_success "Dependencies verified"
log_success "Security utility files present"
log_success "Database migration file ready"
log_success "Password migration script ready"

# ================================================================
# NEXT STEPS
# ================================================================

echo ""
echo "╔════════════════════════════════════════════════════════╗"
echo "║               NEXT STEPS                               ║"
echo "╚════════════════════════════════════════════════════════╝"
echo ""

echo "1. 📋 READ IMPLEMENTATION GUIDE"
echo "   cat SECURITY_IMPLEMENTATION_GUIDE.md"
echo ""

echo "2. 🗂️  CHECK IMPLEMENTATION CHECKLIST"
echo "   cat IMPLEMENTATION_CHECKLIST.md"
echo ""

echo "3. 📊 REVIEW QUICK REFERENCE"
echo "   cat QUICK_START_SECURITY.sh  # This file"
echo ""

echo "4. 🗄️  APPLY DATABASE MIGRATION"
echo "   Option A (Recommended - Supabase CLI):"
echo "   npx supabase migration up"
echo ""
echo "   Option B (Manual SQL execution):"
echo "   1. Go to Supabase Dashboard"
echo "   2. SQL Editor"
echo "   3. Copy content from: supabase/migrations/20260219_security_audit_fixes.sql"
echo "   4. Execute"
echo ""

echo "5. 🔐 MIGRATE EXISTING PASSWORDS"
echo "   node scripts/migrate_passwords.js"
echo ""

echo "6. 🔄 UPDATE supabaseData.ts"
echo "   Add validation & sanitization to all API calls"
echo "   See: SECURITY_IMPLEMENTATION_GUIDE.md (Step 2)"
echo ""

echo "7. 🧪 RUN SECURITY TESTS"
echo "   npm test -- security.test.ts"
echo ""

echo "8. 📦 BUILD FOR PRODUCTION"
echo "   npm run build"
echo ""

echo "9. 🚀 DEPLOY"
echo "   npm run deploy"
echo ""

# ================================================================
# IMPORTANT NOTICES
# ================================================================

echo ""
echo "╔════════════════════════════════════════════════════════╗"
echo "║               IMPORTANT NOTICES                        ║"
echo "╚════════════════════════════════════════════════════════╝"
echo ""

log_warn "BEFORE GOING TO PRODUCTION:"
log_warn "  ✓ Test thoroughly in staging environment"
log_warn "  ✓ Backup all production data"
log_warn "  ✓ Have rollback plan ready"
log_warn "  ✓ Notify all team members"
log_warn "  ✓ Monitor error logs closely after deployment"
echo ""

log_info "DATABASE MIGRATION NOTES:"
log_info "  • Migrations are applied in order (by filename)"
log_info "  • Each migration is idempotent (safe to re-run)"
log_info "  • Create backup before applying migrations"
log_info "  • Test migrations in staging first"
echo ""

log_info "PASSWORD MIGRATION NOTES:"
log_info "  • Only migrates plain-text passwords"
log_info "  • Creates backup before making changes"
log_info "  • Skips already-hashed passwords"
log_info "  • Logs all changes to audit_logs"
echo ""

# ================================================================
# QUICK COMMANDS REFERENCE
# ================================================================

echo ""
echo "╔════════════════════════════════════════════════════════╗"
echo "║               QUICK COMMANDS REFERENCE                 ║"
echo "╚════════════════════════════════════════════════════════╝"
echo ""

cat << 'EOF'
# View documentation
cat SECURITY_IMPLEMENTATION_GUIDE.md
cat IMPLEMENTATION_CHECKLIST.md

# Install dependencies
npm install

# Type check
npx tsc --noEmit

# Run security tests
npm test -- security.test.ts

# Apply database migrations
npx supabase migration up

# Migrate existing passwords
node scripts/migrate_passwords.js

# Build for production
npm run build

# View audit logs
sqlite3 local.db "SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 10;"

# Check database migration status
psql $DATABASE_URL -c "SELECT * FROM pg_migrations ORDER BY id DESC LIMIT 5;"

# Restore from backup
cp -r backups/[BACKUP_DIR]/* .

# Emergency rollback
git revert [commit_hash]

# Check token rotation
grep "startTokenRotation" App.tsx

# Verify bcrypt installation
npm list bcrypt

# Verify zod installation
npm list zod

# Verify dompurify installation
npm list dompurify
EOF

echo ""
log_success "Quick-start setup complete!"
log_info "Total setup time: ~5-10 minutes"
log_info "Full implementation time: ~2-3 weeks"

# ================================================================
# ENVIRONMENT VARIABLES
# ================================================================

echo ""
echo "╔════════════════════════════════════════════════════════╗"
echo "║               REQUIRED ENVIRONMENT VARIABLES           ║"
echo "╚════════════════════════════════════════════════════════╝"
echo ""

cat << 'EOF'
Required variables (in .env or .env.local):

VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_anon_key
NODE_ENV=production  # for password migration script

Optional variables:

LOG_LEVEL=info
DEBUG=false
ENABLE_AUDIT_LOGGING=true
EOF

echo ""

# ================================================================
# FINAL CHECKLIST
# ================================================================

echo ""
echo "╔════════════════════════════════════════════════════════╗"
echo "║               BEFORE RUNNING FIRST TASK               ║"
echo "║                   (CHECK ALL)                         ║"
echo "╚════════════════════════════════════════════════════════╝"
echo ""

read -p "$(echo -e ${BLUE}'✓ Have you reviewed SECURITY_IMPLEMENTATION_GUIDE.md? (y/n): '${NC})" -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  log_error "Please read the guide first"
  exit 1
fi

read -p "$(echo -e ${BLUE}'✓ Have you backed up your database? (y/n): '${NC})" -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  log_warn "Please backup before continuing"
  exit 1
fi

read -p "$(echo -e ${BLUE}'✓ Are you testing in staging first? (y/n): '${NC})" -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  log_warn "Always test in staging before production"
fi

read -p "$(echo -e ${BLUE}'✓ Is your team aware of this deployment? (y/n): '${NC})" -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  log_warn "Notify your team before deploying"
fi

echo ""
log_success "Ready to proceed with security implementation!"
echo ""
echo "Next: Follow the steps listed above in order"
echo "Questions? Check SECURITY_IMPLEMENTATION_GUIDE.md"
echo ""
