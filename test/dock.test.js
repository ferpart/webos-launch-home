import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {REMOTE_KEY} from '../src/js/remote.js';
import {
  createDockStyle,
  dockScrollOffset,
  dockTileLeft,
  dockTileTop,
  greetingFor,
  homeStyleOf
} from '../src/js/dock-style.js';
import {hsvToRgb, rgbToHsv, vividColor, NEUTRAL_GLOW} from '../src/js/dock-colors.js';
import {appBannerFor} from '../src/js/app-banners.js';
import {DEFAULT_CONFIG, configFromBackup} from '../src/js/config.js';

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
  it('puts four tiles per row, the dock first', () => {
    expect(dockTileLeft(0)).toBe(144);
    expect(dockTileLeft(3)).toBe(1416);
    expect(dockTileLeft(4)).toBe(144);
    expect(dockTileTop(0)).toBe(708);
    expect(dockTileTop(3)).toBe(708);
    // A gap below the dock, then a row every 292px.
    expect(dockTileTop(4)).toBe(1036);
    expect(dockTileTop(8)).toBe(1328);
  });

  it('scrolls just enough for the focused row, never for the dock', () => {
    expect(dockScrollOffset(2, 300)).toBe(0);
    expect(dockScrollOffset(5, 0)).toBe(248);
    expect(dockScrollOffset(9, 248)).toBe(540);
    // Back up a row: stays while it is still on screen, else only as far as it needs.
    expect(dockScrollOffset(5, 540)).toBe(540);
    expect(dockScrollOffset(5, 1000)).toBe(1036 - 24 - 80);
  });

  it('greets by the hour', () => {
    expect(greetingFor(3)).toBe('Good night');
    expect(greetingFor(9)).toBe('Good morning');
    expect(greetingFor(14)).toBe('Good afternoon');
    expect(greetingFor(20)).toBe('Good evening');
    expect(greetingFor(23)).toBe('Good night');
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
    expect(appBannerFor('com.example.none')).toBe('');
    expect(appBannerFor('')).toBe('');
  });
});

describe('dock remote handling', () => {
  let dock;
  let elements;
  const focusElement = vi.fn(function (el) {
    el.focus();
    return true;
  });

  function button(id, parent, cls) {
    const b = document.createElement('button');
    if (id) b.id = id;
    b.className = (cls || '') + ' focusable';
    parent.appendChild(b);
    return b;
  }

  beforeEach(() => {
    document.body.innerHTML = '';
    const app = document.createElement('div');
    app.id = 'app';
    document.body.appendChild(app);
    ['dock-hero', 'dock-glass', 'dock-band', 'dock-greeting', 'dock-ambient-a', 'dock-ambient-b']
      .forEach(function (id) {
        const d = document.createElement('div');
        d.id = id;
        app.appendChild(d);
      });
    const wifiLabel = document.createElement('span');
    wifiLabel.id = 'dock-wifi-label';
    app.appendChild(wifiLabel);
    const top = document.createElement('div');
    app.appendChild(top);
    const inputsBtn = button('dock-inputs-btn', top);
    button('dock-wifi-btn', top);
    const settingsBtn = button('app-settings-btn', top);
    const launcher = document.createElement('main');
    app.appendChild(launcher);
    const inputRow = document.createElement('nav');
    launcher.appendChild(inputRow);
    button('', inputRow, 'input-chip');
    button('', inputRow, 'input-chip active');
    const shell = document.createElement('div');
    launcher.appendChild(shell);
    const grid = document.createElement('section');
    shell.appendChild(grid);
    for (let i = 0; i < 6; i += 1) {
      const t = button('', grid, 'app-tile');
      t.setAttribute('aria-label', 'App ' + i);
    }
    elements = {
      app: app, launcher: launcher, appGridShell: shell, appGrid: grid,
      inputRow: inputRow, channelStrip: null, appSettingsBtn: settingsBtn, inputsBtn: inputsBtn
    };
    dock = createDockStyle({elements: elements, focusElement: focusElement, onToast: vi.fn()});
    dock.apply({launcher: {homeStyle: 'dock'}});
  });

  afterEach(() => {
    dock.apply({launcher: {homeStyle: 'classic'}});
    focusElement.mockClear();
  });

  it('lays the tiles out and shows the focused dock app\'s name', () => {
    const tiles = elements.appGrid.querySelectorAll('.app-tile');
    expect(document.body.classList.contains('home-dock')).toBe(true);
    expect(tiles[4].style.top).toBe('1036px');
    expect(tiles[0].classList.contains('dock-row')).toBe(true);
    expect(tiles[4].classList.contains('dock-row')).toBe(false);
    tiles[2].focus();
    expect(document.getElementById('dock-hero').textContent).toBe('App 2');
  });

  it('goes up from the dock to a pill and back down to the same tile', () => {
    const tiles = elements.appGrid.querySelectorAll('.app-tile');
    tiles[1].focus();
    expect(dock.handleArrow(REMOTE_KEY.UP, tiles[1])).toBe(true);
    const pill = document.activeElement;
    expect(pill.id).toMatch(/dock-|app-settings-btn/);
    expect(dock.handleArrow(REMOTE_KEY.DOWN, pill)).toBe(true);
    expect(document.activeElement).toBe(tiles[1]);
    // Grid rows are focus.js's own.
    expect(dock.handleArrow(REMOTE_KEY.UP, tiles[4])).toBe(false);
  });

  it('opens Inputs on the current input, steps through it and closes on Back', () => {
    const inputsBtn = document.getElementById('dock-inputs-btn');
    inputsBtn.focus();
    inputsBtn.click();
    const chips = elements.inputRow.querySelectorAll('.input-chip');
    expect(dock.isInputsOpen()).toBe(true);
    expect(document.activeElement).toBe(chips[1]);
    expect(dock.handleArrow(REMOTE_KEY.UP, chips[1])).toBe(true);
    expect(document.activeElement).toBe(chips[0]);
    expect(dock.handleBack()).toBe(true);
    expect(dock.isInputsOpen()).toBe(false);
    expect(document.activeElement).toBe(inputsBtn);
    expect(dock.handleBack()).toBe(false);
  });

  it('keeps the pills from wrapping into the grid', () => {
    const inputsBtn = document.getElementById('dock-inputs-btn');
    expect(dock.handleArrow(REMOTE_KEY.LEFT, inputsBtn)).toBe(true);
    expect(dock.handleArrow(REMOTE_KEY.RIGHT, elements.appSettingsBtn)).toBe(true);
  });

  it('takes everything off for Classic', () => {
    const tiles = elements.appGrid.querySelectorAll('.app-tile');
    dock.apply({launcher: {homeStyle: 'classic'}});
    expect(document.body.classList.contains('home-dock')).toBe(false);
    expect(tiles[4].style.top).toBe('');
    expect(dock.handleArrow(REMOTE_KEY.UP, tiles[0])).toBe(false);
  });
});
