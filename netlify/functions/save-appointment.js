import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function handler(event) {
  // Only allow POST
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const data = JSON.parse(event.body);

    const {
      leadId,
      tenant,
      googleEventId,
      summary,
      startTime,
      endTime,
      durationMinutes,
      location,
      notes,
      eventType,
      createdById,
      createdByName
    } = data;

    // Validate required fields
    if (!tenant || !summary || !startTime || !endTime) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: 'Missing required fields',
          required: ['tenant', 'summary', 'startTime', 'endTime']
        })
      };
    }

    // Save to database
    const appointment = await prisma.appointment.create({
      data: {
        leadId: leadId || null,
        tenant,
        googleEventId: googleEventId || null,
        summary,
        startTime: new Date(startTime),
        endTime: new Date(endTime),
        durationMinutes: durationMinutes || 60,
        location: location || null,
        notes: notes || null,
        status: 'scheduled',
        eventType: eventType || 'sales',
        createdById: createdById || null,
        createdByName: createdByName || null,
        updatedAt: new Date()
      }
    });

    console.log('Appointment saved:', appointment.id);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        appointmentId: appointment.id
      })
    };

  } catch (error) {
    console.error('Error saving appointment:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'Failed to save appointment',
        details: error.message
      })
    };
  }
}
