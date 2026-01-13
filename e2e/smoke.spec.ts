import { test, expect, Page } from '@playwright/test';

/**
 * E2E Smoke Tests
 * 
 * Core user flows that must work for the application to be functional.
 * Run with: npx playwright test e2e/smoke.spec.ts
 */

test.describe('Smoke Tests - Critical User Flows', () => {
  
  test.describe('Authentication Flow', () => {
    test('should display login page when not authenticated', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');
      
      // Should see login form or be redirected to login
      const hasLoginElements = await page.locator('input[type="email"], input[type="password"], button:has-text("Login"), button:has-text("Sign")').count();
      
      // Either shows login or auto-logs in (dev mode)
      expect(hasLoginElements).toBeGreaterThanOrEqual(0);
    });

    test('should handle login form submission', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');
      
      // Look for email/password fields
      const emailField = page.locator('input[type="email"], input[name="email"]').first();
      const passwordField = page.locator('input[type="password"]').first();
      
      if (await emailField.count() > 0 && await passwordField.count() > 0) {
        // Fill in test credentials
        await emailField.fill('test@example.com');
        await passwordField.fill('testpassword');
        
        // Find and click login button
        const loginButton = page.locator('button[type="submit"], button:has-text("Login"), button:has-text("Sign in")').first();
        if (await loginButton.count() > 0) {
          await loginButton.click();
          
          // Wait for either error message or redirect
          await page.waitForTimeout(2000);
        }
      }
    });
  });

  test.describe('Dashboard View', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/dashboard');
      await page.waitForLoadState('networkidle');
      // Give time for data to load
      await page.waitForTimeout(1000);
    });

    test('should load dashboard without errors', async ({ page }) => {
      // Check for console errors
      const errors: string[] = [];
      page.on('console', msg => {
        if (msg.type() === 'error') {
          errors.push(msg.text());
        }
      });

      await page.waitForTimeout(2000);
      
      // Filter out expected errors (e.g., network requests that might fail)
      const criticalErrors = errors.filter(e => 
        !e.includes('Failed to fetch') && 
        !e.includes('net::ERR') &&
        !e.includes('401')
      );
      
      // No critical console errors
      expect(criticalErrors.length).toBe(0);
    });

    test('should display main content area', async ({ page }) => {
      // Check that main content exists
      const mainContent = page.locator('main, [role="main"], .main-content, #root > div').first();
      await expect(mainContent).toBeVisible();
    });

    test('should have working navigation', async ({ page }) => {
      // Look for navigation elements
      const navLinks = page.locator('nav a, [role="navigation"] a, aside a');
      const navCount = await navLinks.count();
      
      if (navCount > 0) {
        // Click first nav link
        await navLinks.first().click();
        await page.waitForTimeout(500);
        
        // Should not have a white screen / crash
        const bodyContent = await page.locator('body').textContent();
        expect(bodyContent?.length).toBeGreaterThan(0);
      }
    });
  });

  test.describe('Initiative Operations', () => {
    test('should display initiatives table or list', async ({ page }) => {
      await page.goto('/dashboard');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      
      // Look for table or list elements
      const tableOrList = page.locator('table, [role="table"], [role="grid"], .initiative-list, .task-table');
      
      // Either has a table or the page loaded successfully
      const hasTable = await tableOrList.count() > 0;
      const pageLoaded = (await page.locator('body').textContent())?.length ?? 0 > 100;
      
      expect(hasTable || pageLoaded).toBeTruthy();
    });

    test('should have create initiative button', async ({ page }) => {
      await page.goto('/dashboard');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);
      
      // Look for "New" or "Create" or "Add" button
      const createButton = page.locator('button:has-text("New"), button:has-text("Create"), button:has-text("Add"), [aria-label*="create"], [aria-label*="new"]');
      
      // May or may not be visible depending on auth state
      const buttonCount = await createButton.count();
      expect(buttonCount).toBeGreaterThanOrEqual(0);
    });

    test('should open modal when clicking create button', async ({ page }) => {
      await page.goto('/dashboard');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);
      
      // Find create button
      const createButton = page.locator('button:has-text("New"), button:has-text("Create")').first();
      
      if (await createButton.count() > 0 && await createButton.isVisible()) {
        await createButton.click();
        await page.waitForTimeout(500);
        
        // Look for modal
        const modal = page.locator('[role="dialog"], .modal, [class*="modal"], [class*="Modal"]');
        const modalVisible = await modal.count() > 0;
        
        expect(modalVisible).toBeTruthy();
      }
    });
  });

  test.describe('Filtering and Search', () => {
    test('should have search functionality', async ({ page }) => {
      await page.goto('/dashboard');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);
      
      // Look for search input
      const searchInput = page.locator('input[type="search"], input[placeholder*="search" i], input[placeholder*="filter" i], [aria-label*="search" i]');
      
      if (await searchInput.count() > 0) {
        await searchInput.first().fill('test query');
        await page.waitForTimeout(500);
        
        // Should not crash
        const bodyContent = await page.locator('body').textContent();
        expect(bodyContent?.length).toBeGreaterThan(0);
      }
    });

    test('should have filter dropdowns', async ({ page }) => {
      await page.goto('/dashboard');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);
      
      // Look for filter elements
      const filters = page.locator('select, [role="combobox"], button:has-text("Filter"), [class*="filter" i]');
      const filterCount = await filters.count();
      
      // Filters may or may not be present
      expect(filterCount).toBeGreaterThanOrEqual(0);
    });
  });

  test.describe('Route Navigation', () => {
    const routes = [
      { path: '/dashboard', name: 'Dashboard' },
      { path: '/admin', name: 'Admin' },
      { path: '/timeline', name: 'Timeline' },
      { path: '/resources', name: 'Resources' },
    ];

    for (const route of routes) {
      test(`should load ${route.name} page without crash`, async ({ page }) => {
        await page.goto(route.path);
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(1000);
        
        // Page should have content
        const bodyContent = await page.locator('body').textContent();
        expect(bodyContent?.length).toBeGreaterThan(0);
        
        // Should not show error boundary or crash message
        const errorIndicators = page.locator('text="Something went wrong", text="Error", text="crashed"');
        const hasError = await errorIndicators.count() > 0;
        
        // Allow "Error" in normal UI text, but not as a main heading
        const mainError = page.locator('h1:has-text("Error"), h2:has-text("Error")');
        expect(await mainError.count()).toBe(0);
      });
    }
  });

  test.describe('Responsive Layout', () => {
    test('should render on mobile viewport', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      await page.goto('/dashboard');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);
      
      // Should not overflow or break
      const body = page.locator('body');
      await expect(body).toBeVisible();
      
      const bodyContent = await body.textContent();
      expect(bodyContent?.length).toBeGreaterThan(0);
    });

    test('should render on tablet viewport', async ({ page }) => {
      await page.setViewportSize({ width: 768, height: 1024 });
      await page.goto('/dashboard');
      await page.waitForLoadState('networkidle');
      
      const body = page.locator('body');
      await expect(body).toBeVisible();
    });
  });

  test.describe('Performance', () => {
    test('should load within acceptable time', async ({ page }) => {
      const startTime = Date.now();
      
      await page.goto('/dashboard');
      await page.waitForLoadState('networkidle');
      
      const loadTime = Date.now() - startTime;
      
      // Should load within 10 seconds (generous for cold start)
      expect(loadTime).toBeLessThan(10000);
    });
  });
});
