-- =============================================
-- MIGRATION 009: ALLOW HRGA TO UPDATE REQUEST ITEMS
-- =============================================

-- Allow HRGA to update request_items (e.g. adjust quantities on handover)
CREATE POLICY "HRGA can update request items" ON request_items
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'hrga'
    )
  );
