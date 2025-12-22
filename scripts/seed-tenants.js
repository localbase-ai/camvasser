// Seed script to create tenants and link existing user
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding tenants...');

  // Create tenants
  const budRoofing = await prisma.tenant.upsert({
    where: { slug: 'budroofing' },
    update: {},
    create: {
      slug: 'budroofing',
      name: 'Bud Roofing',
      domain: 'budroofing.com'
    }
  });
  console.log('Created tenant:', budRoofing);

  const kcRoof = await prisma.tenant.upsert({
    where: { slug: 'kcroof' },
    update: {},
    create: {
      slug: 'kcroof',
      name: 'KC Roof Restoration',
      domain: null
    }
  });
  console.log('Created tenant:', kcRoof);

  // Find existing business user(s)
  const users = await prisma.businessUser.findMany({
    where: { status: 'approved' }
  });

  console.log(`Found ${users.length} approved users`);

  // Link users to tenants
  for (const user of users) {
    // Link to budroofing
    await prisma.userTenant.upsert({
      where: {
        userId_tenantId: {
          userId: user.id,
          tenantId: budRoofing.id
        }
      },
      update: {},
      create: {
        userId: user.id,
        tenantId: budRoofing.id,
        role: 'admin'
      }
    });

    // Link to kcroof
    await prisma.userTenant.upsert({
      where: {
        userId_tenantId: {
          userId: user.id,
          tenantId: kcRoof.id
        }
      },
      update: {},
      create: {
        userId: user.id,
        tenantId: kcRoof.id,
        role: 'admin'
      }
    });

    console.log(`Linked user ${user.email} to both tenants`);
  }

  console.log('Done!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
