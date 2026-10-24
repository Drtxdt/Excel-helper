import type { Page } from "@playwright/test";
/** Operates the visible native editor through real pointer/keyboard input. */
export function formulaInput(page: Page) {
  const editor = page.locator(
    '[data-u-comp="formula-bar"] [data-u-comp="formula-editor"]',
  );
  return {
    value: page.locator(".toolbar-note"),
    tap: () => editor.tap(),
    async fill(text: string) {
      // Replacing a draft first closes its candidate list, then cancels editing.
      // Otherwise an unfinished formula can retain its own selection/caret.
      await page.keyboard.press("Escape");
      await page.keyboard.press("Escape");
      await page
        .getByRole("textbox", { name: "单元格地址", exact: true })
        .press("Enter");
      await editor.click();
      const modifier = await page.evaluate(() =>
        /^(Mac68K|MacPPC|Macintosh|MacIntel)$/.test(navigator.platform)
          ? "Meta"
          : "Control",
      );
      await page.keyboard.press(`${modifier}+a`);
      await page.keyboard.insertText(text);
    },
    press: (key: string) => page.keyboard.press(key),
  };
}
