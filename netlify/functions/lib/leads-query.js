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

  // Apply status filter
  if (status) {
    where.status = status;
  }

  // Apply owner filter
  if (owner) {
    where.ownerName = owner;
  }

  // Apply text search
  if (searchText) {
    where.OR = [
      { firstName: { contains: searchText, mode: 'insensitive' } },
      { lastName: { contains: searchText, mode: 'insensitive' } },
      { email: { contains: searchText, mode: 'insensitive' } },
      { phone: { contains: searchText, mode: 'insensitive' } },
      { address: { contains: searchText, mode: 'insensitive' } }
    ];
  }

  return where;
}
