import { describe, it, expect } from 'vitest';

// Unit tests for map filtering logic (extracted from admin.html)

describe('Map Lead Status Filter', () => {
  // Sample leads data
  const sampleLeads = [
    { id: '1', firstName: 'John', lastName: 'Doe', status: 'new', coordinates: { lat: 39.1, lon: -94.5 } },
    { id: '2', firstName: 'Jane', lastName: 'Smith', status: 'completed', coordinates: { lat: 39.2, lon: -94.6 } },
    { id: '3', firstName: 'Bob', lastName: 'Jones', status: 'completed', coordinates: { lat: 39.3, lon: -94.7 } },
    { id: '4', firstName: 'Alice', lastName: 'Brown', status: 'lost', coordinates: { lat: 39.4, lon: -94.8 } },
    { id: '5', firstName: 'Charlie', lastName: 'Wilson', status: 'new', coordinates: { lat: 39.5, lon: -94.9 } },
    { id: '6', firstName: 'No Coords', lastName: 'Person', status: 'completed', coordinates: null },
  ];

  // Filter function matching admin.html implementation
  function filterLeadsByStatus(leads, selectedStatus) {
    return leads.filter(lead => {
      if (selectedStatus && lead.status !== selectedStatus) return false;
      return true;
    });
  }

  describe('filterLeadsByStatus', () => {
    it('should return all leads when no status is selected', () => {
      const result = filterLeadsByStatus(sampleLeads, '');
      expect(result).toHaveLength(6);
    });

    it('should return all leads when status is null', () => {
      const result = filterLeadsByStatus(sampleLeads, null);
      expect(result).toHaveLength(6);
    });

    it('should filter leads by completed status', () => {
      const result = filterLeadsByStatus(sampleLeads, 'completed');
      expect(result).toHaveLength(3);
      expect(result.every(l => l.status === 'completed')).toBe(true);
    });

    it('should filter leads by new status', () => {
      const result = filterLeadsByStatus(sampleLeads, 'new');
      expect(result).toHaveLength(2);
      expect(result.every(l => l.status === 'new')).toBe(true);
    });

    it('should filter leads by lost status', () => {
      const result = filterLeadsByStatus(sampleLeads, 'lost');
      expect(result).toHaveLength(1);
      expect(result[0].firstName).toBe('Alice');
    });

    it('should return empty array when no leads match status', () => {
      const result = filterLeadsByStatus(sampleLeads, 'nonexistent_status');
      expect(result).toHaveLength(0);
    });
  });

  describe('Status count extraction', () => {
    // Function matching admin.html implementation for extracting status counts
    function extractStatusCounts(leads) {
      const statusCounts = {};
      leads.forEach(lead => {
        if (lead.status) {
          statusCounts[lead.status] = (statusCounts[lead.status] || 0) + 1;
        }
      });
      return statusCounts;
    }

    it('should count leads by status', () => {
      const counts = extractStatusCounts(sampleLeads);
      expect(counts.new).toBe(2);
      expect(counts.completed).toBe(3);
      expect(counts.lost).toBe(1);
    });

    it('should handle empty leads array', () => {
      const counts = extractStatusCounts([]);
      expect(Object.keys(counts)).toHaveLength(0);
    });

    it('should ignore leads without status', () => {
      const leadsWithNull = [
        { id: '1', status: 'new' },
        { id: '2', status: null },
        { id: '3', status: undefined },
        { id: '4', status: 'new' },
      ];
      const counts = extractStatusCounts(leadsWithNull);
      expect(counts.new).toBe(2);
      expect(Object.keys(counts)).toHaveLength(1);
    });
  });

  describe('Status sorting (preferred order)', () => {
    const preferredOrder = ['new', 'contacted', 'appointment_scheduled', 'insurance_claim', 'proposal_sent', 'follow_up', 'proposal_signed', 'job_scheduled', 'on_hold', 'completed', 'lost', 'killed', 'unqualified'];

    function sortStatuses(statuses) {
      return statuses.sort((a, b) => {
        const aIdx = preferredOrder.indexOf(a);
        const bIdx = preferredOrder.indexOf(b);
        if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
        if (aIdx !== -1) return -1;
        if (bIdx !== -1) return 1;
        return a.localeCompare(b);
      });
    }

    it('should sort statuses in preferred order', () => {
      const statuses = ['completed', 'new', 'lost'];
      const sorted = sortStatuses([...statuses]);
      expect(sorted).toEqual(['new', 'completed', 'lost']);
    });

    it('should put unknown statuses at the end alphabetically', () => {
      const statuses = ['new', 'custom_status', 'completed'];
      const sorted = sortStatuses([...statuses]);
      expect(sorted).toEqual(['new', 'completed', 'custom_status']);
    });

    it('should sort multiple unknown statuses alphabetically', () => {
      const statuses = ['zebra', 'alpha', 'new'];
      const sorted = sortStatuses([...statuses]);
      expect(sorted).toEqual(['new', 'alpha', 'zebra']);
    });
  });
});
