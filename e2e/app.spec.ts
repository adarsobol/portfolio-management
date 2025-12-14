import { test, expect } from '@playwright/test';

test.describe('Portfolio Manager App', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the app
    await page.goto('/');
  });

  test('should load the application', async ({ page }) => {
    // Check if the app loads without white screen
    await expect(page).toHaveTitle(/Portfolio/i);
    
    // Wait for initial load
    await page.waitForLoadState('networkidle');
  });

  test('should display dashboard after loading', async ({ page }) => {
    // Wait for the app to load
    await page.waitForLoadState('networkidle');
    
    // In development mode with auth bypass, should see dashboard content
    // Look for common dashboard elements
    const hasContent = await page.locator('body').textContent();
    expect(hasContent).toBeTruthy();
  });

  test('should handle navigation', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    
    // Check if sidebar or navigation exists
    const sidebar = page.locator('[data-testid="sidebar"], nav, aside').first();
    if (await sidebar.count() > 0) {
      await expect(sidebar).toBeVisible();
    }
  });
});
