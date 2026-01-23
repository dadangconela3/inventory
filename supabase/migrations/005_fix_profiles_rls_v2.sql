-- =====================================================
-- FIX RLS POLICIES - RESTORE LOGIN & DASHBOARD FUNCTIONALITY
-- =====================================================
-- Run this in Supabase SQL Editor IMMEDIATELY

-- First, drop ALL existing profile policies to start fresh
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON profiles;
DROP POLICY IF EXISTS "HRGA can view all profiles" ON profiles;
DROP POLICY IF EXISTS "HRGA can update all profiles" ON profiles;
DROP POLICY IF EXISTS "HRGA can insert profiles" ON profiles;
DROP POLICY IF EXISTS "Service can insert profiles" ON profiles;
DROP POLICY IF EXISTS "profiles_select_own" ON profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON profiles;

-- Make sure RLS is enabled
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- NEW POLICIES - FIXED
-- =====================================================

-- 1. EVERYONE can read ALL profiles (needed for login username lookup & dashboard)
CREATE POLICY "Profiles are viewable by everyone" ON profiles
    FOR SELECT
    USING (true);

-- 2. Users can update their OWN profile
CREATE POLICY "Users can update own profile" ON profiles
    FOR UPDATE
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- 3. HRGA can update ANY profile (for user management)
CREATE POLICY "HRGA can update all profiles" ON profiles
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM profiles p 
            WHERE p.id = auth.uid() AND p.role = 'hrga'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles p 
            WHERE p.id = auth.uid() AND p.role = 'hrga'
        )
    );

-- 4. Allow INSERT for new user registration (auth trigger)
CREATE POLICY "Allow profile creation" ON profiles
    FOR INSERT
    WITH CHECK (true);

-- =====================================================
-- VERIFY POLICIES
-- =====================================================
SELECT policyname, cmd, qual FROM pg_policies WHERE tablename = 'profiles';

-- =====================================================
-- TEST: Check if you can read profiles now
-- =====================================================
SELECT id, email, username, full_name, role FROM profiles LIMIT 5;
