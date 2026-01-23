-- Create incoming_stock table
CREATE TABLE incoming_stock (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  po_number VARCHAR(100) NOT NULL UNIQUE,
  incoming_date TIMESTAMP NOT NULL,
  notes TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create incoming_stock_items table
CREATE TABLE incoming_stock_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  incoming_id UUID REFERENCES incoming_stock(id) ON DELETE CASCADE,
  item_id UUID REFERENCES items(id),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX idx_incoming_stock_po_number ON incoming_stock(po_number);
CREATE INDEX idx_incoming_stock_date ON incoming_stock(incoming_date);
CREATE INDEX idx_incoming_stock_items_incoming_id ON incoming_stock_items(incoming_id);
CREATE INDEX idx_incoming_stock_items_item_id ON incoming_stock_items(item_id);

-- Enable RLS
ALTER TABLE incoming_stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE incoming_stock_items ENABLE ROW LEVEL SECURITY;

-- RLS Policies for incoming_stock
CREATE POLICY "HRGA can view all incoming stock"
  ON incoming_stock FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'hrga'
    )
  );

CREATE POLICY "HRGA can insert incoming stock"
  ON incoming_stock FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'hrga'
    )
  );

CREATE POLICY "HRGA can delete incoming stock"
  ON incoming_stock FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'hrga'
    )
  );

-- RLS Policies for incoming_stock_items
CREATE POLICY "HRGA can view all incoming stock items"
  ON incoming_stock_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'hrga'
    )
  );

CREATE POLICY "HRGA can insert incoming stock items"
  ON incoming_stock_items FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'hrga'
    )
  );

CREATE POLICY "HRGA can delete incoming stock items"
  ON incoming_stock_items FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'hrga'
    )
  );

-- Function to update stock when incoming is created
CREATE OR REPLACE FUNCTION update_stock_on_incoming()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE items
  SET current_stock = current_stock + NEW.quantity
  WHERE id = NEW.item_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update stock
CREATE TRIGGER trigger_update_stock_on_incoming
  AFTER INSERT ON incoming_stock_items
  FOR EACH ROW
  EXECUTE FUNCTION update_stock_on_incoming();

-- Function to revert stock when incoming is deleted
CREATE OR REPLACE FUNCTION revert_stock_on_incoming_delete()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE items
  SET current_stock = current_stock - OLD.quantity
  WHERE id = OLD.item_id;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- Trigger to revert stock on delete
CREATE TRIGGER trigger_revert_stock_on_incoming_delete
  BEFORE DELETE ON incoming_stock_items
  FOR EACH ROW
  EXECUTE FUNCTION revert_stock_on_incoming_delete();
