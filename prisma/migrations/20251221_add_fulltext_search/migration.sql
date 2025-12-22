-- Add full-text search columns to Lead, Prospect, and Project tables

-- Lead: search across firstName, lastName, email, phone, address
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (
    to_tsvector('english',
      coalesce("firstName", '') || ' ' ||
      coalesce("lastName", '') || ' ' ||
      coalesce(email, '') || ' ' ||
      coalesce(phone, '') || ' ' ||
      coalesce(address, '')
    )
  ) STORED;

CREATE INDEX IF NOT EXISTS lead_search_idx ON "User" USING gin(search_vector);

-- Prospect: search across name, companyName, jobTitle
ALTER TABLE "Prospect" ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (
    to_tsvector('english',
      coalesce(name, '') || ' ' ||
      coalesce("companyName", '') || ' ' ||
      coalesce("jobTitle", '')
    )
  ) STORED;

CREATE INDEX IF NOT EXISTS prospect_search_idx ON "Prospect" USING gin(search_vector);

-- Project: search across address, city, state, name, notepad
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (
    to_tsvector('english',
      coalesce(address, '') || ' ' ||
      coalesce(city, '') || ' ' ||
      coalesce(state, '') || ' ' ||
      coalesce("postalCode", '') || ' ' ||
      coalesce(name, '') || ' ' ||
      coalesce(notepad, '')
    )
  ) STORED;

CREATE INDEX IF NOT EXISTS project_search_idx ON "Project" USING gin(search_vector);
