/**
 * One-time script to seed QuickBooks OAuth tokens from environment variables
 * Run with: node scripts/seed-quickbooks-token.js
 */

import { PrismaClient } from '@prisma/client';
import 'dotenv/config';

const prisma = new PrismaClient();

async function main() {
  const accessToken = process.env.QUICKBOOKS_ACCESS_TOKEN;
  const refreshToken = process.env.QUICKBOOKS_REFRESH_TOKEN;
  const expiresAt = process.env.QUICKBOOKS_TOKEN_EXPIRES_AT;
  const companyId = process.env.QUICKBOOKS_COMPANY_ID;

  if (!accessToken || !refreshToken) {
    console.error('Missing QUICKBOOKS_ACCESS_TOKEN or QUICKBOOKS_REFRESH_TOKEN in environment');
    process.exit(1);
  }

  // Check if token already exists
  const existing = await prisma.oAuthToken.findUnique({
    where: { provider: 'quickbooks' }
  });

  if (existing) {
    console.log('QuickBooks token already exists in database:');
    console.log('  Provider:', existing.provider);
    console.log('  Expires:', existing.expiresAt);
    console.log('  Updated:', existing.updatedAt);
    console.log('\nTo update, delete the existing record first or use the app to trigger a refresh.');
    return;
  }

  // Create the token record
  const token = await prisma.oAuthToken.create({
    data: {
      provider: 'quickbooks',
      accessToken,
      refreshToken,
      expiresAt: expiresAt ? new Date(expiresAt) : new Date(), // Default to now if not set
      companyId
    }
  });

  console.log('QuickBooks token seeded successfully!');
  console.log('  ID:', token.id);
  console.log('  Provider:', token.provider);
  console.log('  Expires:', token.expiresAt);
  console.log('  Company ID:', token.companyId);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
