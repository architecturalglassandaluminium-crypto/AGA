// Verify the trade apps render with the shared layout applied.
// Opens each app, waits for the nav, then reads the computed styles.
export default async function run(page, ui) {

  const report = {};

  for (const [name, url] of [
    ["aps_plumbing", "http://127.0.0.1:8811/trades/plumbing/"],
    ["apc_coatings", "http://127.0.0.1:8811/trades/coatings/"]
  ]) {
    // A fresh context per app, cache disabled, so nothing stale is read.
    await page.goto(url, { waitUntil: "domcontentloaded" });

    report[name] = await page.evaluate(() => {
      const q = (s) => document.querySelector(s);
      const cs = (e) => (e ? getComputedStyle(e) : null);
      const f = q(".field input");
      const ta = q(".field textarea");
      const sel = q(".field select");
      const nav = q(".nav");
      const side = q(".sidebar");

      const sheet = [...document.styleSheets]
        .map((s) => (s.href || "inline").split("/").pop())
        .filter((h) => h.includes("shared-trade-layout"));

      return {
        sharedSheetLoaded: sheet,
        bodyFont: cs(document.body).fontFamily.split(",")[0],
        bodyFontSize: cs(document.body).fontSize,
        fieldFont: f ? cs(f).fontFamily.split(",")[0] : null,
        fieldFontSize: f ? cs(f).fontSize : null,
        fieldHeight: f ? Math.round(f.getBoundingClientRect().height) : null,
        textareaFontSize: ta ? cs(ta).fontSize : null,
        textareaHeight: ta ? Math.round(ta.getBoundingClientRect().height) : null,
        selectFontSize: sel ? cs(sel).fontSize : null,
        navDisplay: nav ? cs(nav).display : null,
        navFlexWrap: nav ? cs(nav).flexWrap : null,
        sidebarDirection: side ? cs(side).flexDirection : null,
        sidebarWidth: side ? cs(side).width : null,
        navItemCount: document.querySelectorAll(".nav-item").length,
        navItemFontSizes: [
          ...new Set(
            [...document.querySelectorAll(".nav-item")].map((b) => cs(b).fontSize)
          )
        ],
        navItemsAllVisible: [...document.querySelectorAll(".nav-item")].every(
          (b) => b.getBoundingClientRect().width > 0 && cs(b).fontSize !== "0px"
        ),
        tableScrollWrappers: document.querySelectorAll(".table-scroll").length
      };
    });
  }

  return report;
}
