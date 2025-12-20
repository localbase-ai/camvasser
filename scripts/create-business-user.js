import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const businessUser = await prisma.businessUser.create({
    data: {
      name: 'Ryan Riggin',
      email: 'ryan@budroofing.com',
      phone: '913-593-1084',
      companyName: 'Bud Roofing',
      domain: 'budroofing.com',
      slug: 'budroofing',
      status: 'approved',
      approvedAt: new Date()
    }
  });

  console.log('✅ Business user created:', businessUser);
}

main()
  .catch((e) => {
    console.error('❌ Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
