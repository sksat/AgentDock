import { test, expect } from '@playwright/test';

test.describe('Sidebar', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Connected')).toBeVisible({ timeout: 10000 });
  });

  test('should collapse and expand sidebar', async ({ page }) => {
    const sidebar = page.locator('[data-testid="sidebar"]');

    // Initially expanded
    await expect(sidebar).not.toHaveAttribute('data-collapsed', 'true');

    // Click collapse button
    await page.getByRole('button', { name: /Collapse sidebar/i }).click();

    // Should be collapsed
    await expect(sidebar).toHaveAttribute('data-collapsed', 'true');

    // Click expand button
    await page.getByRole('button', { name: /Expand sidebar/i }).click();

    // Should be expanded again
    await expect(sidebar).not.toHaveAttribute('data-collapsed', 'true');
  });

  test('should persist sidebar collapsed state in localStorage', async ({ page }) => {
    // Collapse sidebar
    await page.getByRole('button', { name: /Collapse sidebar/i }).click();

    // Check localStorage
    const collapsedState = await page.evaluate(() =>
      localStorage.getItem('claude-bridge:sidebar-collapsed')
    );
    expect(collapsedState).toBe('true');

    // Expand sidebar
    await page.getByRole('button', { name: /Expand sidebar/i }).click();

    // Check localStorage updated
    const expandedState = await page.evaluate(() =>
      localStorage.getItem('claude-bridge:sidebar-collapsed')
    );
    expect(expandedState).toBe('false');
  });

  test('should hide session names when collapsed', async ({ page }) => {
    const sidebar = page.locator('[data-testid="sidebar"]');
    const sessionItems = sidebar.locator('[data-testid^="session-item-"]');

    // Create a session first
    await page.getByRole('button', { name: 'New Session' }).click();

    // Wait for session to appear
    await expect(sessionItems.first()).toBeVisible({ timeout: 5000 });

    // Session name text should be visible (the span with truncate class)
    const sessionNameSpan = sessionItems.first().locator('span.truncate');
    await expect(sessionNameSpan).toBeVisible();

    // Collapse sidebar
    await page.getByRole('button', { name: /Collapse sidebar/i }).click();

    // Session name text should not be visible when collapsed
    await expect(sessionNameSpan).not.toBeVisible();
  });

  test('should rename session on double-click', async ({ page }) => {
    // Create a session
    await page.getByRole('button', { name: 'New Session' }).click();

    // Double-click to rename
    const sessionItem = page.getByRole('button', { name: /Session/ }).first();
    await sessionItem.dblclick();

    // Should show input field
    const input = page.getByRole('textbox');
    await expect(input).toBeVisible();

    // Type new name
    await input.fill('My Custom Session');
    await input.press('Enter');

    // Should show new name
    await expect(page.getByText('My Custom Session')).toBeVisible();
  });
});
