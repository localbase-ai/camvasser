import { verifyToken } from './lib/auth.js';
import Database from 'better-sqlite3';
import path from 'path';

// Path to roofr_proposals.db - relative to user's Work directory
const PROPOSALS_DB_PATH = process.env.PROPOSALS_DB_PATH ||
  path.join(process.env.HOME || '/Users/ryanriggin', 'Work/renu/data/roofr/roofr_proposals.db');

export async function handler(event) {
  // Only allow GET
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  // Verify authentication
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
    const { email, name, all } = event.queryStringParameters || {};

    // Open SQLite database
    const db = new Database(PROPOSALS_DB_PATH, { readonly: true });

    let proposals = [];

    // If 'all' param is set, fetch all proposals
    if (all === 'true') {
      const stmt = db.prepare(`
        SELECT
          proposal_id,
          customer_name,
          customer_email,
          proposal_amount,
          sent_date,
          signed_date,
          status
        FROM proposals
        ORDER BY sent_date DESC
      `);
      proposals = stmt.all();
    } else if (!email && !name) {
      db.close();
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'email, name, or all=true parameter required' })
      };
    } else {
      // Try email match first (more reliable)
      if (email) {
        const stmt = db.prepare(`
          SELECT
            proposal_id,
            customer_name,
            customer_email,
            proposal_amount,
            sent_date,
            signed_date,
            status
          FROM proposals
          WHERE LOWER(customer_email) = LOWER(?)
          ORDER BY sent_date DESC
        `);
        proposals = stmt.all(email);
      }

      // If no email matches and name provided, try name match
      if (proposals.length === 0 && name) {
        const stmt = db.prepare(`
          SELECT
            proposal_id,
            customer_name,
            customer_email,
            proposal_amount,
            sent_date,
            signed_date,
            status
          FROM proposals
          WHERE LOWER(customer_name) LIKE LOWER(?)
          ORDER BY sent_date DESC
        `);
        proposals = stmt.all(`%${name}%`);
      }
    }

    db.close();

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        count: proposals.length,
        proposals
      })
    };

  } catch (error) {
    console.error('Error fetching proposals:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'Failed to fetch proposals',
        details: error.message
      })
    };
  }
}
