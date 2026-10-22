/**
 * Colours for the Dock home style (dock-style.js), ported from webos-vibehack:
 * the tile's fill from its icon's edge, and the vivid colour the ambient glow
 * takes when the remote is on that tile.
 */

export function rgbToHsv(c) {
  const r = c[0] / 255;
  const g = c[1] / 255;
  const b = c[2] / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, max ? d / max : 0, max];
}

export function hsvToRgb(hsv) {
  const h = hsv[0];
  const s = hsv[1];
  const v = hsv[2];
  const c = v * s;
  const x = c * (1 - Math.abs((h / 60) % 2 - 1));
  const m = v - c;
  let rgb;
  if (h < 60) rgb = [c, x, 0];
  else if (h < 120) rgb = [x, c, 0];
  else if (h < 180) rgb = [0, c, x];
  else if (h < 240) rgb = [0, x, c];
  else if (h < 300) rgb = [x, 0, c];
  else rgb = [c, 0, x];
  return rgb.map(function (k) { return Math.round((k + m) * 255); });
}

// The glow for an icon with no colour to speak of (or none at all).
export const NEUTRAL_GLOW = [68, 68, 68];

/**
 * A vivid colour from an icon's RGBA pixels (a small downscale): the most
 * saturated, not too dark pixel, or for a nearly monochrome icon its average,
 * lifted so the glow still shows.
 */
export function vividColor(px) {
  let best = null;
  let bestScore = -1;
  const sum = [0, 0, 0];
  let n = 0;
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] < 128) continue;
    const p = [px[i], px[i + 1], px[i + 2]];
    sum[0] += p[0];
    sum[1] += p[1];
    sum[2] += p[2];
    n += 1;
    const hsv = rgbToHsv(p);
    const score = hsv[1] * Math.min(1, hsv[2] * 1.4);
    if (score > bestScore) {
      bestScore = score;
      best = p;
    }
  }
  if (!n) return NEUTRAL_GLOW.slice();
  if (bestScore < 0.25) {
    const avg = rgbToHsv([sum[0] / n, sum[1] / n, sum[2] / n]);
    avg[2] = Math.max(avg[2], 0.55);
    return hsvToRgb(avg);
  }
  const h = rgbToHsv(best);
  h[1] = Math.min(1, h[1] * 1.1);
  h[2] = Math.max(0.5, h[2]);
  return hsvToRgb(h);
}

/** The ambient glow layer's background for colour [r, g, b]. */
export function glowGradient(color) {
  const key = color.join(',');
  return 'radial-gradient(circle 1190px at 32% 42%, rgba(' + key + ',0.36) 0%, rgba(' +
    key + ',0.15) 50%, rgba(' + key + ',0) 100%)';
}
