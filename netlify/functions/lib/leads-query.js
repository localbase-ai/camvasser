/**
 * Builds a Prisma where clause for leads queries
 * Extracted for testability
 */

// Map field names to database columns
const fieldMap = {
  email: 'email',
  phone: 'phone',
  name: 'firstName', // Will check both firstName and lastName
  firstname: 'firstName',
  lastname: 'lastName',
  address: 'address'
};

/**
 * Parse special field queries from search string
 * Supports: no:field, has:field, field:empty
 * @param {string} search - The raw search string
 * @returns {{ searchText: string, fieldFilters: Array<{field: string, isEmpty: boolean}> }}
 */
export function parseFieldQueries(search) {
  let searchText = (search || '').trim();
  const fieldFilters = [];

  const fieldQueryPattern = /(no:\w+|has:\w+|\w+:empty)/gi;
  searchText = searchText.replace(fieldQueryPattern, (match) => {
    const lower = match.trim().toLowerCase();
    if (lower.startsWith('no:')) {
      const field = lower.substring(3);
      fieldFilters.push({ field, isEmpty: true });
    } else if (lower.startsWith('has:')) {
      const field = lower.substring(4);
      fieldFilters.push({ field, isEmpty: false });
    } else if (lower.endsWith(':empty')) {
      const field = lower.replace(':empty', '');
      fieldFilters.push({ field, isEmpty: true });
    }
    return '';
  }).trim();

  return { searchText, fieldFilters };
}

/**
 * Build Prisma where clause for leads query
 * @param {Object} options
 * @param {string} [options.tenant] - Tenant slug to filter by
 * @param {string} [options.search] - Search text (may include field queries)
 * @param {string} [options.status] - Status to filter by
 * @param {string} [options.owner] - Owner name to filter by
 * @returns {Object} Prisma where clause
 */
export function buildLeadsWhereClause({ tenant, search, status, owner }) {
  const where = tenant ? { tenant } : {};

  // Parse field queries from search
  const { searchText, fieldFilters } = parseFieldQueries(search);

  // Apply field filters to where clause
  for (const filter of fieldFilters) {
    const dbField = fieldMap[filter.field];
    if (!dbField) continue;

    if (filter.field === 'name') {
      if (filter.isEmpty) {
        // no:name - both firstName AND lastName are empty
        where.AND = where.AND || [];
        where.AND.push({ firstName: '' });
        where.AND.push({ lastName: '' });
      } else {
        // has:name - at least one of firstName or lastName is not empty
        where.AND = where.AND || [];
        where.AND.push({
          OR: [
            { firstName: { not: '' } },
            { lastName: { not: '' } }
          ]
        });
      }
    } else {
      if (filter.isEmpty) {
        // no:field - field is null OR empty string
        where.AND = where.AND || [];
        where.AND.push({
          OR: [
            { [dbField]: null },
            { [dbField]: '' }
          ]
        });
      } else {
        // has:field - field is not null AND not empty
        where.AND = where.AND || [];
        where.AND.push({ [dbField]: { not: null } });
        where.AND.push({ [dbField]: { not: '' } });
      }
    }
  }

  // Apply status filter (supports comma-separated multiple statuses)
  if (status) {
    const statuses = status.split(',').map(s => s.trim()).filter(Boolean);
    if (statuses.length === 1) {
      where.status = statuses[0];
    } else if (statuses.length > 1) {
      where.status = { in: statuses };
    }
  }

  // Apply owner filter
  if (owner) {
    where.ownerName = owner;
  }

  // Apply text search
  if (searchText) {
    const words = searchText.split(/\s+/).filter(Boolean);

    if (words.length >= 2) {
      // Multi-word search: try to match as firstName + lastName
      // "ryan w" should match firstName contains "ryan" AND lastName contains "w"
      const firstWord = words[0];
      const restWords = words.slice(1).join(' ');

      where.OR = [
        // Match as firstName + lastName (most common case)
        {
          AND: [
            { firstName: { contains: firstWord, mode: 'insensitive' } },
            { lastName: { contains: restWords, mode: 'insensitive' } }
          ]
        },
        // Also try lastName + firstName (reversed order)
        {
          AND: [
            { lastName: { contains: firstWord, mode: 'insensitive' } },
            { firstName: { contains: restWords, mode: 'insensitive' } }
          ]
        },
        // Still allow full phrase match on other fields
        { email: { contains: searchText, mode: 'insensitive' } },
        { phone: { contains: searchText, mode: 'insensitive' } },
        { address: { contains: searchText, mode: 'insensitive' } }
      ];
    } else {
      // Single word search: check all fields
      where.OR = [
        { firstName: { contains: searchText, mode: 'insensitive' } },
        { lastName: { contains: searchText, mode: 'insensitive' } },
        { email: { contains: searchText, mode: 'insensitive' } },
        { phone: { contains: searchText, mode: 'insensitive' } },
        { address: { contains: searchText, mode: 'insensitive' } }
      ];
    }
  }

  return where;
}
