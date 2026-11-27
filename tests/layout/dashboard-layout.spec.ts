import { expect, test } from "@playwright/test";

type Theme = "aurora" | "professional-dark" | "professional-light";

test.describe("Dashboard layout regression", () => {
  const desktopViewport = { width: 1440, height: 900 };
  const themes: Theme[] = ["aurora", "professional-dark", "professional-light"];

  for (const theme of themes) {
    test(`no horizontal overflow and equalized key row heights in ${theme}`, async ({ page }) => {
      await page.setViewportSize(desktopViewport);
      await page.addInitScript((value) => localStorage.setItem("encifone-theme", value), theme);
      await page.goto("/dashboard", { waitUntil: "networkidle" });

      const redirectedToAuth = page.url().includes("/login");
      test.skip(redirectedToAuth, "Authenticated dashboard session required for layout regression checks.");

      const overflow = await page.evaluate(() => {
        const root = document.documentElement;
        return {
          clientWidth: root.clientWidth,
          scrollWidth: root.scrollWidth,
          hasHorizontalOverflow: root.scrollWidth > root.clientWidth + 1,
        };
      });
      expect(overflow.hasHorizontalOverflow).toBeFalsy();

      const heights = await page.evaluate(() => {
        const byId = (id: string) => document.querySelector(`[data-testid=\"${id}\"]`)?.getBoundingClientRect().height ?? null;
        return {
          operational: byId("operational-kpis-card"),
          salesPerformance: byId("sales-performance-card"),
          leadSource: byId("lead-source-card"),
          attention: byId("attention-card"),
          recentActivity: byId("recent-activity-card"),
          quickActions: byId("quick-actions-card"),
        };
      });

      expect(heights.operational).not.toBeNull();
      expect(heights.salesPerformance).not.toBeNull();
      expect(heights.leadSource).not.toBeNull();
      expect(heights.attention).not.toBeNull();
      expect(heights.recentActivity).not.toBeNull();
      expect(heights.quickActions).not.toBeNull();

      const epsilon = 2;
      expect(Math.abs((heights.operational ?? 0) - (heights.salesPerformance ?? 0))).toBeLessThanOrEqual(epsilon);
      expect(Math.abs((heights.leadSource ?? 0) - (heights.attention ?? 0))).toBeLessThanOrEqual(epsilon);
      expect(Math.abs((heights.recentActivity ?? 0) - (heights.quickActions ?? 0))).toBeLessThanOrEqual(epsilon);
    });
  }
});
