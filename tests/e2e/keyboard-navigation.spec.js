import { test, expect } from '@playwright/test';

/**
 * Keyboard Navigation E2E Tests
 *
 * Tests for up/down arrow navigation, Enter to open detail pane,
 * Escape to close detail pane, and row selection highlighting.
 */

// Mock all API endpoints
async function setupAllMocks(page) {
  await page.route('**/.netlify/functions/**', route => {
    const url = route.request().url();

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

    if (url.includes('get-call-lists')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          callLists: [
            { id: 'list-1', name: 'Test Call List', _count: { CallListItem: 3 }, assignedUsers: [] }
          ]
        })
      });
    }

    if (url.includes('get-call-list-items')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [
            {
              id: 'item-1',
              lead: {
                id: 'lead-1',
                firstName: 'John',
                lastName: 'Doe',
                phone: '555-0001',
                status: 'new'
              }
            },
            {
              id: 'item-2',
              lead: {
                id: 'lead-2',
                firstName: 'Jane',
                lastName: 'Smith',
                phone: '555-0002',
                status: 'contacted'
              }
            },
            {
              id: 'item-3',
              lead: {
                id: 'lead-3',
                firstName: 'Bob',
                lastName: 'Johnson',
                phone: '555-0003',
                status: 'new'
              }
            }
          ]
        })
      });
    }

    if (url.includes('get-leads')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          leads: [
            { id: 'lead-1', firstName: 'John', lastName: 'Doe', email: 'john@test.com', phone: '555-0001', status: 'new', createdAt: '2025-01-01' },
            { id: 'lead-2', firstName: 'Jane', lastName: 'Smith', email: 'jane@test.com', phone: '555-0002', status: 'contacted', createdAt: '2025-01-02' },
            { id: 'lead-3', firstName: 'Bob', lastName: 'Johnson', email: 'bob@test.com', phone: '555-0003', status: 'new', createdAt: '2025-01-03' }
          ],
          total: 3
        })
      });
    }

    if (url.includes('get-organizations')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ organizations: [], total: 0 })
      });
    }

    if (url.includes('get-projects')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ projects: [] })
      });
    }

    if (url.includes('get-prospects')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ prospects: [], total: 0 })
      });
    }

    if (url.includes('get-tags')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ tags: [] })
      });
    }

    if (url.includes('notes')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ notes: [] })
      });
    }

    if (url.includes('get-appointments')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ appointments: [] })
      });
    }

    if (url.includes('get-proposals')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ proposals: [] })
      });
    }

    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({})
    });
  });
}

test.describe('Keyboard Navigation - Call List', () => {
  test.beforeEach(async ({ page }) => {
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

    await setupAllMocks(page);
    await page.goto('/admin.html');

    // Wait for drawer element then select a call list
    await page.waitForSelector('#callListDrawer', { state: 'attached', timeout: 15000 });
    await page.click('button:has-text("Select a list")');
    await page.waitForTimeout(300);
    await page.click('text=Test Call List');
    await page.waitForTimeout(500);

    // Wait for call list table to load with items
    await page.waitForSelector('#callListTableBody tr', { timeout: 15000 });
  });

  test('clicking row should open detail pane', async ({ page }) => {
    const firstRow = page.locator('#callListTableBody tr').first();
    await firstRow.click();
    await page.waitForTimeout(300);

    const detailPane = page.locator('#callDetailPane');
    const transform = await detailPane.evaluate(el => el.style.transform);
    // Browser may return 'translateX(0)' or 'translateX(0px)'
    expect(transform).toMatch(/translateX\(0(px)?\)/);
  });

  test('clicking row should highlight it with row-selected class', async ({ page }) => {
    const firstRow = page.locator('#callListTableBody tr').first();
    await firstRow.click();
    await page.waitForTimeout(300);

    await expect(firstRow).toHaveClass(/row-selected/);
  });

  test('down arrow should navigate to next row', async ({ page }) => {
    const firstRow = page.locator('#callListTableBody tr').first();
    await firstRow.click();
    await page.waitForTimeout(300);

    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(300);

    const secondRow = page.locator('#callListTableBody tr').nth(1);
    await expect(secondRow).toHaveClass(/row-selected/);
    await expect(firstRow).not.toHaveClass(/row-selected/);
  });

  test('up arrow should navigate to previous row', async ({ page }) => {
    const secondRow = page.locator('#callListTableBody tr').nth(1);
    await secondRow.click();
    await page.waitForTimeout(300);

    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(300);

    const firstRow = page.locator('#callListTableBody tr').first();
    await expect(firstRow).toHaveClass(/row-selected/);
    await expect(secondRow).not.toHaveClass(/row-selected/);
  });

  test('arrow navigation should update detail pane content', async ({ page }) => {
    // Click first row
    const firstRow = page.locator('#callListTableBody tr').first();
    await firstRow.click();
    await page.waitForTimeout(500);

    // Get initial content
    const initialContent = await page.locator('#callDetailContent').textContent();

    // Navigate down
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(500);

    // Get new content - it should be different
    const newContent = await page.locator('#callDetailContent').textContent();
    expect(newContent).not.toBe(initialContent);
  });

  test('escape should close detail pane', async ({ page }) => {
    const firstRow = page.locator('#callListTableBody tr').first();
    await firstRow.click();
    await page.waitForTimeout(300);

    // Verify pane is open
    const detailPane = page.locator('#callDetailPane');
    let transform = await detailPane.evaluate(el => el.style.transform);
    expect(transform).toMatch(/translateX\(0(px)?\)/);

    // Press escape
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    // Verify pane is closed
    transform = await detailPane.evaluate(el => el.style.transform);
    expect(transform).toMatch(/translateX\(100%\)/);
  });

  test('row-selected class should have visible styling', async ({ page }) => {
    const firstRow = page.locator('#callListTableBody tr').first();
    await firstRow.click();
    await page.waitForTimeout(300);

    // Check that row-selected has box-shadow (left border indicator)
    const boxShadow = await firstRow.evaluate(el => getComputedStyle(el).boxShadow);
    expect(boxShadow).toContain('rgb(99, 102, 241)'); // indigo color
  });
});

test.describe('Keyboard Navigation - Leads', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('authToken', 'test-token');
      localStorage.setItem('user', JSON.stringify({ userId: 'test-user', email: 'test@test.com' }));
      localStorage.setItem('currentTenant', 'test-tenant');
      localStorage.setItem('selectedTenant', 'test-tenant');
      localStorage.setItem('lastView', 'leads');
      localStorage.setItem('userTenants', JSON.stringify([
        { slug: 'test-tenant', name: 'Test Tenant', role: 'admin' }
      ]));
    });

    await setupAllMocks(page);
    await page.goto('/admin.html');

    // Wait for leads table to load
    await page.waitForSelector('#leadTableBody tr', { timeout: 15000 });
  });

  test('down arrow should navigate leads list', async ({ page }) => {
    const firstRow = page.locator('#leadTableBody tr').first();
    await firstRow.click();
    await page.waitForTimeout(300);

    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(300);

    const secondRow = page.locator('#leadTableBody tr').nth(1);
    await expect(secondRow).toHaveClass(/row-selected/);
  });

  test('escape should close lead detail pane', async ({ page }) => {
    const firstRow = page.locator('#leadTableBody tr').first();
    await firstRow.click();
    await page.waitForTimeout(300);

    const detailPane = page.locator('#leadDetailPane');
    let transform = await detailPane.evaluate(el => el.style.transform);
    expect(transform).toMatch(/translateX\(0(px)?\)/);

    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    transform = await detailPane.evaluate(el => el.style.transform);
    expect(transform).toMatch(/translateX\(100%\)/);
  });
});

test.describe('Detail Pane - Fixed Position', () => {
  test.beforeEach(async ({ page }) => {
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

    await setupAllMocks(page);
    await page.goto('/admin.html');

    // Wait for drawer element then select a call list
    await page.waitForSelector('#callListDrawer', { state: 'attached', timeout: 15000 });
    await page.click('button:has-text("Select a list")');
    await page.waitForTimeout(300);
    await page.click('text=Test Call List');
    await page.waitForTimeout(500);

    await page.waitForSelector('#callListTableBody tr', { timeout: 15000 });
  });

  test('detail pane should have fixed positioning', async ({ page }) => {
    const detailPane = page.locator('#callDetailPane');
    const position = await detailPane.evaluate(el => getComputedStyle(el).position);
    expect(position).toBe('fixed');
  });

  test('detail pane should stay visible when scrolling', async ({ page }) => {
    const firstRow = page.locator('#callListTableBody tr').first();
    await firstRow.click();
    await page.waitForTimeout(300);

    // Scroll the page
    await page.evaluate(() => window.scrollBy(0, 500));
    await page.waitForTimeout(300);

    // Detail pane should still be visible
    const detailPane = page.locator('#callDetailPane');
    await expect(detailPane).toBeVisible();

    const transform = await detailPane.evaluate(el => el.style.transform);
    expect(transform).toMatch(/translateX\(0(px)?\)/);
  });

  test('detail pane should slide in without flash', async ({ page }) => {
    // Initial state - pane should be off-screen
    const detailPane = page.locator('#callDetailPane');
    let transform = await detailPane.evaluate(el => el.style.transform);
    expect(transform).toMatch(/translateX\(100%\)/);

    // Click row to open
    const firstRow = page.locator('#callListTableBody tr').first();
    await firstRow.click();

    // Wait for animation
    await page.waitForTimeout(300);

    // Pane should be visible
    transform = await detailPane.evaluate(el => el.style.transform);
    expect(transform).toMatch(/translateX\(0(px)?\)/);
  });
});
