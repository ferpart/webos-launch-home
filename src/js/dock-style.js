import {REMOTE_KEY} from './remote.js';
import {NEUTRAL_GLOW, glowGradient, vividColor} from './dock-colors.js';
import {appBannerFor} from './app-banners.js';
import {prefersBundledIcons} from './app-catalog.js';
import {withAssetVersion} from './compat.js';
import {APP_VERSION} from './version.js';
import {getAppIdCandidates} from './app-icons.js';

/*
 * The Dock home style (Settings -> Look -> Home style), after webos-vibehack's
 * Apple TV-style launcher: the first row of tiles in a dock with the focused
 * app's name above it, the rest in a grid below, a glow in the focused app's
 * colour and one glass highlight that springs between tiles. Top right, a clock
 * that opens a menu: the inputs, Launch Home's Settings and TV Settings.
 *
 * Presentation only. The tiles and inputs are Launch Home's own (apps.js,
 * inputs.js) with their own click handlers, and the focus manager (focus.js)
 * still moves the remote between them. This module lays them out, follows
 * focus (focusin) to scroll, glow and name, and moves the inputs row into the
 * clock's menu. Classic takes all of it off.
 */

const SIDE = 112;
// At four across: 360x202 tiles, the dock row's bottom at 910.
const BASE_TILE_W = 360;
const BASE_CELL_W = (1920 - 2 * SIDE) / 4;
const DOCK_BOTTOM = 910;
// Extra space below the dock.
const DOCK_GAP = 36;
const FOCUS_SCALE = 1.1;
// Room for the glass glow around the scaled tile.
const GLASS_PAD = 12;
// The area grid rows scroll into (the clock hides once the dock leaves).
const VIEW_TOP = 80;
const VIEW_BOTTOM = 1060;
const HERO_SIZE = 96;

export const DOCK_COLUMNS = [3, 4, 5, 6];

/** The home style in `config`: 'dock' unless Classic was chosen. */
export function homeStyleOf(config) {
  const style = config && config.launcher && config.launcher.homeStyle;
  return style === 'classic' ? 'classic' : 'dock';
}

/** What the dock row shows: 'recent' (default) or 'pinned' order. */
export function dockOrderOf(config) {
  const order = config && config.launcher && config.launcher.dockOrder;
  return order === 'pinned' ? 'pinned' : 'recent';
}

/**
 * `tiles` in the order the Dock shows them: with `recent` app ids (newest
 * first), the most recently opened ones first, as many as fit in the dock
 * row, then the rest in their pinned order. `idOf(tile)` is a tile's app id.
 */
export function orderByRecent(tiles, recent, columns, idOf) {
  const front = [];
  (recent || []).forEach(function (id) {
    if (front.length >= columns) return;
    const ids = getAppIdCandidates(id);
    const tile = tiles.filter(function (t) {
      if (front.indexOf(t) >= 0) return false;
      const own = idOf(t);
      return !!own && getAppIdCandidates(own).some(function (c) { return ids.indexOf(c) >= 0; });
    })[0];
    if (tile) front.push(tile);
  });
  return front.concat(tiles.filter(function (t) { return front.indexOf(t) < 0; }));
}

const RECENT_KEY = 'lounge.dock.recent';
const RECENT_MAX = 24;

function loadRecent() {
  try {
    const list = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
    return Array.isArray(list) ? list.filter(function (id) { return typeof id === 'string'; }) : [];
  } catch (err) {
    return [];
  }
}

/** Puts app `id` first in the recently-opened list (kept on the TV). */
export function noteRecentApp(id) {
  if (!id) return;
  const list = loadRecent().filter(function (other) { return other !== id; });
  list.unshift(id);
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, RECENT_MAX)));
  } catch (err) {
    // Storage unavailable: the dock keeps its pinned order.
  }
}

/** The glow in the focused app's colour: 'off' (default), 'soft' or 'full'. */
export function dockGlowOf(config) {
  const glow = config && config.launcher && config.launcher.dockGlow;
  return glow === 'full' || glow === 'soft' ? glow : 'off';
}

/** Tiles per row in `config` (3-6, default 4). */
export function dockColumnsOf(config) {
  const n = Number(config && config.launcher && config.launcher.dockColumns);
  return DOCK_COLUMNS.indexOf(n) >= 0 ? n : 4;
}

/**
 * Sizes for `columns` tiles per row: tiles shrink to fit, keeping the 16:9
 * card and the dock row's bottom edge where four across has them.
 */
export function dockGeometry(columns) {
  const cellW = (1920 - 2 * SIDE) / columns;
  const tileW = Math.round(cellW * BASE_TILE_W / BASE_CELL_W);
  const tileH = Math.round(tileW * 202 / 360);
  return {
    columns: columns,
    cellW: cellW,
    tileW: tileW,
    tileH: tileH,
    scale: tileW / BASE_TILE_W,
    dockTop: DOCK_BOTTOM - tileH,
    rowPitch: tileH + 90
  };
}

export function dockTileLeft(i, g) {
  return SIDE + (i % g.columns) * g.cellW + (g.cellW - g.tileW) / 2;
}

export function dockTileTop(i, g) {
  const row = Math.floor(i / g.columns);
  return g.dockTop + row * g.rowPitch + (row > 0 ? DOCK_GAP : 0);
}

/**
 * How far the grid scrolls (px) to show tile `i`, from the current `offset`:
 * the dock row is never scrolled; other rows only as far as it takes to show
 * the whole highlight and the name below the tile.
 */
export function dockScrollOffset(i, offset, g) {
  if (Math.floor(i / g.columns) === 0) return 0;
  const top = dockTileTop(i, g);
  let next = offset;
  if (top - next + g.tileH + 70 > VIEW_BOTTOM) next = top + g.tileH + 70 - VIEW_BOTTOM;
  if (top - next - 24 < VIEW_TOP) next = top - 24 - VIEW_TOP;
  return next;
}

/**
 * @param {object} opts
 *   elements: {app, launcher, appGridShell, appGrid, inputRow, channelStrip}
 *   focusElement(el): move the remote to `el` (focus.js); true if it did
 *   onOpenSettings(): Launch Home's Settings, from the menu
 *   onOpenTvSettings(): the TV's own Settings, from the menu
 *   onToast(text)
 */
export function createDockStyle(opts) {
  const el = opts.elements;
  const $ = function (id) { return document.getElementById(id); };
  const grid = el.appGrid;
  const shell = el.appGridShell;
  const inputRow = el.inputRow;
  const hero = $('dock-hero');
  const glass = $('dock-glass');
  const band = $('dock-band');
  const ambients = [$('dock-ambient-a'), $('dock-ambient-b')];
  const menuBtn = $('dock-menu-btn');
  const menu = $('dock-menu');
  const menuTime = $('dock-menu-time');
  const menuDate = $('dock-menu-date');
  const menuInputs = $('dock-menu-inputs');
  const settingsRow = $('dock-menu-settings');
  const tvRow = $('dock-menu-tv');
  // Where the inputs row lives in Classic, to put it back.
  const inputHome = {parent: inputRow.parentNode, next: inputRow.nextSibling};

  let on = false;
  let geo = dockGeometry(4);
  let offset = 0;
  let focusedTile = null;
  let lastDockTile = null;
  let glassShown = false;
  let heroShown = false;
  let heroSwap = null;
  let ambientFront = 0;
  let ambientKey = '';
  let menuOpen = false;
  let dockOrder = 'recent';
  let glow = 'off';
  // The tiles in the order shown. Worked out when the home screen appears or
  // its tiles change, never while the remote is moving through them.
  let ordered = [];
  const tileColors = new WeakMap();

  // TV Settings is in the menu, so its tile sits out of the Dock grid.
  function pinnedTiles() {
    return Array.prototype.slice.call(grid.querySelectorAll('.app-tile:not(.settings-tile)'));
  }

  function reorder() {
    const pinned = pinnedTiles();
    ordered = dockOrder === 'recent'
      ? orderByRecent(pinned, loadRecent(), geo.columns, function (t) { return t.dataset.appId; })
      : pinned;
  }

  function tiles() {
    return ordered.filter(function (tile) { return tile.parentNode === grid; });
  }

  function dockTiles() {
    return tiles().slice(0, geo.columns);
  }

  function focusEl(node) {
    return !!(node && opts.focusElement(node));
  }

  // ---- layout ----------------------------------------------------------------

  /** Places every tile by its position; tiles glide when the order changes. */
  function layout() {
    reorder();
    const list = tiles();
    const g = geo;
    shell.style.setProperty('--dock-tile-w', g.tileW + 'px');
    shell.style.setProperty('--dock-tile-h', g.tileH + 'px');
    shell.style.setProperty('--dock-scale', String(g.scale));
    list.forEach(function (tile, i) {
      tile.style.left = dockTileLeft(i, g) + 'px';
      tile.style.top = dockTileTop(i, g) + 'px';
      tile.classList.toggle('dock-row', i < g.columns);
    });
    const n = Math.min(g.columns, list.length);
    band.style.display = n ? '' : 'none';
    band.style.left = (dockTileLeft(0, g) - 28) + 'px';
    band.style.top = (g.dockTop - 28) + 'px';
    band.style.width = ((n - 1) * g.cellW + g.tileW + 56) + 'px';
    band.style.height = (g.tileH + 56) + 'px';
    grid.style.height = (list.length ? dockTileTop(list.length - 1, g) + g.tileH + 120 : 0) + 'px';
    hero.style.top = (g.dockTop - 28 - 52 - HERO_SIZE) + 'px';
    list.forEach(function (tile) {
      if (paintBanner(tile)) return;
      const img = tile.querySelector('img.app-icon');
      if (img && img.complete && img.naturalWidth) paintTile(tile, img);
      else if (!img) paintGlyphTile(tile);
    });
    const active = document.activeElement;
    if (active && list.indexOf(active) >= 0) focusTile(active);
  }

  function unlayout() {
    Array.prototype.forEach.call(grid.querySelectorAll('.app-tile'), function (tile) {
      tile.style.left = '';
      tile.style.top = '';
      tile.style.backgroundColor = '';
      tile.style.backgroundImage = '';
      tile.style.transitionDelay = '';
      resetTilt(tile);
      tile.classList.remove('dock-row', 'dock-glyph', 'dock-bleed', 'dock-banner');
      delete tile.dataset.dockBanner;
    });
    grid.style.height = '';
    shell.style.transform = '';
    ['--dock-tile-w', '--dock-tile-h', '--dock-scale'].forEach(function (name) {
      shell.style.removeProperty(name);
    });
    grid.classList.remove('dock-pre');
  }

  /** Back from an app (or first start): the tiles rise in, one after another. */
  function animateIn() {
    if (!on) return;
    const list = tiles();
    grid.classList.add('dock-pre');
    list.forEach(function (tile, i) {
      tile.style.transitionDelay = (60 + Math.min(i, 16) * 40) + 'ms';
    });
    // Flush the start state before letting the tiles transition in.
    void grid.offsetWidth;
    grid.classList.remove('dock-pre');
    clearTimeout(animateIn.timer);
    animateIn.timer = setTimeout(function () {
      list.forEach(function (tile) { tile.style.transitionDelay = ''; });
    }, 60 + Math.min(list.length, 16) * 40 + 420);
  }

  // ---- tile colours ----------------------------------------------------------

  /**
   * The icon's background at full size: its corner, the middle of its left
   * edge and a point a little inside that. A logo on a flat colour has the
   * same opaque colour at all three; a rounded or framed icon doesn't.
   */
  function edgePixels(img) {
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    const corner = g.getImageData(2, 2, 1, 1).data;
    const side = g.getImageData(2, Math.floor(h / 2), 1, 1).data;
    const inner = g.getImageData(Math.floor(w * 0.08), Math.floor(h / 2), 1, 1).data;
    return {corner: corner, side: side, flat: flatColor([corner, side, inner])};
  }

  function flatColor(pixels) {
    const a = pixels[0];
    return pixels.every(function (p) {
      return p[3] > 200 && Math.abs(p[0] - a[0]) + Math.abs(p[1] - a[1]) + Math.abs(p[2] - a[2]) < 24;
    });
  }

  // The tvOS bleed behind a rounded icon: the icon itself, enlarged to cover
  // the tile, blurred and darkened. Drawn once per icon, at half size.
  const BLEED_W = 180;
  const BLEED_H = 101;

  function bleedImage(img) {
    const c = document.createElement('canvas');
    c.width = BLEED_W;
    c.height = BLEED_H;
    const g = c.getContext('2d');
    g.fillStyle = '#1c1c1e';
    g.fillRect(0, 0, BLEED_W, BLEED_H);
    g.filter = 'blur(12px) saturate(1.35) brightness(0.72)';
    // Past the edges, so the blur doesn't fade into the fill there.
    const size = BLEED_W * 1.3;
    g.drawImage(img, (BLEED_W - size) / 2, (BLEED_H - size) / 2, size, size);
    return c.toDataURL('image/jpeg', 0.85);
  }

  /**
   * Store icons are logos on a solid colour: fill the wide tile with that
   * colour so the logo reads as a banner (webos-vibehack). Rounded icons
   * (Launch Home's own) sit centred on a blurred bleed of themselves, and
   * glyphs on transparent sit smaller on a dark tile.
   */
  function paintTile(tile, img) {
    let px = null;
    let edge = null;
    let bleed = '';
    try {
      const c = document.createElement('canvas');
      c.width = 12;
      c.height = 12;
      const g = c.getContext('2d');
      g.drawImage(img, 0, 0, 12, 12);
      px = g.getImageData(0, 0, 12, 12).data;
      edge = edgePixels(img);
      if (!edge.flat && (edge.corner[3] > 200 || edge.side[3] > 200)) bleed = bleedImage(img);
    } catch (err) {
      // Tainted canvas: a dark tile and a neutral glow.
    }
    tile.classList.remove('dock-glyph', 'dock-bleed');
    tile.style.backgroundImage = '';
    tile.style.backgroundColor = '';
    if (edge && edge.flat) {
      const fill = edge.corner;
      tile.style.backgroundColor = 'rgb(' + fill[0] + ',' + fill[1] + ',' + fill[2] + ')';
    } else if (bleed) {
      tile.classList.add('dock-bleed');
      tile.style.backgroundImage = 'url(' + bleed + ')';
    } else {
      tile.classList.add('dock-glyph');
    }
    tileColors.set(tile, px ? vividColor(px) : NEUTRAL_GLOW.slice());
    if (tile === focusedTile) setAmbient(tileColors.get(tile));
  }

  /**
   * Apps with wide art (app-banners.js) show it across the whole tile, like
   * an Apple TV tile; Settings -> Apps -> Launch Home icons off uses the
   * TV's own icons instead. True when the tile has a banner.
   */
  function paintBanner(tile) {
    const src = prefersBundledIcons() ? appBannerFor(tile.dataset.appId) : '';
    if (!src) {
      if (tile.dataset.dockBanner) {
        delete tile.dataset.dockBanner;
        tile.classList.remove('dock-banner');
        tile.style.backgroundImage = '';
      }
      return false;
    }
    if (tile.dataset.dockBanner === src) return true;
    tile.dataset.dockBanner = src;
    const url = withAssetVersion(src, APP_VERSION);
    tile.classList.remove('dock-glyph', 'dock-bleed');
    tile.classList.add('dock-banner');
    tile.style.backgroundColor = '';
    tile.style.backgroundImage = 'url("' + url + '")';
    // The glow takes the banner's colour.
    const art = new Image();
    art.onload = function () {
      try {
        const c = document.createElement('canvas');
        c.width = 12;
        c.height = 12;
        const g = c.getContext('2d');
        g.drawImage(art, 0, 0, 12, 12);
        tileColors.set(tile, vividColor(g.getImageData(0, 0, 12, 12).data));
      } catch (err) {
        tileColors.set(tile, NEUTRAL_GLOW.slice());
      }
      if (tile === focusedTile) setAmbient(tileColors.get(tile));
    };
    art.src = url;
    return true;
  }

  // No picture (All apps, a letter badge): a dark tile and a neutral glow.
  function paintGlyphTile(tile) {
    tile.classList.remove('dock-bleed');
    tile.classList.add('dock-glyph');
    tile.style.backgroundImage = '';
    tile.style.backgroundColor = '';
    tileColors.set(tile, NEUTRAL_GLOW.slice());
  }

  /** Crossfades the glow to a new colour by swapping between two layers. */
  function setAmbient(color) {
    if (!color) return;
    const key = color.join(',');
    if (key === ambientKey) return;
    ambientKey = key;
    const back = ambients[1 - ambientFront];
    back.style.background = glowGradient(color, glow);
    back.style.opacity = '1';
    ambients[ambientFront].style.opacity = '0';
    ambientFront = 1 - ambientFront;
  }

  // ---- focus, glass, name ----------------------------------------------------

  function focusTile(tile) {
    const list = tiles();
    const i = list.indexOf(tile);
    if (i < 0) return;
    const g = geo;
    if (focusedTile && focusedTile !== tile) resetTilt(focusedTile);
    focusedTile = tile;
    const row = Math.floor(i / g.columns);
    if (row === 0) lastDockTile = tile;

    offset = dockScrollOffset(i, offset, g);
    shell.style.transform = 'translateY(' + (-offset) + 'px)';
    // Keep the clock until the dock band would run into it.
    document.body.classList.toggle('dock-scrolled', g.dockTop - 28 - offset < 180);

    const w = g.tileW * FOCUS_SCALE + 2 * GLASS_PAD;
    const h = g.tileH * FOCUS_SCALE + 2 * GLASS_PAD;
    const x = dockTileLeft(i, g) + g.tileW / 2 - w / 2;
    const y = dockTileTop(i, g) + g.tileH / 2 - h / 2;
    glass.style.width = w + 'px';
    glass.style.height = h + 'px';
    glass.style.transform = 'translate(' + x + 'px,' + y + 'px)';
    if (!glassShown) {
      // First show: jump there without the spring, then fade in.
      glass.style.transition = 'none';
      void glass.offsetWidth;
      glass.style.transition = '';
      glass.style.opacity = '1';
      glassShown = true;
    }

    if (row === 0) showHero(tile.getAttribute('aria-label') || '');
    else hideHero();
    setAmbient(tileColors.get(tile));
  }

  // tvOS parallax: the Magic Remote's pointer over the focused tile tilts it a
  // little and moves its sheen. Transform and a gradient only: no relayout.
  const TILT_DEG = 7;

  function onPointerMove(event) {
    if (!on || !focusedTile) return;
    const r = focusedTile.getBoundingClientRect();
    if (!r.width || event.clientX < r.left || event.clientX > r.right ||
        event.clientY < r.top || event.clientY > r.bottom) {
      resetTilt(focusedTile);
      return;
    }
    const fx = (event.clientX - r.left) / r.width - 0.5;
    const fy = (event.clientY - r.top) / r.height - 0.5;
    focusedTile.style.setProperty('--tilt-x', (fx * TILT_DEG).toFixed(2) + 'deg');
    focusedTile.style.setProperty('--tilt-y', (-fy * TILT_DEG).toFixed(2) + 'deg');
    focusedTile.style.setProperty('--sheen-x', Math.round((fx + 0.5) * 100) + '%');
    focusedTile.style.setProperty('--sheen-y', Math.round((fy + 0.5) * 60 - 10) + '%');
  }

  function resetTilt(tile) {
    ['--tilt-x', '--tilt-y', '--sheen-x', '--sheen-y'].forEach(function (name) {
      tile.style.removeProperty(name);
    });
  }

  function hideGlass() {
    glassShown = false;
    glass.style.opacity = '0';
  }

  function showHero(label) {
    if (!heroShown) {
      hero.textContent = label;
      hero.style.transform = 'none';
      hero.style.opacity = '1';
      heroShown = true;
      return;
    }
    if (hero.textContent === label) return;
    hero.style.opacity = '0';
    hero.style.transform = 'translateX(-24px)';
    clearTimeout(heroSwap);
    heroSwap = setTimeout(function () {
      hero.textContent = label;
      hero.style.transition = 'none';
      hero.style.transform = 'translateX(24px)';
      void hero.offsetWidth;
      hero.style.transition = '';
      hero.style.transform = 'none';
      hero.style.opacity = '1';
    }, 120);
  }

  function hideHero() {
    if (!heroShown) return;
    heroShown = false;
    clearTimeout(heroSwap);
    hero.style.opacity = '0';
  }

  function onFocusIn(event) {
    if (!on) return;
    const target = event.target;
    if (menuOpen && target !== menuBtn && !menu.contains(target)) closeMenu(false);
    if (target && target.classList && target.classList.contains('app-tile') &&
        grid.contains(target)) {
      focusTile(target);
      return;
    }
    // Off the tiles (clock, menu, channels): the highlight goes, the clock
    // comes back, the glow stays on the last app.
    if (focusedTile) resetTilt(focusedTile);
    focusedTile = null;
    hideGlass();
    if (target === menuBtn) document.body.classList.remove('dock-scrolled');
  }

  // The grid moves by transform only. Focusing a tile below the screen makes
  // Chromium scroll the clipped containers to it as well, on top of that
  // transform; put them back.
  function onScroll(event) {
    if (!on) return;
    const target = event.target;
    if (target === el.app || target === el.launcher || target === shell || target === grid) {
      if (target.scrollTop) target.scrollTop = 0;
      if (target.scrollLeft) target.scrollLeft = 0;
    }
  }

  // ---- the clock's menu: inputs, Settings, TV Settings -----------------------

  function menuItems() {
    const chips = Array.prototype.filter.call(inputRow.querySelectorAll('.focusable'), function (chip) {
      return !chip.disabled;
    });
    return chips.concat([settingsRow, tvRow]);
  }

  function openMenu() {
    menuOpen = true;
    // webOS plays video on a hardware layer under the page, where a backdrop
    // blur can't see it (it blurs a transparent hole, drawn black). Over a
    // video wallpaper the menu is smoked glass instead (dock.css).
    document.body.classList.toggle('dock-menu-over-video',
      !!document.querySelector('#background-layer video'));
    document.body.classList.add('dock-menu-open');
    menuBtn.setAttribute('aria-expanded', 'true');
    const items = menuItems();
    const current = items.filter(function (item) { return item.classList.contains('active'); })[0];
    focusEl(current || items[0]);
  }

  function closeMenu(refocusClock) {
    if (!menuOpen) return;
    menuOpen = false;
    document.body.classList.remove('dock-menu-open');
    menuBtn.setAttribute('aria-expanded', 'false');
    if (refocusClock) focusEl(menuBtn);
  }

  // Picking an input (or Channels) closes the menu; inputs.js switches. The
  // Channels strip takes the remote itself, so only come back to the clock
  // when the remote is still in the menu.
  function onInputClick() {
    if (!on || !menuOpen) return;
    const active = document.activeElement;
    closeMenu(!active || active === document.body || menu.contains(active));
  }

  // ---- remote ----------------------------------------------------------------

  function channelStripOpen() {
    return !!(el.channelStrip && !el.channelStrip.hidden);
  }

  /**
   * Arrow keys the Dock layout steers itself (focus.js asks first): the menu,
   * Up from the dock to the clock, and Down from the clock back to the dock
   * tile the remote came from. False: focus.js moves as usual.
   */
  function handleArrow(code, active) {
    if (!on || !active) return false;
    if (menuOpen) {
      const items = menuItems();
      const i = items.indexOf(active);
      if (i < 0 && active !== menuBtn) {
        closeMenu(false);
        return false;
      }
      if (code === REMOTE_KEY.UP) {
        if (i > 0) focusEl(items[i - 1]);
        else closeMenu(true);
      } else if (code === REMOTE_KEY.DOWN) {
        if (i < items.length - 1) focusEl(items[i + 1]);
      } else if (code === REMOTE_KEY.LEFT) {
        closeMenu(true);
      }
      return true;
    }
    // Left and Right go to the tile beside it as shown (the dock may be in
    // recently-used order; focus.js would fall back to pinned order).
    const list = tiles();
    const at = list.indexOf(active);
    if (at >= 0 && (code === REMOTE_KEY.LEFT || code === REMOTE_KEY.RIGHT)) {
      const next = list[at + (code === REMOTE_KEY.RIGHT ? 1 : -1)];
      if (next) focusEl(next);
      return true;
    }
    // With the Channels strip open, Up and Down go through it (focus.js).
    if (channelStripOpen()) return false;
    if (code === REMOTE_KEY.UP && dockTiles().indexOf(active) >= 0) {
      return focusEl(menuBtn);
    }
    if (active === menuBtn) {
      if (code === REMOTE_KEY.DOWN) {
        const back = lastDockTile && grid.contains(lastDockTile) ? lastDockTile : dockTiles()[0];
        focusEl(back);
      }
      // Nothing else up here: focus.js would carry on through the grid.
      return true;
    }
    return false;
  }

  /** Back closes the menu. False when there was nothing to close. */
  function handleBack() {
    if (!on || !menuOpen) return false;
    closeMenu(true);
    return true;
  }

  // ---- lifecycle -------------------------------------------------------------

  function apply(config) {
    const want = homeStyleOf(config) === 'dock';
    const columns = dockColumnsOf(config);
    dockOrder = dockOrderOf(config);
    const nextGlow = dockGlowOf(config);
    if (nextGlow !== glow) {
      glow = nextGlow;
      ambientKey = '';
      ambients.forEach(function (layer) { layer.style.opacity = '0'; });
    }
    document.body.classList.toggle('dock-no-glow', glow === 'off');
    if (columns !== geo.columns) {
      geo = dockGeometry(columns);
      offset = 0;
    }
    if (want === on) {
      if (on) layout();
      return;
    }
    on = want;
    document.body.classList.toggle('home-dock', on);
    if (on) {
      menuInputs.appendChild(inputRow);
      layout();
      animateIn();
    } else {
      closeMenu(false);
      hideGlass();
      hideHero();
      focusedTile = null;
      offset = 0;
      document.body.classList.remove('dock-scrolled');
      inputHome.parent.insertBefore(inputRow, inputHome.next);
      unlayout();
    }
  }

  // Back from an app: the recently used apps move into the dock, the
  // entrance replays, and the highlight goes to the tile.
  function onResume() {
    if (!on || document.hidden) return;
    closeMenu(false);
    layout();
    animateIn();
  }

  menuBtn.addEventListener('click', function () {
    if (menuOpen) closeMenu(true);
    else openMenu();
  });
  settingsRow.addEventListener('click', function () {
    closeMenu(false);
    if (opts.onOpenSettings) opts.onOpenSettings();
  });
  tvRow.addEventListener('click', function () {
    closeMenu(true);
    if (opts.onOpenTvSettings) opts.onOpenTvSettings();
  });
  inputRow.addEventListener('click', onInputClick);
  // Opening an app from its tile counts as using it (apps opened elsewhere:
  // noteApp, from main.js's foreground watch).
  grid.addEventListener('click', function (event) {
    const tile = event.target && event.target.closest && event.target.closest('.app-tile');
    if (tile && tile.dataset.appId) noteRecentApp(tile.dataset.appId);
  }, true);
  el.app.addEventListener('mousemove', onPointerMove);
  document.addEventListener('focusin', onFocusIn);
  document.addEventListener('scroll', onScroll, true);
  document.addEventListener('visibilitychange', onResume);
  document.addEventListener('webOSRelaunch', onResume);
  // Icons arrive late (read from the TV, then swapped in): colour each tile
  // as its picture loads. load doesn't bubble, so listen while capturing.
  grid.addEventListener('load', function (event) {
    const img = event.target;
    if (!on || !img || img.tagName !== 'IMG') return;
    const tile = img.closest('.app-tile');
    if (tile && !paintBanner(tile)) paintTile(tile, img);
  }, true);
  // apps.js redraws the tiles (start-up, Save, a late app list).
  if (typeof MutationObserver === 'function') {
    new MutationObserver(function () {
      if (on) layout();
    }).observe(grid, {childList: true});
  }

  return {
    apply: apply,
    isOn: function () { return on; },
    isMenuOpen: function () { return menuOpen; },
    /** An app came to the front (any way: tile, voice, LG's home, …). */
    noteApp: noteRecentApp,
    handleArrow: handleArrow,
    handleBack: handleBack,
    /**
     * The clock: `parts` from clock-format.js clockParts, `date` the long
     * date shown at the top of the menu.
     */
    setClock: function (parts, date) {
      menuTime.textContent = parts.time;
      if (parts.ampm) {
        const ampm = document.createElement('span');
        ampm.className = 'dock-menu-ampm';
        ampm.textContent = parts.ampm;
        menuTime.appendChild(ampm);
      }
      menuDate.textContent = date;
    }
  };
}
