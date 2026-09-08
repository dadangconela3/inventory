-- =====================================================
-- FIX DELETE USER FUNCTION (handle foreign key constraints)
-- =====================================================
-- Run this in Supabase SQL Editor if using RPC

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
    
    -- Clean up referencing data to avoid foreign key violations
    DELETE FROM notifications WHERE user_id = delete_user_completely.user_id;
    DELETE FROM user_departments WHERE user_id = delete_user_completely.user_id;
    UPDATE incoming_stock SET created_by = NULL WHERE created_by = delete_user_completely.user_id;
    UPDATE requests SET requester_id = NULL WHERE requester_id = delete_user_completely.user_id;
    
    -- Delete from profiles
    DELETE FROM profiles WHERE id = delete_user_completely.user_id;
    
    -- Delete from auth.users
    DELETE FROM auth.users WHERE id = delete_user_completely.user_id;
    
    RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION delete_user_completely TO authenticated;
