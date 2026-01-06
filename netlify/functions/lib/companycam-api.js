/**
 * Fetch labels for a specific CompanyCam project
 * @param {string} projectId - The CompanyCam project ID
 * @param {string} apiToken - The CompanyCam API token
 * @returns {Promise<Array>} Array of label objects
 */
export async function fetchProjectLabels(projectId, apiToken) {
  try {
    const response = await fetch(
      `https://api.companycam.com/v2/projects/${projectId}/labels`,
      {
        headers: {
          'Authorization': `Bearer ${apiToken}`,
          'Accept': 'application/json'
        }
      }
    );

    // 404 means no labels exist for this project
    if (response.status === 404) {
      return [];
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return await response.json() || [];
  } catch (error) {
    console.error(`Error fetching labels for project ${projectId}:`, error.message);
    throw error;
  }
}

/**
 * Fetch a project with its labels
 * @param {string} projectId - The CompanyCam project ID
 * @param {string} apiToken - The CompanyCam API token
 * @returns {Promise<Object>} Project object with labels array
 */
export async function fetchProjectWithLabels(projectId, apiToken) {
  try {
    const projectResponse = await fetch(
      `https://api.companycam.com/v2/projects/${projectId}`,
      {
        headers: {
          'Authorization': `Bearer ${apiToken}`,
          'Accept': 'application/json'
        }
      }
    );

    if (!projectResponse.ok) {
      throw new Error(`HTTP ${projectResponse.status}`);
    }

    const project = await projectResponse.json();
    const labels = await fetchProjectLabels(projectId, apiToken);

    return {
      ...project,
      labels
    };
  } catch (error) {
    console.error(`Error fetching project ${projectId}:`, error.message);
    throw error;
  }
}

/**
 * Fetch all labels for a company (across all projects)
 * @param {string} apiToken - The CompanyCam API token
 * @returns {Promise<Array>} Array of all unique labels
 */
export async function fetchAllCompanyLabels(apiToken) {
  try {
    const response = await fetch(
      'https://api.companycam.com/v2/tags',
      {
        headers: {
          'Authorization': `Bearer ${apiToken}`,
          'Accept': 'application/json'
        }
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return await response.json() || [];
  } catch (error) {
    console.error('Error fetching company labels:', error.message);
    throw error;
  }
}

/**
 * Format labels for storage/display
 * @param {Array} labels - Raw label objects from API
 * @returns {Array} Simplified label objects
 */
export function formatLabels(labels) {
  return labels.map(label => ({
    id: label.id,
    displayValue: label.display_value,
    value: label.value,
    tagType: label.tag_type,
    createdAt: label.created_at
  }));
}
