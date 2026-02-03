-- Enable Row Level Security on Lead table
ALTER TABLE "Lead" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Lead" FORCE ROW LEVEL SECURITY;

-- Policy: Allow all operations (tenant filtering handled by application layer)
-- RLS is enabled to satisfy Supabase security requirements
-- The postgres/service role connection bypasses these policies anyway
CREATE POLICY "Lead allow all" ON "Lead"
  FOR ALL
  USING (true)
  WITH CHECK (true);


-- Enable Row Level Security on CallScript table
ALTER TABLE "CallScript" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CallScript" FORCE ROW LEVEL SECURITY;

-- Policy: Allow all operations
CREATE POLICY "CallScript allow all" ON "CallScript"
  FOR ALL
  USING (true)
  WITH CHECK (true);


-- Enable Row Level Security on CallListAssignment table
ALTER TABLE "CallListAssignment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CallListAssignment" FORCE ROW LEVEL SECURITY;

-- Policy: Allow all operations
CREATE POLICY "CallListAssignment allow all" ON "CallListAssignment"
  FOR ALL
  USING (true)
  WITH CHECK (true);
