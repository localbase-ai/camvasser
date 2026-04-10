import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const password = process.env.DEFAULT_USER_PASSWORD || process.argv[2];
  if (!password) { console.error('Usage: node create-test-users.js <password> or set DEFAULT_USER_PASSWORD'); process.exit(1); }
  const passwordHash = await bcrypt.hash(password, 10);

  // Create Jake Riggin
  const jake = await prisma.businessUser.create({
    data: {
      name: 'Jake Riggin',
      email: 'jakobriggin@gmail.com',
      companyName: 'Bud Roofing',
      status: 'approved',
      approvedAt: new Date(),
      passwordHash,
      isAdmin: false
    }
  });
  console.log('Created user:', jake.name, jake.email);

  // Create Cade Riggin
  const cade = await prisma.businessUser.create({
    data: {
      name: 'Cade Riggin',
      email: 'caderiggin@gmail.com',
      companyName: 'Bud Roofing',
      status: 'approved',
      approvedAt: new Date(),
      passwordHash,
      isAdmin: false
    }
  });
  console.log('Created user:', cade.name, cade.email);

  // Get tenants
  const budroofing = await prisma.tenant.findUnique({ where: { slug: 'budroofing' } });
  const kcroofrestoration = await prisma.tenant.findUnique({ where: { slug: 'kcroofrestoration' } });

  if (!budroofing || !kcroofrestoration) {
    throw new Error('Tenants not found. Make sure budroofing and kcroofrestoration tenants exist.');
  }

  // Link both users to both tenants with "member" role
  for (const user of [jake, cade]) {
    await prisma.userTenant.create({
      data: {
        userId: user.id,
        tenantId: budroofing.id,
        role: 'member'
      }
    });
    await prisma.userTenant.create({
      data: {
        userId: user.id,
        tenantId: kcroofrestoration.id,
        role: 'member'
      }
    });
    console.log(`Linked ${user.name} to budroofing and kcroofrestoration as member`);
  }

  console.log('\nDone! Both users can now log in.');
}

main()
  .catch((e) => {
    console.error('Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
