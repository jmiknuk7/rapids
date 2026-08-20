/**
 * A11 Part 3 support: compose the sweep into contact sheets (grids of
 * downscaled captures) so the human/agent review can view every screenshot
 * without opening ~300 files. Emits out/sheets/<viewport>-<n>.png plus
 * index.json mapping grid positions to capture names. Individual PNGs stay
 * in out/<viewport>/ for close inspection of anything a sheet flags.
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";

const OUT = path.join(import.meta.dirname, "out");
const SHEETS = path.join(OUT, "sheets");
const COLS = 4;
const ROWS = 3;
const PAD = 6;
const TARGET_THUMB_W = 300;

function downscale(src: PNG, factor: number): PNG {
  const w = Math.floor(src.width / factor);
  const h = Math.floor(src.height / factor);
  const dst = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      // box-average for legibility at small sizes
      let r = 0, g = 0, b = 0, n = 0;
      for (let dy = 0; dy < factor; dy++)
        for (let dx = 0; dx < factor; dx++) {
          const si = ((y * factor + dy) * src.width + (x * factor + dx)) << 2;
          r += src.data[si]; g += src.data[si + 1]; b += src.data[si + 2]; n++;
        }
      const di = (y * w + x) << 2;
      dst.data[di] = r / n; dst.data[di + 1] = g / n; dst.data[di + 2] = b / n; dst.data[di + 3] = 255;
    }
  return dst;
}

mkdirSync(SHEETS, { recursive: true });
const index: Record<string, string[][]> = {};

for (const vp of readdirSync(OUT, { withFileTypes: true }).filter((d) => d.isDirectory() && d.name !== "sheets")) {
  const files = readdirSync(path.join(OUT, vp.name)).filter((f) => f.endsWith(".png")).sort();
  if (!files.length) continue;
  const first = PNG.sync.read(readFileSync(path.join(OUT, vp.name, files[0])));
  const factor = Math.max(1, Math.round(first.width / TARGET_THUMB_W));
  const tw = Math.floor(first.width / factor);
  const th = Math.floor(first.height / factor);
  const perSheet = COLS * ROWS;

  for (let s = 0; s * perSheet < files.length; s++) {
    const batch = files.slice(s * perSheet, (s + 1) * perSheet);
    const sheet = new PNG({
      width: COLS * (tw + PAD) + PAD,
      height: Math.ceil(batch.length / COLS) * (th + PAD) + PAD,
    });
    sheet.data.fill(40); // dark gutter so tile edges are visible
    batch.forEach((f, i) => {
      const png = PNG.sync.read(readFileSync(path.join(OUT, vp.name, f)));
      const thumb = downscale(png, factor);
      const gx = (i % COLS) * (tw + PAD) + PAD;
      const gy = Math.floor(i / COLS) * (th + PAD) + PAD;
      PNG.bitblt(thumb, sheet, 0, 0, Math.min(tw, thumb.width), Math.min(th, thumb.height), gx, gy);
    });
    const name = `${vp.name}-${s + 1}.png`;
    writeFileSync(path.join(SHEETS, name), PNG.sync.write(sheet));
    index[name] = [];
    for (let r = 0; r < Math.ceil(batch.length / COLS); r++)
      index[name].push(batch.slice(r * COLS, (r + 1) * COLS).map((f) => f.replace(".png", "")));
  }
}

writeFileSync(path.join(SHEETS, "index.json"), JSON.stringify(index, null, 1), "utf8");
console.log(`sheets written: ${Object.keys(index).length} (see index.json for the position map)`);
