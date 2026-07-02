/**
 * THROWAWAY - delete after verifying Jenkins video-on-failure.
 *
 * Fails on purpose so Playwright's video:'retain-on-failure' keeps a .webm,
 * proving the CI agent can record + publish video. VPN-independent (about:blank)
 * so it runs regardless of pre-prod availability.
 *
 * Command to run:
 *   npx playwright test "tests/_video_smoke/video-smoke.spec.ts" --project=chrome-headless
 */
import { test, expect } from '@playwright/test';

test('VIDEO-SMOKE: intentional failure to retain a video', async ({ page }) => {
  await page.goto('about:blank');
  // Give the video recorder a moment of frames before failing.
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 1500)));
  expect(true, 'intentional failure so retain-on-failure keeps the .webm').toBe(false);
});
