// Typography for the 2D overlay, modelled on the reference film:
//  - centred narrative lines that resolve character by character,
//  - bottom-left feature captions (title + small subtitle),
//  - a brand-orange accent on the product name.
import { ORANGE } from './timeline.js';
import { clamp, ease, invLerp, lerp } from './util.js';

const SANS = 'Inter, sans-serif';
const TECH = '"Chakra Petch", Inter, sans-serif';
export const FONTS = { SANS, TECH };

const shadow = (g, a = 0.45) => {
  g.shadowColor = `rgba(0,0,0,${a})`;
  g.shadowBlur = 24;
  g.shadowOffsetY = 2;
};

// Measures a run of [{text, color}] parts laid out on one line.
function layoutParts(g, parts, tracking) {
  const glyphs = [];
  let x = 0;
  for (const part of parts) {
    for (const ch of part.text) {
      const w = g.measureText(ch).width;
      glyphs.push({ ch, x, w, color: part.color || '#fff' });
      x += w + tracking;
    }
  }
  return { glyphs, width: x - tracking };
}

/**
 * Centered line that resolves glyph by glyph (blur + rise + fade), then
 * leaves with a soft fade. t is seconds since the shot started.
 */
export function revealLine(g, parts, t, {
  x = 960, y = 540, size = 64, weight = 600, font = SANS, tracking = 0,
  inAt = 0.15, stagger = 0.025, inDur = 0.45, outAt = Infinity, outDur = 0.3,
  align = 'center', rise = 22, blur = 10, shadowAlpha = 0.45,
} = {}) {
  g.save();
  g.font = `${weight} ${size}px ${font}`;
  g.textBaseline = 'alphabetic';
  const { glyphs, width } = layoutParts(g, parts, tracking);
  const x0 = align === 'center' ? x - width / 2 : align === 'right' ? x - width : x;
  const out = 1 - ease.inQuad(invLerp(outAt, outAt + outDur, t));
  shadow(g, shadowAlpha);
  glyphs.forEach((gl, i) => {
    const k = ease.outCubic(invLerp(inAt + i * stagger, inAt + i * stagger + inDur, t));
    if (k <= 0 || out <= 0) return;
    g.globalAlpha = k * out;
    g.filter = k < 1 ? `blur(${(1 - k) * blur}px)` : 'none';
    g.fillStyle = gl.color;
    g.fillText(gl.ch, x0 + gl.x, y + (1 - k) * rise);
  });
  g.restore();
  return width;
}

/**
 * Bottom-left feature caption: small orange kicker, large title, subtitle.
 * Each line wipes up from behind a mask, the accent bar draws first.
 */
export function featureCaption(g, { kicker, title, sub }, t, {
  x = 120, y = 900, inAt = 0.2, outAt = Infinity, titleSize = 60,
} = {}) {
  const out = 1 - ease.inQuad(invLerp(outAt, outAt + 0.3, t));
  if (out <= 0) return;
  g.save();
  g.globalAlpha = out;
  shadow(g, 0.5);

  const bar = ease.outExpo(invLerp(inAt, inAt + 0.5, t));
  g.fillStyle = ORANGE;
  g.fillRect(x, y - titleSize - 64, 56 * bar, 4);

  const line = (text, font, color, baseY, h, delay, tracking = 0) => {
    const k = ease.outQuart(invLerp(inAt + delay, inAt + delay + 0.6, t));
    if (k <= 0) return;
    g.save();
    g.beginPath();
    g.rect(x - 10, baseY - h, 1800, h * 1.35);
    g.clip();
    g.font = font;
    g.fillStyle = color;
    g.globalAlpha = out * clamp(k * 1.5);
    if ('letterSpacing' in g) g.letterSpacing = tracking + 'px';
    g.fillText(text, x, baseY + (1 - k) * h * 1.1);
    g.restore();
  };
  // title may be one line or an array of lines (the block grows downward).
  const titles = Array.isArray(title) ? title : [title];
  const lh = Math.round(titleSize * 1.15);
  if (kicker) line(kicker, `600 24px ${TECH}`, ORANGE, y - titleSize - 22, 28, 0.08, 5);
  titles.forEach((tl, i) => line(tl, `600 ${titleSize}px ${SANS}`, '#fff', y + i * lh, titleSize, 0.16 + i * 0.07));
  const subY = y + (titles.length - 1) * lh + 50;
  if (sub) line(sub, `400 28px ${SANS}`, 'rgba(255,255,255,0.78)', subY, 32, 0.28 + (titles.length - 1) * 0.07);
  g.restore();
}

/**
 * Big animated spec: the number counts up with a rolling ease, then the unit
 * and label settle in. Used for the Dream Pro stats.
 */
export function statBlock(g, { value, unit, label, kicker }, t, {
  x = 1180, y = 600, size = 210, inAt = 0.1, countDur = 0.8, outAt = Infinity,
} = {}) {
  const out = 1 - ease.inQuad(invLerp(outAt, outAt + 0.25, t));
  if (out <= 0 || t < inAt) return;
  g.save();
  g.globalAlpha = out;
  shadow(g, 0.5);

  const k = ease.outExpo(invLerp(inAt, inAt + countDur, t));
  const shown = Math.round(lerp(0, value, k));
  const appear = ease.outCubic(invLerp(inAt, inAt + 0.25, t));

  g.font = `700 ${size}px ${TECH}`;
  g.fillStyle = '#fff';
  g.globalAlpha = out * appear;
  // Fixed-width layout so the number does not jitter while counting.
  const digits = String(value).length;
  const numW = g.measureText('0'.repeat(digits)).width;
  const txt = String(shown).padStart(digits, ' ');
  g.textAlign = 'right';
  g.fillText(txt, x + numW, y + (1 - appear) * 30);
  g.textAlign = 'left';

  const uk = ease.outCubic(invLerp(inAt + 0.35, inAt + 0.75, t));
  g.globalAlpha = out * uk;
  g.font = `600 ${Math.round(size * 0.32)}px ${TECH}`;
  g.fillStyle = ORANGE;
  g.fillText(unit, x + numW + 18, y + (1 - uk) * 20);

  const lk = ease.outCubic(invLerp(inAt + 0.45, inAt + 0.9, t));
  g.globalAlpha = out * lk;
  g.fillStyle = '#fff';
  g.fillRect(x + 4, y + 34, 64 * lk, 3);
  g.font = `500 34px ${SANS}`;
  g.fillText(label, x + 4, y + 90 + (1 - lk) * 16);
  if (kicker) {
    g.font = `600 22px ${TECH}`;
    g.fillStyle = 'rgba(255,255,255,0.6)';
    if ('letterSpacing' in g) g.letterSpacing = '5px';
    g.fillText(kicker, x + 4, y - size * 0.82);
  }
  g.restore();
}

/**
 * Draws the traced CoolFly logo. Pieces slide in on a slant, the orange "F"
 * last, matching the italic cut of the wordmark.
 */
export function drawLogo(g, logo, t, { x = 960, y = 540, width = 900, inAt = 0, color = '#000', accent = ORANGE } = {}) {
  const s = width / logo.w;
  g.save();
  g.translate(x - width / 2, y - (logo.h * s) / 2);
  g.scale(s, s);
  g.translate(-logo.x, -logo.y);
  const n = logo.pieces.length;
  logo.pieces.forEach((p, i) => {
    const delay = p.accent ? 0.42 : (i / n) * 0.3;
    const k = ease.outExpo(invLerp(inAt + delay, inAt + delay + 0.7, t));
    if (k <= 0) return;
    g.save();
    g.globalAlpha = clamp(k * 1.6);
    const dx = (1 - k) * 160;
    g.translate(dx, -dx * 0.12);
    g.fillStyle = p.accent ? accent : color;
    g.fill(p.path, 'evenodd');
    g.restore();
  });
  g.restore();
}
