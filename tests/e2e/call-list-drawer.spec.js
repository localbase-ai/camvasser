import { test, expect } from '@playwright/test';

/**
 * Call List Drawer E2E Tests
 *
 * Mocks all API endpoints to test UI behavior in isolation.
 */

// Mock all API endpoints the app might call
async function setupAllMocks(page) {
  // Catch-all for any netlify function - return empty success by default
  await page.route('**/.netlify/functions/**', route => {
    const url = route.request().url();

    // User tenants - required for auth
    if (url.includes('get-user-tenants')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          tenants: [{ slug: 'test-tenant', name: 'Test Tenant', role: 'admin' }],
          defaultTenant: 'test-tenant'
        })
      });
    }

    // Call lists
    if (url.includes('get-call-lists')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          callLists: [
            { id: 'list-1', name: 'Test Call List', _count: { CallListItem: 5 }, assignedUsers: [] },
            { id: 'list-2', name: 'Another List', _count: { CallListItem: 10 }, assignedUsers: [] }
          ]
        })
      });
    }

    // Call list items
    if (url.includes('get-call-list-items')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: [] })
      });
    }

    // Leads
    if (url.includes('get-leads')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ leads: [] })
      });
    }

    // Organizations
    if (url.includes('get-organizations')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ organizations: [] })
      });
    }

    // Projects
    if (url.includes('get-projects')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ projects: [] })
      });
    }

    // Prospects/Contacts
    if (url.includes('get-prospects')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ prospects: [] })
      });
    }

    // Tags
    if (url.includes('get-tags')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ tags: [] })
      });
    }

    // Proposals
    if (url.includes('get-proposals')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ proposals: [] })
      });
    }

    // Appointments
    if (url.includes('get-appointments')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ appointments: [] })
      });
    }

    // Notes
    if (url.includes('notes')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ notes: [] })
      });
    }

    // Default: return empty success for any other endpoint
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({})
    });
  });
}

test.describe('Call List Drawer', () => {
  test.beforeEach(async ({ page }) => {
    // Set up localStorage (runs before page JS executes)
    await page.addInitScript(() => {
      localStorage.setItem('authToken', 'test-token');
      localStorage.setItem('user', JSON.stringify({ userId: 'test-user', email: 'test@test.com' }));
      localStorage.setItem('currentTenant', 'test-tenant');
      localStorage.setItem('selectedTenant', 'test-tenant');
      localStorage.setItem('lastView', 'calls');
      localStorage.setItem('userTenants', JSON.stringify([
        { slug: 'test-tenant', name: 'Test Tenant', role: 'admin' }
      ]));
    });

    // Set up all API mocks
    await setupAllMocks(page);

    // Navigate to the app
    await page.goto('/admin.html');

    // Wait for drawer element to exist
    await page.waitForSelector('#callListDrawer', { state: 'attached', timeout: 15000 });
  });

  test('drawer should be hidden by default', async ({ page }) => {
    const drawer = page.locator('#callListDrawer');
    const transform = await drawer.evaluate(el => el.style.transform);
    expect(transform).toBe('translateX(-100%)');
  });

  test('clicking list selector should open drawer', async ({ page }) => {
    await page.click('button:has-text("Select a list")');
    await page.waitForTimeout(300);

    const drawer = page.locator('#callListDrawer');
    const transform = await drawer.evaluate(el => el.style.transform);
    expect(transform).toBe('translateX(0px)');
  });

  test('clicking close button should close drawer', async ({ page }) => {
    await page.click('button:has-text("Select a list")');
    await page.waitForTimeout(300);

    await page.click('#closeDrawerBtn');
    await page.waitForTimeout(300);

    const drawer = page.locator('#callListDrawer');
    const transform = await drawer.evaluate(el => el.style.transform);
    expect(transform).toBe('translateX(-100%)');
  });

  test('clicking backdrop should close drawer', async ({ page }) => {
    await page.click('button:has-text("Select a list")');
    await page.waitForTimeout(300);

    await page.click('#callListDrawerBackdrop');
    await page.waitForTimeout(300);

    const drawer = page.locator('#callListDrawer');
    const transform = await drawer.evaluate(el => el.style.transform);
    expect(transform).toBe('translateX(-100%)');
  });

  test('drawer should show call lists', async ({ page }) => {
    await page.click('button:has-text("Select a list")');
    await page.waitForTimeout(300);

    await expect(page.locator('text=Test Call List')).toBeVisible();
    await expect(page.locator('text=Another List')).toBeVisible();
  });

  test('selecting a list should close drawer and update header', async ({ page }) => {
    await page.click('button:has-text("Select a list")');
    await page.waitForTimeout(300);

    await page.click('text=Test Call List');
    await page.waitForTimeout(300);

    // Drawer should be closed
    const drawer = page.locator('#callListDrawer');
    const transform = await drawer.evaluate(el => el.style.transform);
    expect(transform).toBe('translateX(-100%)');

    // Header should show selected list name
    await expect(page.locator('#currentListName')).toContainText('Test Call List');
  });
});

// Basic smoke tests that don't require auth
test.describe('Public Pages', () => {
  test('login page should load', async ({ page }) => {
    await page.goto('/login.html');
    await expect(page.locator('body')).toBeVisible();
    await expect(page.locator('input[type="email"], input[type="text"]')).toBeVisible();
  });

  test('unauthenticated access to admin redirects to login', async ({ page }) => {
    await page.goto('/admin.html');
    await page.waitForURL('**/login.html', { timeout: 5000 });
    expect(page.url()).toContain('login.html');
  });
});
