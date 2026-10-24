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
      await page
        .getByRole("textbox", { name: "单元格地址", exact: true })
        .press("Enter");
      await editor.click();
      await page.keyboard.press("ControlOrMeta+a");
      await page.keyboard.insertText(text);
    },
    press: (key: string) => page.keyboard.press(key),
  };
}
