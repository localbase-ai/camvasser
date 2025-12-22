import { PrismaClient } from '@prisma/client';
import { verifyToken } from './lib/auth.js';

const prisma = new PrismaClient();

export async function handler(event) {
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  const authHeader = event.headers.authorization || event.headers.Authorization;
  const user = verifyToken(authHeader);

  if (!user) {
    return {
      statusCode: 401,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Unauthorized - Please log in' })
    };
  }

  try {
    const { type, days } = event.queryStringParameters || {};
    const numDays = days ? parseInt(days) : 30;

    // Calculate start date
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - numDays);
    startDate.setHours(0, 0, 0, 0);

    let data = [];
    let total = 0;

    if (type === 'leads') {
      // Get leads by day
      const where = user.slug ? { tenant: user.slug } : {};

      const leads = await prisma.lead.findMany({
        where: {
          ...where,
          createdAt: { gte: startDate }
        },
        select: { createdAt: true }
      });

      total = await prisma.lead.count({ where });

      // Group by day
      const dayCounts = {};
      leads.forEach(lead => {
        const day = lead.createdAt.toISOString().split('T')[0];
        dayCounts[day] = (dayCounts[day] || 0) + 1;
      });

      // Build array for all days
      for (let i = numDays - 1; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dayStr = date.toISOString().split('T')[0];
        data.push({
          date: dayStr,
          label: `${date.getMonth() + 1}/${date.getDate()}`,
          count: dayCounts[dayStr] || 0
        });
      }

    } else if (type === 'projects') {
      // Get projects by day (using ccCreatedAt from CompanyCam)
      const projects = await prisma.project.findMany({
        where: {
          ccCreatedAt: { gte: startDate }
        },
        select: { ccCreatedAt: true }
      });

      total = await prisma.project.count();

      // Count projects with prospects
      const withProspects = await prisma.project.count({
        where: { prospects: { some: {} } }
      });

      // Count projects created this week
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - 7);
      weekStart.setHours(0, 0, 0, 0);
      const thisWeek = await prisma.project.count({
        where: { ccCreatedAt: { gte: weekStart } }
      });

      // Group by day
      const dayCounts = {};
      projects.forEach(project => {
        if (project.ccCreatedAt) {
          const day = project.ccCreatedAt.toISOString().split('T')[0];
          dayCounts[day] = (dayCounts[day] || 0) + 1;
        }
      });

      // Build array for all days
      for (let i = numDays - 1; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dayStr = date.toISOString().split('T')[0];
        data.push({
          date: dayStr,
          label: `${date.getMonth() + 1}/${date.getDate()}`,
          count: dayCounts[dayStr] || 0
        });
      }

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, total, withProspects, thisWeek, days: numDays, data })
      };

    } else if (type === 'prospects') {
      // Get prospects by day
      const where = user.slug ? { tenant: user.slug } : {};

      const prospects = await prisma.prospect.findMany({
        where: {
          ...where,
          createdAt: { gte: startDate }
        },
        select: { createdAt: true }
      });

      total = await prisma.prospect.count({ where });
      const homeowners = await prisma.prospect.count({
        where: { ...where, isHomeowner: true }
      });

      // Group by day
      const dayCounts = {};
      prospects.forEach(prospect => {
        const day = prospect.createdAt.toISOString().split('T')[0];
        dayCounts[day] = (dayCounts[day] || 0) + 1;
      });

      // Build array for all days
      for (let i = numDays - 1; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dayStr = date.toISOString().split('T')[0];
        data.push({
          date: dayStr,
          label: `${date.getMonth() + 1}/${date.getDate()}`,
          count: dayCounts[dayStr] || 0
        });
      }

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, total, homeowners, days: numDays, data })
      };
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, total, days: numDays, data })
    };

  } catch (error) {
    console.error('Error fetching stats:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'Failed to fetch stats',
        details: error.message
      })
    };
  }
}
