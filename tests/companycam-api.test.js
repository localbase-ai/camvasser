import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  fetchProjectLabels,
  fetchProjectWithLabels,
  fetchAllCompanyLabels,
  formatLabels
} from '../netlify/functions/lib/companycam-api.js';

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('CompanyCam API', () => {
  const mockApiToken = 'test-token-123';
  const mockProjectId = 'project-123';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('fetchProjectLabels', () => {
    it('should fetch labels for a project', async () => {
      const mockLabels = [
        {
          id: '1',
          company_id: '999',
          display_value: 'Door Hanger',
          value: 'door hanger',
          tag_type: 'project',
          created_at: 1234567890,
          updated_at: 1234567890
        }
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockLabels
      });

      const result = await fetchProjectLabels(mockProjectId, mockApiToken);

      expect(mockFetch).toHaveBeenCalledWith(
        `https://api.companycam.com/v2/projects/${mockProjectId}/labels`,
        expect.objectContaining({
          headers: {
            'Authorization': `Bearer ${mockApiToken}`,
            'Accept': 'application/json'
          }
        })
      );
      expect(result).toEqual(mockLabels);
    });

    it('should return empty array on 404', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404
      });

      const result = await fetchProjectLabels(mockProjectId, mockApiToken);

      expect(result).toEqual([]);
    });

    it('should throw error on other errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500
      });

      await expect(
        fetchProjectLabels(mockProjectId, mockApiToken)
      ).rejects.toThrow('HTTP 500');
    });
  });

  describe('fetchProjectWithLabels', () => {
    it('should fetch project with labels', async () => {
      const mockProject = {
        id: mockProjectId,
        name: 'Test Project',
        address: {
          street_address_1: '123 Main St'
        }
      };

      const mockLabels = [
        {
          id: '1',
          display_value: 'Completed',
          value: 'completed',
          tag_type: 'project'
        }
      ];

      // Mock project fetch
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockProject
      });
      // Mock labels fetch
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockLabels
      });

      const result = await fetchProjectWithLabels(mockProjectId, mockApiToken);

      expect(result).toEqual({
        ...mockProject,
        labels: mockLabels
      });
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('fetchAllCompanyLabels', () => {
    it('should fetch all company labels', async () => {
      const mockLabels = [
        { id: '1', display_value: 'Label 1', value: 'label-1' },
        { id: '2', display_value: 'Label 2', value: 'label-2' }
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockLabels
      });

      const result = await fetchAllCompanyLabels(mockApiToken);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.companycam.com/v2/tags',
        expect.objectContaining({
          headers: {
            'Authorization': `Bearer ${mockApiToken}`,
            'Accept': 'application/json'
          }
        })
      );
      expect(result).toEqual(mockLabels);
    });
  });

  describe('formatLabels', () => {
    it('should format labels correctly', () => {
      const rawLabels = [
        {
          id: '1',
          display_value: 'Door Hanger',
          value: 'door hanger',
          tag_type: 'project',
          created_at: 1234567890,
          updated_at: 1234567890
        },
        {
          id: '2',
          display_value: 'Completed',
          value: 'completed',
          tag_type: 'project',
          created_at: 1234567891
        }
      ];

      const result = formatLabels(rawLabels);

      expect(result).toEqual([
        {
          id: '1',
          displayValue: 'Door Hanger',
          value: 'door hanger',
          tagType: 'project',
          createdAt: 1234567890
        },
        {
          id: '2',
          displayValue: 'Completed',
          value: 'completed',
          tagType: 'project',
          createdAt: 1234567891
        }
      ]);
    });

    it('should handle empty array', () => {
      const result = formatLabels([]);
      expect(result).toEqual([]);
    });
  });
});
