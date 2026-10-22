import {afterEach, describe, expect, it} from 'vitest';
import {clockParts, clockTimeZone, setTvTimeZone, zonedClock} from '../src/js/clock-format.js';

describe('clock time zone', () => {
  afterEach(() => {
    setTvTimeZone(null);
  });

  it('uses the chosen zone, else the TV\'s own', () => {
    expect(clockTimeZone({timezone: 'Europe/London'})).toBe('Europe/London');
    expect(clockTimeZone({timezone: ''})).toBe('');
    setTvTimeZone({zone: 'America/Mexico_City', offset: -360});
    expect(clockTimeZone({timezone: ''})).toBe('America/Mexico_City');
    expect(clockTimeZone({timezone: 'Asia/Tokyo'})).toBe('Asia/Tokyo');
    // 03:03 GMT is 21:03 the evening before in Mexico City.
    const parts = clockParts(new Date(Date.UTC(2026, 9, 22, 3, 3)), clockTimeZone({}), true);
    expect(parts).toEqual({time: '9:03', ampm: 'PM'});
  });

  it('uses the TV\'s offset for its own zone, not the browser\'s zone rules', () => {
    // Even where the browser's rules still say daylight saving time.
    setTvTimeZone({zone: 'America/Mexico_City', offset: -360});
    const parts = clockParts(new Date(Date.UTC(2026, 6, 1, 3, 3)), 'America/Mexico_City', false);
    expect(parts).toEqual({time: '21:03', ampm: ''});
    expect(zonedClock(new Date(Date.UTC(2026, 6, 1, 3, 3)), 'America/Mexico_City').date.getUTCDate()).toBe(30);
    // Another zone keeps the browser's rules.
    expect(zonedClock(new Date(0), 'Europe/London').timeZone).toBe('Europe/London');
  });
});
