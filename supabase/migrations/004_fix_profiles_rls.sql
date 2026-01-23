-- =====================================================
-- FIX RLS POLICIES FOR USER MANAGEMENT BY HRGA
-- =====================================================
-- Run this in Supabase SQL Editor

-- First, make sure username column exists
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS username TEXT UNIQUE;
CREATE INDEX IF NOT EXISTS idx_profiles_username ON profiles(username);

-- Drop existing profiles policies if they exist
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "profiles_select_own" ON profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON profiles;
DROP POLICY IF EXISTS "HRGA can view all profiles" ON profiles;
DROP POLICY IF EXISTS "HRGA can update all profiles" ON profiles;
DROP POLICY IF EXISTS "HRGA can insert profiles" ON profiles;

-- Enable RLS on profiles
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own profile
CREATE POLICY "Users can view own profile" ON profiles
    FOR SELECT
    USING (auth.uid() = id);

-- Policy: HRGA can view ALL profiles
CREATE POLICY "HRGA can view all profiles" ON profiles
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM profiles p 
            WHERE p.id = auth.uid() AND p.role = 'hrga'
        )
    );

-- Policy: Users can update their own profile
CREATE POLICY "Users can update own profile" ON profiles
    FOR UPDATE
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- Policy: HRGA can update ALL profiles  
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

-- Policy: HRGA can insert new profiles (for user creation)
CREATE POLICY "HRGA can insert profiles" ON profiles
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles p 
            WHERE p.id = auth.uid() AND p.role = 'hrga'
        )
    );

-- Policy: Service role / trigger can insert profiles (for auth trigger)
CREATE POLICY "Service can insert profiles" ON profiles
    FOR INSERT
    WITH CHECK (true);

-- Verify the policies
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual 
FROM pg_policies 
WHERE tablename = 'profiles';
