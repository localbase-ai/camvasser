-- Enable Row Level Security on all tables
-- This blocks direct PostgREST access while Prisma (using service role) continues to work
--
-- Run this in Supabase SQL Editor

-- Core tables
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Tenant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "UserTenant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BusinessUser" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Project" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Prospect" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProjectLabel" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Note" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Appointment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Proposal" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BackgroundJob" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Organization" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OrganizationContact" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OrganizationProperty" ENABLE ROW LEVEL SECURITY;

-- OAuth/Calendar tokens (if they exist)
ALTER TABLE IF EXISTS "OAuthToken" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "CalendarToken" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "CallList" ENABLE ROW LEVEL SECURITY;

-- Prisma migrations table (optional, but good practice)
ALTER TABLE IF EXISTS "_prisma_migrations" ENABLE ROW LEVEL SECURITY;

-- Verify RLS is enabled (run this after to confirm)
-- SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public';
