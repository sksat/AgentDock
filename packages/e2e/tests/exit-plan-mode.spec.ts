import { test, expect } from '@playwright/test';

test.describe('ExitPlanMode permission workflow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Connected')).toBeVisible({ timeout: 10000 });
    await page.getByRole('button', { name: 'New Session' }).click();
    // Wait for session to be created and input field to be available
    await expect(page.getByRole('textbox', { name: 'Type a message...' })).toBeVisible({ timeout: 5000 });
  });

  test('should show permission popup for ExitPlanMode and approve plan', async ({ page }) => {
    // Send message that triggers the exit plan mode scenario
    await page.getByRole('textbox', { name: 'Type a message...' }).fill('please plan this feature');
    await page.getByRole('textbox', { name: 'Type a message...' }).press('Enter');

    // Should see the plan text first
    await expect(page.getByText(/Here is my implementation plan/)).toBeVisible({ timeout: 10000 });

    // Should see the permission popup for ExitPlanMode
    await expect(page.getByText('ExitPlanMode')).toBeVisible({ timeout: 10000 });

    // Should see the Allow button
    const allowButton = page.getByRole('button', { name: 'Allow' });
    await expect(allowButton).toBeVisible();

    // Click Allow to approve the plan
    await allowButton.click();

    // Should see the success message after approval
    await expect(page.getByText(/Your plan has been approved/)).toBeVisible({ timeout: 10000 });

    // Session should return to running state
    await expect(page.getByText(/Plan approved and ready/)).toBeVisible({ timeout: 10000 });
  });

  test('should show permission popup for ExitPlanMode and deny plan', async ({ page }) => {
    // Send message that triggers the exit plan mode scenario
    await page.getByRole('textbox', { name: 'Type a message...' }).fill('plan my task');
    await page.getByRole('textbox', { name: 'Type a message...' }).press('Enter');

    // Should see the plan text first
    await expect(page.getByText(/Here is my implementation plan/)).toBeVisible({ timeout: 10000 });

    // Should see the permission popup for ExitPlanMode
    await expect(page.getByText('ExitPlanMode')).toBeVisible({ timeout: 10000 });

    // Should see the Deny button
    const denyButton = page.getByRole('button', { name: 'Deny' });
    await expect(denyButton).toBeVisible();

    // Click Deny to reject the plan
    await denyButton.click();

    // The permission popup should be dismissed
    // (Note: In deny case, the mock runner returns error and the scenario ends)
    // We just verify the popup is gone and no approval message appears
    await expect(page.getByRole('button', { name: 'Allow' })).not.toBeVisible({ timeout: 5000 });
  });

  test('should display ExitPlanMode tool use indicator', async ({ page }) => {
    // Send message that triggers the exit plan mode scenario
    await page.getByRole('textbox', { name: 'Type a message...' }).fill('approve my plan');
    await page.getByRole('textbox', { name: 'Type a message...' }).press('Enter');

    // Should see ExitPlanMode in the permission request
    // The tool name badge should be visible
    await expect(page.locator('span:has-text("ExitPlanMode")')).toBeVisible({ timeout: 10000 });
  });

  test('should show thinking before permission request', async ({ page }) => {
    // Send message that triggers the exit plan mode scenario
    await page.getByRole('textbox', { name: 'Type a message...' }).fill('plan implementation');
    await page.getByRole('textbox', { name: 'Type a message...' }).press('Enter');

    // Should see thinking block
    await expect(page.getByText('Thinking')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/plan mode/i)).toBeVisible({ timeout: 10000 });
  });

  test('should continue conversation after plan approval', async ({ page }) => {
    // Send message that triggers the exit plan mode scenario
    await page.getByRole('textbox', { name: 'Type a message...' }).fill('plan this');
    await page.getByRole('textbox', { name: 'Type a message...' }).press('Enter');

    // Wait for permission popup
    await expect(page.getByText('ExitPlanMode')).toBeVisible({ timeout: 10000 });

    // Approve the plan
    await page.getByRole('button', { name: 'Allow' }).click();

    // Should see the continuation text
    await expect(page.getByText(/proceed with the implementation/)).toBeVisible({ timeout: 10000 });

    // Should see the final result
    await expect(page.getByText(/Plan approved and ready/)).toBeVisible({ timeout: 10000 });
  });
});
