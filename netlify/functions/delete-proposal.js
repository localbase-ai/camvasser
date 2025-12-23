import { verifyToken } from './lib/auth.js';
import Database from 'better-sqlite3';
import path from 'path';

// Path to roofr_proposals.db - relative to user's Work directory
const PROPOSALS_DB_PATH = process.env.PROPOSALS_DB_PATH ||
  path.join(process.env.HOME || '/Users/ryanriggin', 'Work/renu/data/roofr/roofr_proposals.db');

export async function handler(event) {
  // Only allow DELETE
  if (event.httpMethod !== 'DELETE') {
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
    const { id } = event.queryStringParameters || {};

    if (!id) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'proposal id parameter required' })
      };
    }

    // Open SQLite database (writable)
    const db = new Database(PROPOSALS_DB_PATH);

    // Delete the proposal
    const stmt = db.prepare('DELETE FROM proposals WHERE proposal_id = ?');
    const result = stmt.run(id);

    db.close();

    if (result.changes === 0) {
      return {
        statusCode: 404,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Proposal not found' })
      };
    }

    console.log(`Deleted proposal: ${id}`);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        deleted: id
      })
    };

  } catch (error) {
    console.error('Error deleting proposal:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'Failed to delete proposal',
        details: error.message
      })
    };
  }
}
