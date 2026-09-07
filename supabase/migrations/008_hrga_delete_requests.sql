-- Migration: Allow HRGA to delete requests and request_items

-- Policy for requests table
DROP POLICY IF EXISTS "HRGA can delete requests" ON requests;
CREATE POLICY "HRGA can delete requests" ON requests
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'hrga'
    )
  );

-- Policy for request_items table
DROP POLICY IF EXISTS "HRGA can delete request_items" ON request_items;
CREATE POLICY "HRGA can delete request_items" ON request_items
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'hrga'
    )
  );
