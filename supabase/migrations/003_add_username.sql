-- =====================================================
-- ADD USERNAME COLUMN TO PROFILES
-- =====================================================
-- Run this after 001_initial_schema.sql
-- This adds a username column for login with username

-- Add username column
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS username TEXT UNIQUE;

-- Create index for faster username lookups
CREATE INDEX IF NOT EXISTS idx_profiles_username ON profiles(username);

-- Update existing users to have username = email prefix (before @)
UPDATE profiles 
SET username = split_part(email, '@', 1)
WHERE username IS NULL;

-- =====================================================
-- Update demo users with proper usernames
-- =====================================================
UPDATE profiles SET username = 'admin.produksi' WHERE email = 'admin.produksi@demo.com';
UPDATE profiles SET username = 'admin.indirect' WHERE email = 'admin.indirect@demo.com';
UPDATE profiles SET username = 'admin.dept' WHERE email = 'admin.dept@demo.com';
UPDATE profiles SET username = 'supervisor.molding' WHERE email = 'supervisor.molding@demo.com';
UPDATE profiles SET username = 'supervisor.ppic' WHERE email = 'supervisor.ppic@demo.com';
UPDATE profiles SET username = 'hrga' WHERE email = 'hrga@demo.com';

-- Verify
SELECT email, username, full_name, role FROM profiles ORDER BY created_at;
