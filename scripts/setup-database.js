#!/usr/bin/env node

/**
 * Database Setup Script
 * This script sets up the Supabase database schema and creates a test user
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
    console.error('❌ Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
    process.exit(1);
}

// Create Supabase client with service role key (bypasses RLS)
const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});

async function setupDatabase() {
    console.log('🚀 Starting database setup...\n');

    try {
        // Check if tables exist
        console.log('📊 Checking existing tables...');
        const { data: tables, error: tablesError } = await supabase
            .from('profiles')
            .select('id')
            .limit(1);

        if (!tablesError) {
            console.log('✅ Tables already exist!');
            console.log('   If you need to recreate tables, run the schema.sql in Supabase SQL Editor.\n');
        } else {
            console.log('⚠️  Tables not found. You need to run schema.sql in Supabase SQL Editor.');
            console.log('   Steps:');
            console.log('   1. Go to: https://supabase.com/dashboard/project/veudzohikigofgaqfwcj/sql/new');
            console.log('   2. Copy content from: supabase/schema.sql');
            console.log('   3. Paste and click "Run"\n');
            return false;
        }

        // Check for existing users
        console.log('👤 Checking for existing users...');
        const { data: authUsers, error: authError } = await supabase.auth.admin.listUsers();

        if (authError) {
            console.error('❌ Error checking users:', authError.message);
            return false;
        }

        if (authUsers.users.length === 0) {
            console.log('📝 No users found. Creating test super admin...');

            // Create test user
            const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
                email: 'admin@asos.uz',
                password: 'Admin123!',
                email_confirm: true,
                user_metadata: {
                    full_name: 'Super Admin'
                }
            });

            if (createError) {
                console.error('❌ Error creating user:', createError.message);
                return false;
            }

            console.log('✅ User created:', newUser.user.email);

            // Create profile with super_admin role
            const { error: profileError } = await supabase
                .from('profiles')
                .insert({
                    id: newUser.user.id,
                    email: newUser.user.email,
                    full_name: 'Super Admin',
                    role: 'super_admin',
                    department: 'Buxgalteriya',
                    is_active: true
                });

            if (profileError) {
                console.error('❌ Error creating profile:', profileError.message);
                return false;
            }

            console.log('✅ Profile created with super_admin role');
            console.log('\n📧 Login credentials:');
            console.log('   Email: admin@asos.uz');
            console.log('   Password: Admin123!\n');
        } else {
            console.log(`✅ Found ${authUsers.users.length} existing user(s)`);

            // Check if any user has super_admin role
            const { data: profiles } = await supabase
                .from('profiles')
                .select('email, role')
                .eq('role', 'super_admin');

            if (profiles && profiles.length > 0) {
                console.log('✅ Super admin exists:', profiles[0].email);
            } else {
                console.log('⚠️  No super admin found. You may need to update a user role.');
                console.log('   Run this SQL in Supabase SQL Editor:');
                console.log(`   UPDATE profiles SET role = 'super_admin' WHERE email = '${authUsers.users[0].email}';`);
            }
        }

        console.log('\n✅ Database setup complete!');
        return true;

    } catch (error) {
        console.error('❌ Unexpected error:', error);
        return false;
    }
}

// Run setup
setupDatabase().then(success => {
    process.exit(success ? 0 : 1);
});
