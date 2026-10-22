import {afterEach, describe, expect, it} from 'vitest';
import {clockParts, clockTimeZone} from '../src/js/clock-format.js';

describe('clock time zone', () => {
  afterEach(() => {
    delete window.PalmSystem;
  });

  it('uses the chosen zone, else the TV\'s own', () => {
    expect(clockTimeZone({timezone: 'Europe/London'})).toBe('Europe/London');
    expect(clockTimeZone({timezone: ''})).toBe('');
    window.PalmSystem = {timeZone: 'America/Mexico_City'};
    expect(clockTimeZone({timezone: ''})).toBe('America/Mexico_City');
    expect(clockTimeZone({timezone: 'Asia/Tokyo'})).toBe('Asia/Tokyo');
    // 03:03 GMT is 21:03 the evening before in Mexico City.
    const parts = clockParts(new Date(Date.UTC(2026, 9, 22, 3, 3)), clockTimeZone({}), true);
    expect(parts).toEqual({time: '9:03', ampm: 'PM'});
  });
});
