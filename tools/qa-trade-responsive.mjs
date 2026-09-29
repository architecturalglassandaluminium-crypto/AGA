// Check the trade apps at phone and tablet widths.
export default async function run(page, ui) {

  const report = {};

  for (const [label, width, height] of [
    ["tablet_768", 768, 1024],
    ["phone_390", 390, 844]
  ]) {
    await page.setViewportSize({ width, height });
    await page.goto("http://127.0.0.1:8811/trades/plumbing/", {
      waitUntil: "domcontentloaded"
    });

    report[label] = await page.evaluate(() => {
      const cs = (e) => (e ? getComputedStyle(e) : null);
      const nav = document.querySelector(".nav");
      const items = [...document.querySelectorAll(".nav-item")];
      const boxes = items.map((b) => b.getBoundingClientRect());

      // Rows the buttons actually occupy, by their top edge.
      const tops = [...new Set(boxes.map((b) => Math.round(b.top)))];

      return {
        navDisplay: cs(nav).display,
        sidebarPosition: cs(document.querySelector(".sidebar")).position,
        navItemCount: items.length,
        navRows: tops.length,
        navItemFontSizes: [...new Set(items.map((b) => cs(b).fontSize))],
        allLabelsVisible: items.every(
          (b) => b.getBoundingClientRect().width > 0 && cs(b).fontSize !== "0px"
        ),
        anyLabelClipped: items.some(
          (b) => b.scrollWidth > b.clientWidth + 1
        ),
        // Nothing should push the page sideways.
        horizontalOverflow:
          document.documentElement.scrollWidth >
          document.documentElement.clientWidth + 1
      };
    });
  }

  return report;
}