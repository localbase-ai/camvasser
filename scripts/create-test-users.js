import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const password = '***REMOVED***';
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
  const kcroof = await prisma.tenant.findUnique({ where: { slug: 'kcroof' } });

  if (!budroofing || !kcroof) {
    throw new Error('Tenants not found. Make sure budroofing and kcroof tenants exist.');
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
        tenantId: kcroof.id,
        role: 'member'
      }
    });
    console.log(`Linked ${user.name} to budroofing and kcroof as member`);
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
