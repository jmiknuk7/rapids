/**
 * A11 Part 2 — in-page layout assertions. This string is evaluated inside
 * every captured page at every matrix cell. The gate is these checks, not
 * "the screenshots look right": visual review by the agent that wrote the
 * code confirms more than it finds.
 *
 * Returns { failures: [...], reports: [...] } — failures cover checks
 * 1-7 and 9 (exit-nonzero); reports carry check 8 (contrast — report-only
 * until Phase 5 brand colors land).
 */
export const ASSERT_SOURCE = String.raw`(() => {
  const failures = [];
  const reports = [];
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  const visible = (el) => {
    const s = getComputedStyle(el);
    if (s.display === "none" || s.visibility === "hidden" || Number(s.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    // Ignore elements on a hidden flip face or hidden ancestors.
    for (let a = el; a; a = a.parentElement) {
      const cs = getComputedStyle(a);
      if (cs.display === "none" || cs.visibility === "hidden") return false;
      if (a.getAttribute && a.getAttribute("aria-hidden") === "true") return false;
    }
    return true;
  };

  const sel = (el) => {
    const bits = [el.tagName.toLowerCase()];
    if (el.id) bits.push("#" + el.id);
    const qa = el.getAttribute && el.getAttribute("data-qa");
    if (qa) bits.push('[data-qa="' + qa + '"]');
    if (el.className && typeof el.className === "string")
      bits.push("." + el.className.trim().split(/\s+/).slice(0, 3).join("."));
    const txt = (el.textContent || "").trim().slice(0, 40);
    return bits.join("") + (txt ? ' "' + txt + '"' : "");
  };

  const scrollable = (el) => {
    const s = getComputedStyle(el);
    return (
      (s.overflowY === "auto" || s.overflowY === "scroll") && el.scrollHeight > el.clientHeight + 2
    );
  };
  const inScrollableX = (el) => {
    for (let a = el.parentElement; a; a = a.parentElement) {
      const s = getComputedStyle(a);
      if ((s.overflowX === "auto" || s.overflowX === "scroll") && a.scrollWidth > a.clientWidth + 2)
        return true;
    }
    return false;
  };
  const inScrollableY = (el) => {
    for (let a = el.parentElement; a; a = a.parentElement) if (scrollable(a)) return true;
    return false;
  };

  const all = [...document.querySelectorAll("body *")].filter(visible);

  /* 1 — collapsed scroll container (the options-porthole class of bug) */
  for (const el of all) {
    const s = getComputedStyle(el);
    if (
      (s.overflowY === "auto" || s.overflowY === "scroll") &&
      el.scrollHeight > el.clientHeight + 2 &&
      el.clientHeight < 200
    )
      failures.push({
        check: 1,
        what: "collapsed scroll container",
        selector: sel(el),
        values: "clientHeight=" + el.clientHeight + " scrollHeight=" + el.scrollHeight,
      });
  }

  /* 2 — horizontal overflow (the clipped date input) */
  for (const el of all) {
    if (inScrollableX(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.right > vw + 1 || r.left < -1)
      failures.push({
        check: 2,
        what: "horizontal overflow",
        selector: sel(el),
        values: "left=" + Math.round(r.left) + " right=" + Math.round(r.right) + " vw=" + vw,
      });
  }

  /* 3 — clipped without escape */
  for (const el of all) {
    for (let a = el.parentElement; a; a = a.parentElement) {
      const s = getComputedStyle(a);
      if (s.overflow === "visible" || (s.overflowY === "visible" && s.overflowX === "visible"))
        continue;
      const ra = a.getBoundingClientRect();
      const re = el.getBoundingClientRect();
      const clippedY = re.bottom > ra.bottom + 2 || re.top < ra.top - 2;
      if (clippedY && !scrollable(a) && !inScrollableY(el)) {
        // transforms (flip faces) legitimately position faces; skip 3d contexts
        let transformed = false;
        for (let t = el; t && t !== a.parentElement; t = t.parentElement) {
          if (getComputedStyle(t).transform !== "none") transformed = true;
        }
        if (!transformed)
          failures.push({
            check: 3,
            what: "clipped without escape",
            selector: sel(el),
            values:
              "el.bottom=" + Math.round(re.bottom) + " clip.bottom=" + Math.round(ra.bottom),
          });
      }
      break; // only the nearest clipping ancestor
    }
  }

  /* 4 — clip plus dead space (only meaningful on the active card) */
  {
    const item = document.querySelector('section[data-qa="slot"]:not([aria-hidden="true"]) [data-qa="item"]');
    const bar = document.querySelector('[data-qa="action-bar"]');
    if (item) {
      const clippedRegions = [...item.querySelectorAll("[data-qa$='-scroll']")].filter(
        (el) => visible(el) && el.scrollHeight > el.clientHeight + 2,
      );
      if (clippedRegions.length && bar) {
        const flip = item.querySelector("[data-qa$='-scroll']").closest("div[style*='perspective'], .relative");
        const flipRect = (flip || item).getBoundingClientRect();
        const barRect = bar.getBoundingClientRect();
        const dead = barRect.top - flipRect.bottom;
        if (dead > 100)
          failures.push({
            check: 4,
            what: "clipped content beside dead space",
            selector: sel(clippedRegions[0]),
            values: "deadSpace=" + Math.round(dead) + "px while content clipped",
          });
      }
    }
  }

  /* 5 — required controls present and fully in viewport */
  {
    const item = document.querySelector('section[data-qa="slot"]:not([aria-hidden="true"]) [data-qa="item"]');
    if (item) {
      const state = item.getAttribute("data-card-state");
      const need =
        state === "attempted" ? ["confidence-row"] : state === "revealed" ? ["grade-row"] : [];
      for (const row of need) {
        const el = document.querySelector('[data-qa="' + row + '"]');
        if (!el || !visible(el)) {
          failures.push({ check: 5, what: "required control missing", selector: row, values: "state=" + state });
          continue;
        }
        const r = el.getBoundingClientRect();
        if (r.top < 0 || r.bottom > vh + 1 || r.left < -1 || r.right > vw + 1)
          failures.push({
            check: 5,
            what: "required control out of viewport",
            selector: row,
            values: "top=" + Math.round(r.top) + " bottom=" + Math.round(r.bottom) + " vh=" + vh,
          });
      }
    }
  }

  /* 6 — minimum tap target (phone viewports only; caller sets __QA_PHONE) */
  if (window.__QA_PHONE) {
    for (const el of all) {
      if (!el.matches("button, a, input, [role='button']")) continue;
      if (el.disabled) continue;
      const r = el.getBoundingClientRect();
      if (r.height < 43 || r.width < 43)
        failures.push({
          check: 6,
          what: "tap target below 44px",
          selector: sel(el),
          values: Math.round(r.width) + "x" + Math.round(r.height),
        });
    }
  }

  /* 7 — duplicate visible chips inside one card */
  {
    const item = document.querySelector('section[data-qa="slot"]:not([aria-hidden="true"]) [data-qa="item"]');
    if (item) {
      const chips = [...item.querySelectorAll("span")].filter(
        (el) => visible(el) && getComputedStyle(el).borderRadius.includes("9999"),
      );
      const seen = new Map();
      for (const c of chips) {
        const t = (c.textContent || "").trim().toLowerCase();
        if (!t) continue;
        if (seen.has(t))
          failures.push({ check: 7, what: "duplicate visible chips", selector: sel(c), values: '"' + t + '" appears twice' });
        seen.set(t, true);
      }
    }
  }

  /* 8 — contrast (REPORT-ONLY until Phase 5 brand colors) */
  {
    const lum = (r, g, b) => {
      const f = (c) => {
        c /= 255;
        return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
      };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const parse = (c) => {
      const m = c.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/);
      return m ? [Number(m[1]), Number(m[2]), Number(m[3]), m[4] === undefined ? 1 : Number(m[4])] : null;
    };
    const bgOf = (el) => {
      let base = [11, 16, 23, 1]; // #0B1017 surface
      const chain = [];
      for (let a = el; a; a = a.parentElement) {
        const c = parse(getComputedStyle(a).backgroundColor);
        if (c && c[3] > 0) chain.unshift(c);
      }
      for (const c of chain) {
        base = [
          c[0] * c[3] + base[0] * (1 - c[3]),
          c[1] * c[3] + base[1] * (1 - c[3]),
          c[2] * c[3] + base[2] * (1 - c[3]),
          1,
        ];
      }
      return base;
    };
    for (const el of all) {
      const hasText = [...el.childNodes].some(
        (n) => n.nodeType === 3 && n.textContent.trim().length > 1,
      );
      if (!hasText) continue;
      const fg = parse(getComputedStyle(el).color);
      if (!fg) continue;
      const bg = bgOf(el);
      const L1 = lum(fg[0], fg[1], fg[2]);
      const L2 = lum(bg[0], bg[1], bg[2]);
      const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
      const size = parseFloat(getComputedStyle(el).fontSize);
      const bold = Number(getComputedStyle(el).fontWeight) >= 700;
      const needed = size >= 24 || (size >= 18.66 && bold) ? 3 : 4.5;
      if (ratio < needed)
        reports.push({
          check: 8,
          what: "contrast below AA",
          selector: sel(el),
          values: "ratio=" + ratio.toFixed(2) + " needed=" + needed + " size=" + size,
        });
    }
  }

  /* 9 — no content below the last interactive control */
  {
    const bar = document.querySelector('[data-qa="action-bar"]');
    if (bar) {
      const barRect = bar.getBoundingClientRect();
      for (const el of all) {
        if (bar.contains(el) || inScrollableY(el)) continue;
        const hasText = [...el.childNodes].some(
          (n) => n.nodeType === 3 && n.textContent.trim().length > 1,
        );
        if (!hasText) continue;
        const r = el.getBoundingClientRect();
        if (r.top >= barRect.bottom - 1)
          failures.push({
            check: 9,
            what: "content below last interactive control",
            selector: sel(el),
            values: "top=" + Math.round(r.top) + " barBottom=" + Math.round(barRect.bottom),
          });
      }
    }
  }

  return { failures, reports };
})()`;
