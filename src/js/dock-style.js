import {REMOTE_KEY} from './remote.js';
import {NEUTRAL_GLOW, glowGradient, vividColor} from './dock-colors.js';
import {appBannerFor} from './app-banners.js';
import {prefersBundledIcons} from './app-catalog.js';
import {withAssetVersion} from './compat.js';
import {APP_VERSION} from './version.js';

/*
 * The Dock home style (Settings -> Look -> Home style), after webos-vibehack's
 * tvOS-like launcher: the first four tiles in a dock with the focused app's
 * name above it, the rest in a grid below, a glow in the focused app's colour,
 * one glass highlight that springs between tiles, and Inputs / Wi-Fi /
 * Settings pills at the top.
 *
 * Presentation only. The tiles, inputs and Settings button are Launch Home's
 * own (apps.js, inputs.js, main.js) with their own click handlers, and the
 * focus manager (focus.js) still moves the remote between them. This module
 * lays them out, follows focus (focusin) to scroll, glow and name, and turns
 * the inputs row into the Inputs pill's dropdown. Classic takes all of it off.
 */

const COLUMNS = 4;
const TILE_W = 360;
const TILE_H = 202;
const SIDE = 112;
const CELL_W = (1920 - 2 * SIDE) / COLUMNS;
const ROW_PITCH = 292;
// Tile top of the dock row: the next row peeks in at the bottom.
const DOCK_TOP = 708;
// Extra space below the dock.
const DOCK_GAP = 36;
const FOCUS_SCALE = 1.1;
// Room for the glass glow around the scaled tile.
const GLASS_PAD = 12;
// The area grid rows scroll into (the header hides once the dock leaves).
const VIEW_TOP = 80;
const VIEW_BOTTOM = 1060;
const HERO_SIZE = 96;

export const HOME_STYLES = ['dock', 'classic'];

/** The home style in `config`: 'dock' unless Classic was chosen. */
export function homeStyleOf(config) {
  const style = config && config.launcher && config.launcher.homeStyle;
  return style === 'classic' ? 'classic' : 'dock';
}

export function dockTileLeft(i) {
  return SIDE + (i % COLUMNS) * CELL_W + (CELL_W - TILE_W) / 2;
}

export function dockTileTop(i) {
  const row = Math.floor(i / COLUMNS);
  return DOCK_TOP + row * ROW_PITCH + (row > 0 ? DOCK_GAP : 0);
}

/**
 * How far the grid scrolls (px) to show tile `i`, from the current `offset`:
 * the dock row is never scrolled; other rows only as far as it takes to show
 * the whole highlight and the name below the tile.
 */
export function dockScrollOffset(i, offset) {
  if (Math.floor(i / COLUMNS) === 0) return 0;
  const top = dockTileTop(i);
  let next = offset;
  if (top - next + TILE_H + 70 > VIEW_BOTTOM) next = top + TILE_H + 70 - VIEW_BOTTOM;
  if (top - next - 24 < VIEW_TOP) next = top - 24 - VIEW_TOP;
  return next;
}

/** Morning, afternoon... for the line above the clock, by hour (0-23). */
export function greetingFor(hour) {
  if (hour < 5) return 'Good night';
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  if (hour < 22) return 'Good evening';
  return 'Good night';
}

/**
 * @param {object} opts
 *   elements: {app, launcher, appGridShell, appGrid, inputRow, channelStrip,
 *     appSettingsBtn}
 *   focusElement(el): move the remote to `el` (focus.js); true if it did
 *   onOpenNetworkSettings(): the Wi-Fi pill
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
  const greeting = $('dock-greeting');
  const ambients = [$('dock-ambient-a'), $('dock-ambient-b')];
  const inputsBtn = $('dock-inputs-btn');
  const wifiBtn = $('dock-wifi-btn');
  const wifiLabel = $('dock-wifi-label');
  const pills = [inputsBtn, wifiBtn, el.appSettingsBtn];

  let on = false;
  let offset = 0;
  let focusedTile = null;
  let lastDockTile = null;
  let glassShown = false;
  let heroShown = false;
  let heroSwap = null;
  let ambientFront = 0;
  let ambientKey = '';
  let inputsOpen = false;
  let wifiWatch = null;
  const tileColors = new WeakMap();

  function tiles() {
    return Array.prototype.slice.call(grid.querySelectorAll('.app-tile'));
  }

  function isPill(node) {
    return pills.indexOf(node) >= 0;
  }

  function dockTiles() {
    return tiles().slice(0, COLUMNS);
  }

  function focusEl(node) {
    return !!(node && opts.focusElement(node));
  }

  // ---- layout ----------------------------------------------------------------

  /** Places every tile by its position; tiles glide when the order changes. */
  function layout() {
    const list = tiles();
    list.forEach(function (tile, i) {
      tile.style.left = dockTileLeft(i) + 'px';
      tile.style.top = dockTileTop(i) + 'px';
      tile.classList.toggle('dock-row', i < COLUMNS);
    });
    const n = Math.min(COLUMNS, list.length);
    band.style.display = n ? '' : 'none';
    band.style.left = (dockTileLeft(0) - 28) + 'px';
    band.style.top = (DOCK_TOP - 28) + 'px';
    band.style.width = ((n - 1) * CELL_W + TILE_W + 56) + 'px';
    band.style.height = (TILE_H + 56) + 'px';
    grid.style.height = (list.length ? dockTileTop(list.length - 1) + TILE_H + 120 : 0) + 'px';
    hero.style.top = (DOCK_TOP - 28 - 52 - HERO_SIZE) + 'px';
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
    tiles().forEach(function (tile) {
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
    back.style.background = glowGradient(color);
    back.style.opacity = '1';
    ambients[ambientFront].style.opacity = '0';
    ambientFront = 1 - ambientFront;
  }

  // ---- focus, glass, name ----------------------------------------------------

  function focusTile(tile) {
    const list = tiles();
    const i = list.indexOf(tile);
    if (i < 0) return;
    if (focusedTile && focusedTile !== tile) resetTilt(focusedTile);
    focusedTile = tile;
    const row = Math.floor(i / COLUMNS);
    if (row === 0) lastDockTile = tile;

    offset = dockScrollOffset(i, offset);
    shell.style.transform = 'translateY(' + (-offset) + 'px)';
    // Keep the header until the dock band would run into it.
    document.body.classList.toggle('dock-scrolled', DOCK_TOP - 28 - offset < 280);

    const w = TILE_W * FOCUS_SCALE + 2 * GLASS_PAD;
    const h = TILE_H * FOCUS_SCALE + 2 * GLASS_PAD;
    const x = dockTileLeft(i) + TILE_W / 2 - w / 2;
    const y = dockTileTop(i) + TILE_H / 2 - h / 2;
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
    if (inputsOpen && target !== inputsBtn && !inputRow.contains(target)) closeInputs(false);
    if (target && target.classList && target.classList.contains('app-tile') &&
        grid.contains(target)) {
      focusTile(target);
      return;
    }
    // Off the tiles (pills, inputs, channels): the highlight goes, the header
    // comes back, the glow stays on the last app.
    if (focusedTile) resetTilt(focusedTile);
    focusedTile = null;
    hideGlass();
    if (isPill(target)) document.body.classList.remove('dock-scrolled');
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

  // ---- Inputs pill: the inputs row as its dropdown ---------------------------

  function inputChips() {
    return Array.prototype.filter.call(inputRow.querySelectorAll('.focusable'), function (chip) {
      return !chip.disabled;
    });
  }

  function openInputs() {
    if (!inputChips().length) {
      if (opts.onToast) opts.onToast('No inputs to show — pick some in Settings → Inputs & channels');
      return;
    }
    const r = inputsBtn.getBoundingClientRect();
    inputRow.style.left = r.left + 'px';
    inputRow.style.top = (r.bottom + 20) + 'px';
    inputRow.style.minWidth = Math.max(r.width, 300) + 'px';
    inputsOpen = true;
    document.body.classList.add('dock-inputs-open');
    const chips = inputChips();
    const current = chips.filter(function (chip) { return chip.classList.contains('active'); })[0];
    focusEl(current || chips[0]);
  }

  function closeInputs(refocusPill) {
    if (!inputsOpen) return;
    inputsOpen = false;
    document.body.classList.remove('dock-inputs-open');
    if (refocusPill) focusEl(inputsBtn);
  }

  // Picking an input (or Channels) closes the dropdown; inputs.js switches.
  function onInputClick() {
    if (!on || !inputsOpen) return;
    closeInputs(true);
  }

  // ---- Wi-Fi pill ------------------------------------------------------------

  /** Shows the Wi-Fi network name when the TV reports it, else the connection type. */
  function watchNetwork() {
    if (wifiWatch || !(window.webOS && window.webOS.service)) return;
    try {
      wifiWatch = window.webOS.service.request('luna://com.palm.connectionmanager', {
        method: 'getStatus',
        parameters: {subscribe: true},
        onSuccess: function (res) {
          let text = 'Wi-Fi';
          if (res && res.wired && res.wired.state === 'connected') text = 'Ethernet';
          else if (res && res.wifi && res.wifi.state === 'connected') text = res.wifi.ssid || 'Wi-Fi';
          else if (res && res.isInternetConnectionAvailable === false) text = 'Offline';
          wifiLabel.textContent = text;
        },
        onFailure: function () { /* keep "Wi-Fi" */ }
      });
    } catch (err) {
      wifiWatch = null;
    }
  }

  // ---- remote ----------------------------------------------------------------

  /** The pill straight above a dock tile, by horizontal distance. */
  function pillAbove(tile) {
    const cx = tile.getBoundingClientRect().left + tile.getBoundingClientRect().width / 2;
    let best = null;
    let bestD = Infinity;
    pills.forEach(function (pill) {
      const r = pill.getBoundingClientRect();
      if (!r.width) return;
      const d = Math.abs(r.left + r.width / 2 - cx);
      if (d < bestD) {
        bestD = d;
        best = pill;
      }
    });
    return best || pills[0];
  }

  function channelStripOpen() {
    return !!(el.channelStrip && !el.channelStrip.hidden);
  }

  /**
   * Arrow keys the Dock layout steers itself (focus.js asks first): the
   * Inputs dropdown, Up from the dock to the pill above, and Down from a pill
   * back to the dock tile the remote came from. False: focus.js moves as usual.
   */
  function handleArrow(code, active) {
    if (!on || !active) return false;
    if (inputsOpen) {
      const chips = inputChips();
      const i = chips.indexOf(active);
      if (i < 0 && active !== inputsBtn) {
        closeInputs(false);
        return false;
      }
      if (code === REMOTE_KEY.UP) {
        if (i > 0) focusEl(chips[i - 1]);
        else closeInputs(true);
      } else if (code === REMOTE_KEY.DOWN) {
        if (i < chips.length - 1) focusEl(chips[i + 1]);
      } else {
        closeInputs(true);
      }
      return true;
    }
    // With the Channels strip open, Up and Down go through it (focus.js).
    if (channelStripOpen()) return false;
    if (code === REMOTE_KEY.UP && dockTiles().indexOf(active) >= 0) {
      return focusEl(pillAbove(active));
    }
    // The pills end at the screen edges (focus.js would carry on through the
    // grid in index order).
    if ((code === REMOTE_KEY.LEFT && active === pills[0]) ||
        (code === REMOTE_KEY.RIGHT && active === pills[pills.length - 1])) {
      return true;
    }
    if (code === REMOTE_KEY.DOWN && isPill(active)) {
      const back = lastDockTile && grid.contains(lastDockTile) ? lastDockTile : dockTiles()[0];
      return focusEl(back);
    }
    return false;
  }

  /** Back closes the Inputs dropdown. False when there was nothing to close. */
  function handleBack() {
    if (!on || !inputsOpen) return false;
    closeInputs(true);
    return true;
  }

  // ---- lifecycle -------------------------------------------------------------

  function apply(config) {
    const want = homeStyleOf(config) === 'dock';
    if (want === on) {
      if (on) layout();
      return;
    }
    on = want;
    document.body.classList.toggle('home-dock', on);
    if (on) {
      layout();
      watchNetwork();
      animateIn();
    } else {
      closeInputs(false);
      hideGlass();
      hideHero();
      focusedTile = null;
      offset = 0;
      document.body.classList.remove('dock-scrolled');
      inputRow.style.left = '';
      inputRow.style.top = '';
      inputRow.style.minWidth = '';
      unlayout();
    }
  }

  // Back from an app: replay the entrance and put the highlight on the tile.
  function onResume() {
    if (!on || document.hidden) return;
    closeInputs(false);
    animateIn();
  }

  inputsBtn.addEventListener('click', function () {
    if (inputsOpen) closeInputs(true);
    else openInputs();
  });
  wifiBtn.addEventListener('click', function () {
    if (opts.onOpenNetworkSettings) opts.onOpenNetworkSettings();
  });
  inputRow.addEventListener('click', onInputClick);
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
    isInputsOpen: function () { return inputsOpen; },
    handleArrow: handleArrow,
    handleBack: handleBack,
    /** The line above the clock, for the hour (0-23) it shows. */
    setGreeting: function (hour) {
      if (greeting) greeting.textContent = greetingFor(hour);
    }
  };
}
