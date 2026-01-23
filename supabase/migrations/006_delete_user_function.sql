-- =====================================================
-- CREATE FUNCTION TO DELETE USER (both profile and auth)
-- =====================================================
-- Run this in Supabase SQL Editor

-- Create function to delete user completely
CREATE OR REPLACE FUNCTION delete_user_completely(user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    caller_role TEXT;
BEGIN
    -- Check if caller is HRGA
    SELECT role INTO caller_role 
    FROM profiles 
    WHERE id = auth.uid();
    
    IF caller_role != 'hrga' THEN
        RAISE EXCEPTION 'Only HRGA can delete users';
    END IF;
    
    -- Don't allow deleting yourself
    IF user_id = auth.uid() THEN
        RAISE EXCEPTION 'Cannot delete your own account';
    END IF;
    
    -- Delete from profiles first (cascade will handle related data)
    DELETE FROM profiles WHERE id = user_id;
    
    -- Delete from auth.users
    DELETE FROM auth.users WHERE id = user_id;
    
    RETURN TRUE;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION delete_user_completely TO authenticated;

-- Add RLS policy for HRGA to delete profiles
DROP POLICY IF EXISTS "HRGA can delete profiles" ON profiles;
CREATE POLICY "HRGA can delete profiles" ON profiles
    FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM profiles p 
            WHERE p.id = auth.uid() AND p.role = 'hrga'
        )
    );
