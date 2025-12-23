import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const appointments = await prisma.appointment.findMany({
  orderBy: { createdAt: 'desc' },
  take: 5
});

console.log('Appointments found:', appointments.length);
console.log(JSON.stringify(appointments, null, 2));

await prisma.$disconnect();
