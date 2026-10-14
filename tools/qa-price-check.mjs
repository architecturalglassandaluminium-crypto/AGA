/*
 * QA for the Price Check tab.
 *
 * Checks the two things that differ by screen size and are easy to
 * break without noticing, because a desktop browser never shows it:
 *
 *   1. that the comparison is a TABLE on a laptop and a stack of
 *      CARDS on a phone, with each store name still beside its own
 *      price - the old sideways-scrolling table took the store names
 *      off screen while their prices stayed put;
 *   2. that nothing pushes the page sideways at any width.
 *
 * Run with the browser-automation skill, with preview-server.js up:
 *
 *   node preview-server.js
 *   node <skill>/browser.mjs http://127.0.0.1:8800/ --script tools/qa-price-check.mjs
 *
 * Every measurement is a computed style or a bounding box, never a
 * guess at what "should" be there.
 */

/* preview-server.js serves the project root here. */
const BASE = "http://127.0.0.1:8800/";

export default async function run(page, ui) {

  const report = {};

  for (const [label, width, height] of [
    ["desktop_1440", 1440, 900],
    ["tablet_768", 768, 1024],
    ["phone_390", 390, 844],
    ["phone_360", 360, 780]
  ]) {
    await page.setViewportSize({ width, height });

    /*
     * waitUntil "load" and a settle, not "domcontentloaded": the nav
     * handler is bound by app.js, and clicking the tab before that
     * has run looks exactly like a broken button.
     */
    await page.goto(BASE, { waitUntil: "load" });
    await page.waitForTimeout(1500);

    // Open the tab with a real click at the button's own coordinates.
    const point = await page.evaluate(() => {
      const button = document.querySelector('[data-view="pricecheck"]');
      const box = button.getBoundingClientRect();
      return {
        x: Math.round(box.left + box.width / 2),
        y: Math.round(box.top + box.height / 2)
      };
    });
    await page.mouse.click(point.x, point.y);
    await page.waitForTimeout(700);

    report[label] = await page.evaluate(() => {
      const cs = element => (element ? getComputedStyle(element) : null);
      const section = document.getElementById("pricecheck-view");
      const table = document.querySelector(".price-table");
      const head = document.querySelector(".price-table thead");
      const row = document.querySelector("#priceCheckBody tr.price-row");
      const cell = row ? row.querySelector("td.price-cell") : null;
      const addButton = row ? row.querySelector(".price-add-button") : null;

      const box = element => {
        const rect = element.getBoundingClientRect();
        return {
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          width: Math.round(rect.width),
          height: Math.round(rect.height)
        };
      };

      // The store label a stacked card prints from its own cell.
      const pseudo = cell ? getComputedStyle(cell, "::before") : null;

      return {
        active: section ? section.classList.contains("active") : false,
        productRows: document.querySelectorAll("#priceCheckBody tr.price-row").length,
        categoryBands: document.querySelectorAll("#priceCheckBody tr.price-group").length,
        storeColumns: document.querySelectorAll(".price-table thead th").length - 3,

        // Table on a wide screen, cards on a narrow one.
        headDisplay: cs(head).display,
        cellDisplay: cs(cell).display,
        cardMode: cs(head).display === "none" && cs(cell).display === "flex",
        storeLabel: pseudo && pseudo.content !== "none" ? cell.getAttribute("data-label") : null,

        // The figure is beside its label, not below or off screen.
        priceInputOnScreen: (() => {
          const input = cell ? cell.querySelector(".price-input") : null;
          if (!input) return null;
          const rect = input.getBoundingClientRect();
          return rect.right <= window.innerWidth + 1 && rect.left >= -1;
        })(),

        addButton: addButton ? box(addButton) : null,
        addButtonOnScreen: addButton
          ? addButton.getBoundingClientRect().right <= window.innerWidth + 1
          : null,

        // Nothing may push the page sideways.
        horizontalOverflow:
          document.documentElement.scrollWidth >
          document.documentElement.clientWidth + 1,

        tableWiderThanWrapper: table
          ? table.scrollWidth > table.parentElement.clientWidth + 1
          : null
      };
    });

    /*
     * And the nav bar: with eight tabs it must still show every one,
     * not hide the last two behind an invisible sideways scroll.
     */
    report[label].nav = await page.evaluate(() => {
      const nav = document.querySelector(".main-navigation");
      const buttons = [...nav.querySelectorAll(".nav-button")];
      return {
        buttonCount: buttons.length,
        overflows: nav.scrollWidth > nav.clientWidth + 1,
        offScreen: buttons
          .filter(button => {
            const rect = button.getBoundingClientRect();
            return rect.left < -1 || rect.right > window.innerWidth + 1;
          })
          .map(button => button.dataset.view),
        clippedLabels: buttons
          .filter(button => {
            const label = button.querySelector(".nav-label");
            return label && label.scrollWidth > label.clientWidth + 1;
          })
          .map(button => button.dataset.view)
      };
    });
  }

  /* The shopping list, on a phone: description readable, controls usable. */
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(BASE, { waitUntil: "load" });
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    const button = document.querySelector('[data-view="pricecheck"]');
    if (button) button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    document.querySelector("#priceCheckBody .price-add-button").click();
  });
  await page.waitForTimeout(500);

  report.shoppingList = await page.evaluate(() => {
    const line = document.querySelector("#priceCheckList .shopping-line");
    if (!line) return { error: "no shopping line was added" };
    const description = line.querySelector(".shopping-description");
    const quantity = line.querySelector(".shopping-quantity");
    const remove = line.querySelector(".shopping-remove");
    const rect = element => {
      const box = element.getBoundingClientRect();
      return { width: Math.round(box.width), height: Math.round(box.height) };
    };
    return {
      description: rect(description),
      descriptionReadable: description.getBoundingClientRect().width > 40,
      quantity: rect(quantity),
      remove: rect(remove),
      controlsOnScreen:
        quantity.getBoundingClientRect().right <= window.innerWidth + 1 &&
        remove.getBoundingClientRect().right <= window.innerWidth + 1,
      // A thumb needs about 32px.
      removeTappable: remove.getBoundingClientRect().height >= 30,
      total: document.getElementById("priceCheckTotal").textContent.trim()
    };
  });

  return report;
}
