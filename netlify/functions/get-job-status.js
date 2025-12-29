import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function handler(event) {
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const { id, type, tenant } = event.queryStringParameters || {};

    // If specific job ID provided
    if (id) {
      const job = await prisma.backgroundJob.findUnique({
        where: { id }
      });

      if (!job) {
        return {
          statusCode: 404,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'Job not found' })
        };
      }

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(job)
      };
    }

    // List recent jobs for type/tenant
    const where = {};
    if (type) where.type = type;
    if (tenant) where.tenant = tenant;

    const jobs = await prisma.backgroundJob.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 10
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobs })
    };

  } catch (error) {
    console.error('Error fetching job status:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: error.message })
    };
  } finally {
    await prisma.$disconnect();
  }
}
