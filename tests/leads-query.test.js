import { describe, it, expect } from 'vitest';
import { parseFieldQueries, buildLeadsWhereClause } from '../netlify/functions/lib/leads-query.js';

describe('leads-query', () => {
  describe('parseFieldQueries', () => {
    it('should parse no:field syntax', () => {
      const result = parseFieldQueries('no:email');
      expect(result.searchText).toBe('');
      expect(result.fieldFilters).toEqual([{ field: 'email', isEmpty: true }]);
    });

    it('should parse has:field syntax', () => {
      const result = parseFieldQueries('has:phone');
      expect(result.searchText).toBe('');
      expect(result.fieldFilters).toEqual([{ field: 'phone', isEmpty: false }]);
    });

    it('should parse field:empty syntax', () => {
      const result = parseFieldQueries('email:empty');
      expect(result.searchText).toBe('');
      expect(result.fieldFilters).toEqual([{ field: 'email', isEmpty: true }]);
    });

    it('should extract field queries and preserve search text', () => {
      const result = parseFieldQueries('john no:email has:phone');
      expect(result.searchText).toBe('john');
      expect(result.fieldFilters).toHaveLength(2);
      expect(result.fieldFilters).toContainEqual({ field: 'email', isEmpty: true });
      expect(result.fieldFilters).toContainEqual({ field: 'phone', isEmpty: false });
    });

    it('should handle empty search', () => {
      const result = parseFieldQueries('');
      expect(result.searchText).toBe('');
      expect(result.fieldFilters).toEqual([]);
    });

    it('should handle null/undefined search', () => {
      expect(parseFieldQueries(null).searchText).toBe('');
      expect(parseFieldQueries(undefined).searchText).toBe('');
    });
  });

  describe('buildLeadsWhereClause', () => {
    describe('tenant filter', () => {
      it('should filter by tenant when provided', () => {
        const where = buildLeadsWhereClause({ tenant: 'acme' });
        expect(where.tenant).toBe('acme');
      });

      it('should not include tenant when not provided', () => {
        const where = buildLeadsWhereClause({});
        expect(where.tenant).toBeUndefined();
      });
    });

    describe('status filter', () => {
      it('should filter by status when provided', () => {
        const where = buildLeadsWhereClause({ status: 'new' });
        expect(where.status).toBe('new');
      });

      it('should not include status when not provided', () => {
        const where = buildLeadsWhereClause({});
        expect(where.status).toBeUndefined();
      });

      it('should combine status with tenant', () => {
        const where = buildLeadsWhereClause({ tenant: 'acme', status: 'contacted' });
        expect(where.tenant).toBe('acme');
        expect(where.status).toBe('contacted');
      });

      it('should combine status with search', () => {
        const where = buildLeadsWhereClause({ status: 'new', search: 'john' });
        expect(where.status).toBe('new');
        expect(where.OR).toBeDefined();
        expect(where.OR.some(c => c.firstName?.contains === 'john')).toBe(true);
      });
    });

    describe('text search', () => {
      it('should create OR conditions for text search', () => {
        const where = buildLeadsWhereClause({ search: 'john' });
        expect(where.OR).toBeDefined();
        expect(where.OR).toHaveLength(5);
        expect(where.OR).toContainEqual({ firstName: { contains: 'john', mode: 'insensitive' } });
        expect(where.OR).toContainEqual({ lastName: { contains: 'john', mode: 'insensitive' } });
        expect(where.OR).toContainEqual({ email: { contains: 'john', mode: 'insensitive' } });
        expect(where.OR).toContainEqual({ phone: { contains: 'john', mode: 'insensitive' } });
        expect(where.OR).toContainEqual({ address: { contains: 'john', mode: 'insensitive' } });
      });

      it('should not include OR when search is empty', () => {
        const where = buildLeadsWhereClause({ search: '' });
        expect(where.OR).toBeUndefined();
      });
    });

    describe('field filters', () => {
      it('should handle no:email filter', () => {
        const where = buildLeadsWhereClause({ search: 'no:email' });
        expect(where.AND).toBeDefined();
        expect(where.AND).toContainEqual({
          OR: [{ email: null }, { email: '' }]
        });
      });

      it('should handle has:email filter', () => {
        const where = buildLeadsWhereClause({ search: 'has:email' });
        expect(where.AND).toBeDefined();
        expect(where.AND).toContainEqual({ email: { not: null } });
        expect(where.AND).toContainEqual({ email: { not: '' } });
      });

      it('should handle no:name filter (checks both firstName and lastName)', () => {
        const where = buildLeadsWhereClause({ search: 'no:name' });
        expect(where.AND).toBeDefined();
        expect(where.AND).toContainEqual({ firstName: '' });
        expect(where.AND).toContainEqual({ lastName: '' });
      });

      it('should handle has:name filter', () => {
        const where = buildLeadsWhereClause({ search: 'has:name' });
        expect(where.AND).toBeDefined();
        expect(where.AND).toContainEqual({
          OR: [{ firstName: { not: '' } }, { lastName: { not: '' } }]
        });
      });

      it('should ignore unknown field filters', () => {
        const where = buildLeadsWhereClause({ search: 'no:unknownfield' });
        expect(where.AND).toBeUndefined();
      });

      it('should combine field filters with text search', () => {
        const where = buildLeadsWhereClause({ search: 'john no:email' });
        expect(where.AND).toBeDefined();
        expect(where.OR).toBeDefined();
        expect(where.OR.some(c => c.firstName?.contains === 'john')).toBe(true);
      });
    });

    describe('combined filters', () => {
      it('should combine tenant, status, search, and field filters', () => {
        const where = buildLeadsWhereClause({
          tenant: 'acme',
          status: 'new',
          search: 'john no:email'
        });

        expect(where.tenant).toBe('acme');
        expect(where.status).toBe('new');
        expect(where.AND).toContainEqual({
          OR: [{ email: null }, { email: '' }]
        });
        expect(where.OR.some(c => c.firstName?.contains === 'john')).toBe(true);
      });
    });
  });
});
