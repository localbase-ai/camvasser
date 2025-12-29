import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const imported = await prisma.lead.findMany({
    where: { status: 'imported' }
  });

  let toCompleted = 0;
  let toNew = 0;

  for (const lead of imported) {
    const flowData = lead.flowData || {};
    const hasServices = flowData.services_received && flowData.services_received.trim() !== '';
    const newStatus = hasServices ? 'completed' : 'new';

    await prisma.lead.update({
      where: { id: lead.id },
      data: { status: newStatus }
    });

    if (hasServices) toCompleted++;
    else toNew++;
  }

  console.log(`Updated ${imported.length} leads`);
  console.log(`  -> completed (past customer): ${toCompleted}`);
  console.log(`  -> new (prospect): ${toNew}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
