import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {REMOTE_KEY} from '../src/js/remote.js';
import {
  createDockStyle,
  dockColumnsOf,
  dockGeometry,
  dockScrollOffset,
  dockTileLeft,
  dockTileTop,
  homeStyleOf,
  noteRecentApp,
  orderByRecent
} from '../src/js/dock-style.js';
import {hsvToRgb, rgbToHsv, vividColor, NEUTRAL_GLOW} from '../src/js/dock-colors.js';
import {appBannerFor} from '../src/js/app-banners.js';
import {DEFAULT_CONFIG, configFromBackup} from '../src/js/config.js';

// jsdom without a page URL has no localStorage: a small one in memory.
if (typeof localStorage === 'undefined') {
  const store = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: (k) => { store.delete(k); }
  });
}

describe('home style setting', () => {
  it('is Dock unless Classic was chosen', () => {
    expect(homeStyleOf({launcher: {}})).toBe('dock');
    expect(homeStyleOf({launcher: {homeStyle: 'dock'}})).toBe('dock');
    expect(homeStyleOf({launcher: {homeStyle: 'classic'}})).toBe('classic');
    expect(homeStyleOf({launcher: {homeStyle: 'nonsense'}})).toBe('dock');
    expect(homeStyleOf(null)).toBe('dock');
  });

  it('defaults to Dock and survives a backup restore', () => {
    expect(DEFAULT_CONFIG.launcher.homeStyle).toBe('dock');
    const backup = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
    backup.launcher.homeStyle = 'classic';
    const restored = configFromBackup(backup, DEFAULT_CONFIG);
    expect(restored.config.launcher.homeStyle).toBe('classic');
    expect(restored.skipped).toEqual([]);
  });

  it('restores an older backup without it as Dock', () => {
    const backup = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
    delete backup.launcher.homeStyle;
    expect(configFromBackup(backup, DEFAULT_CONFIG).config.launcher.homeStyle).toBe('dock');
  });
});

describe('dock layout', () => {
  const four = dockGeometry(4);

  it('reads apps per row, 3 to 6, four by default', () => {
    expect(dockColumnsOf({launcher: {}})).toBe(4);
    expect(dockColumnsOf({launcher: {dockColumns: 6}})).toBe(6);
    expect(dockColumnsOf({launcher: {dockColumns: '5'}})).toBe(5);
    expect(dockColumnsOf({launcher: {dockColumns: 9}})).toBe(4);
    expect(DEFAULT_CONFIG.launcher.dockColumns).toBe(4);
  });

  it('puts the dock first, then rows below', () => {
    expect(four.tileW).toBe(360);
    expect(four.tileH).toBe(202);
    expect(dockTileLeft(0, four)).toBe(144);
    expect(dockTileLeft(3, four)).toBe(1416);
    expect(dockTileLeft(4, four)).toBe(144);
    expect(dockTileTop(0, four)).toBe(708);
    expect(dockTileTop(3, four)).toBe(708);
    // A gap below the dock, then a row every 292px.
    expect(dockTileTop(4, four)).toBe(1036);
    expect(dockTileTop(8, four)).toBe(1328);
  });

  it('shrinks tiles to fit more across, keeping 16:9 and the dock\'s bottom edge', () => {
    [3, 5, 6].forEach(function (n) {
      const g = dockGeometry(n);
      expect(Math.abs(g.tileW / g.tileH - 360 / 202)).toBeLessThan(0.02);
      expect(g.dockTop + g.tileH).toBe(910);
      // The row is centred inside the side margins.
      const left = dockTileLeft(0, g);
      const right = 1920 - (dockTileLeft(n - 1, g) + g.tileW);
      expect(left).toBeGreaterThanOrEqual(112);
      expect(Math.abs(left - right)).toBeLessThan(1);
    });
    expect(dockGeometry(6).tileW).toBeLessThan(dockGeometry(5).tileW);
    expect(dockTileTop(6, dockGeometry(6))).toBeGreaterThan(dockTileTop(5, dockGeometry(6)));
  });

  it('scrolls just enough for the focused row, never for the dock', () => {
    expect(dockScrollOffset(2, 300, four)).toBe(0);
    expect(dockScrollOffset(5, 0, four)).toBe(248);
    expect(dockScrollOffset(9, 248, four)).toBe(540);
    // Back up a row: stays while it is still on screen, else only as far as it needs.
    expect(dockScrollOffset(5, 540, four)).toBe(540);
    expect(dockScrollOffset(5, 1000, four)).toBe(1036 - 24 - 80);
  });
});

describe('recently used dock', () => {
  const tile = (id) => ({id: id});
  const idOf = (t) => t.id;

  it('puts the latest apps first, as many as the dock holds, the rest pinned', () => {
    const pinned = ['netflix', 'amazon', 'youtube.leanback.v4', 'crunchyroll', 'disney', 'max'].map(tile);
    const out = orderByRecent(pinned, ['max', 'youtube.leanback.v4', 'gone.app', 'max'], 4, idOf);
    expect(out.map(idOf)).toEqual(['max', 'youtube.leanback.v4', 'netflix', 'amazon', 'crunchyroll', 'disney']);
  });

  it('matches an app by any of its ids', () => {
    const out = orderByRecent([tile('netflix'), tile('amazon.html')], ['amazon'], 4, idOf);
    expect(out.map(idOf)).toEqual(['amazon.html', 'netflix']);
  });

  it('remembers the latest first, once each', () => {
    localStorage.removeItem('lounge.dock.recent');
    noteRecentApp('netflix');
    noteRecentApp('youtube.leanback.v4');
    noteRecentApp('netflix');
    expect(JSON.parse(localStorage.getItem('lounge.dock.recent'))).toEqual(['netflix', 'youtube.leanback.v4']);
    localStorage.removeItem('lounge.dock.recent');
  });
});

describe('dock colours', () => {
  it('round-trips HSV', () => {
    [[229, 9, 20], [0, 168, 225], [40, 40, 40]].forEach(function (c) {
      expect(hsvToRgb(rgbToHsv(c))).toEqual(c);
    });
  });

  it('picks the most vivid pixel and skips transparent ones', () => {
    const px = [
      255, 255, 255, 255,
      229, 9, 20, 255,
      0, 255, 0, 10
    ];
    const c = vividColor(px);
    expect(c[0]).toBeGreaterThan(200);
    expect(c[1]).toBeLessThan(40);
  });

  it('lifts a monochrome icon and falls back for an empty one', () => {
    const grey = vividColor([20, 20, 20, 255, 30, 30, 30, 255]);
    expect(rgbToHsv(grey)[2]).toBeGreaterThanOrEqual(0.54);
    expect(vividColor([0, 0, 0, 0])).toEqual(NEUTRAL_GLOW);
  });
});

describe('app banners', () => {
  it('finds a banner by any of the app ids', () => {
    expect(appBannerFor('netflix')).toBe('assets/app-banners/netflix.jpg');
    expect(appBannerFor('amazon.html')).toBe('assets/app-banners/prime-video.jpg');
    expect(appBannerFor('amazon')).toBe('assets/app-banners/prime-video.jpg');
    expect(appBannerFor('com.tvweb.dashboard')).toBe('assets/app-banners/glasshouse.jpg');
    expect(appBannerFor('com.example.none')).toBe('');
    expect(appBannerFor('')).toBe('');
  });
});

describe('dock remote handling', () => {
  let dock;
  let elements;
  let classicParent;
  const onOpenSettings = vi.fn();
  const onOpenTvSettings = vi.fn();
  const focusElement = vi.fn(function (el) {
    el.focus();
    return true;
  });

  function make(tag, id, parent, cls) {
    const node = document.createElement(tag);
    if (id) node.id = id;
    if (cls) node.className = cls;
    parent.appendChild(node);
    return node;
  }

  beforeEach(() => {
    document.body.innerHTML = '';
    const app = make('div', 'app', document.body);
    ['dock-hero', 'dock-glass', 'dock-band', 'dock-ambient-a', 'dock-ambient-b']
      .forEach(function (id) { make('div', id, app); });
    const top = make('header', '', app);
    make('button', 'dock-menu-btn', top, 'focusable');
    make('span', 'dock-menu-time', top);
    const menu = make('div', 'dock-menu', top);
    make('div', 'dock-menu-date', menu);
    make('div', 'dock-menu-inputs', menu);
    make('button', 'dock-menu-settings', menu, 'focusable');
    make('button', 'dock-menu-tv', menu, 'focusable');
    const launcher = make('main', '', app);
    classicParent = launcher;
    const inputRow = make('nav', 'input-row', launcher);
    make('button', '', inputRow, 'input-chip focusable');
    make('button', '', inputRow, 'input-chip active focusable');
    const shell = make('div', '', launcher);
    const grid = make('section', '', shell);
    for (let i = 0; i < 6; i += 1) {
      make('button', '', grid, 'app-tile focusable').setAttribute('aria-label', 'App ' + i);
    }
    make('button', '', grid, 'app-tile settings-tile focusable');
    elements = {
      app: app, launcher: launcher, appGridShell: shell, appGrid: grid,
      inputRow: inputRow, channelStrip: null
    };
    dock = createDockStyle({
      elements: elements,
      focusElement: focusElement,
      onOpenSettings: onOpenSettings,
      onOpenTvSettings: onOpenTvSettings,
      onToast: vi.fn()
    });
    dock.apply({launcher: {homeStyle: 'dock'}});
  });

  afterEach(() => {
    dock.apply({launcher: {homeStyle: 'classic'}});
    focusElement.mockClear();
    onOpenSettings.mockClear();
    onOpenTvSettings.mockClear();
  });

  function tile(i) {
    return elements.appGrid.querySelectorAll('.app-tile')[i];
  }

  it('lays the tiles out and shows the focused dock app\'s name', () => {
    expect(document.body.classList.contains('home-dock')).toBe(true);
    expect(tile(4).style.top).toBe('1036px');
    expect(tile(0).classList.contains('dock-row')).toBe(true);
    expect(tile(4).classList.contains('dock-row')).toBe(false);
    // TV Settings is in the menu, not the grid.
    expect(tile(6).style.top).toBe('');
    tile(2).focus();
    expect(document.getElementById('dock-hero').textContent).toBe('App 2');
  });

  it('fills the dock with the apps opened last when the home screen comes back', () => {
    for (let i = 0; i < 6; i += 1) tile(i).dataset.appId = 'app' + i;
    localStorage.setItem('lounge.dock.recent', JSON.stringify(['app5', 'app4']));
    dock.apply({launcher: {homeStyle: 'dock', dockOrder: 'recent'}});
    expect(tile(5).style.left).toBe('144px');
    expect(tile(5).classList.contains('dock-row')).toBe(true);
    // Left and Right follow the order shown.
    tile(5).focus();
    dock.handleArrow(REMOTE_KEY.RIGHT, tile(5));
    expect(document.activeElement).toBe(tile(4));
    dock.apply({launcher: {homeStyle: 'dock', dockOrder: 'pinned'}});
    expect(tile(0).style.left).toBe('144px');
    localStorage.removeItem('lounge.dock.recent');
  });

  it('re-lays out for another number of apps per row', () => {
    dock.apply({launcher: {homeStyle: 'dock', dockColumns: 6}});
    expect(tile(5).classList.contains('dock-row')).toBe(true);
    expect(tile(5).style.top).toBe(tile(0).style.top);
  });

  it('shows the time on the clock and the date in its menu', () => {
    dock.setClock({time: '9:41', ampm: 'PM'}, 'Wednesday 21 October');
    expect(document.getElementById('dock-menu-time').textContent).toBe('9:41PM');
    expect(document.getElementById('dock-menu-date').textContent).toBe('Wednesday 21 October');
  });

  it('goes up from the dock to the clock and back down to the same tile', () => {
    const clock = document.getElementById('dock-menu-btn');
    tile(1).focus();
    expect(dock.handleArrow(REMOTE_KEY.UP, tile(1))).toBe(true);
    expect(document.activeElement).toBe(clock);
    // Nothing beside the clock.
    expect(dock.handleArrow(REMOTE_KEY.LEFT, clock)).toBe(true);
    expect(dock.handleArrow(REMOTE_KEY.RIGHT, clock)).toBe(true);
    expect(dock.handleArrow(REMOTE_KEY.DOWN, clock)).toBe(true);
    expect(document.activeElement).toBe(tile(1));
    // Grid rows are focus.js's own.
    expect(dock.handleArrow(REMOTE_KEY.UP, tile(4))).toBe(false);
  });

  it('opens the menu on the current input, with the inputs inside it', () => {
    const clock = document.getElementById('dock-menu-btn');
    expect(elements.inputRow.parentNode.id).toBe('dock-menu-inputs');
    clock.focus();
    clock.click();
    const chips = elements.inputRow.querySelectorAll('.input-chip');
    expect(dock.isMenuOpen()).toBe(true);
    expect(document.activeElement).toBe(chips[1]);
    dock.handleArrow(REMOTE_KEY.DOWN, chips[1]);
    expect(document.activeElement.id).toBe('dock-menu-settings');
    dock.handleArrow(REMOTE_KEY.DOWN, document.activeElement);
    expect(document.activeElement.id).toBe('dock-menu-tv');
    expect(dock.handleBack()).toBe(true);
    expect(dock.isMenuOpen()).toBe(false);
    expect(document.activeElement).toBe(clock);
    expect(dock.handleBack()).toBe(false);
  });

  it('opens Settings and TV Settings from the menu', () => {
    document.getElementById('dock-menu-btn').click();
    document.getElementById('dock-menu-settings').click();
    expect(onOpenSettings).toHaveBeenCalled();
    expect(dock.isMenuOpen()).toBe(false);
    document.getElementById('dock-menu-btn').click();
    document.getElementById('dock-menu-tv').click();
    expect(onOpenTvSettings).toHaveBeenCalled();
  });

  it('takes everything off for Classic, inputs back in place', () => {
    dock.apply({launcher: {homeStyle: 'classic'}});
    expect(document.body.classList.contains('home-dock')).toBe(false);
    expect(tile(4).style.top).toBe('');
    expect(elements.inputRow.parentNode).toBe(classicParent);
    expect(dock.handleArrow(REMOTE_KEY.UP, tile(0))).toBe(false);
  });
});
