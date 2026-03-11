import { describe, it, expect } from 'vitest';
import { roundTime } from '../../src/data/time/round_time';
import { parseTimeString } from '../../src/data/time/parse_time_string';
import { timeToString } from '../../src/data/time/time_to_string';
import { addTimeOffset } from '../../src/data/time/add_time_offset';
import { computeTimestamp } from '../../src/data/time/compute_timestamp';
import { TimeMode } from '../../src/types';
import { mockHass } from '../helpers/mock-hass';

// ---------------------------------------------------------------------------
// roundTime
// ---------------------------------------------------------------------------
describe('roundTime', () => {
  it('returns the same time when already aligned to stepSize', () => {
    expect(roundTime({ hours: 10, minutes: 30 }, 15)).toEqual({ hours: 10, minutes: 30 });
  });

  it('rounds minutes to nearest stepSize', () => {
    expect(roundTime({ hours: 10, minutes: 7 }, 15)).toEqual({ hours: 10, minutes: 0 });
    expect(roundTime({ hours: 10, minutes: 8 }, 15)).toEqual({ hours: 10, minutes: 15 });
    expect(roundTime({ hours: 10, minutes: 22 }, 15)).toEqual({ hours: 10, minutes: 15 });
    expect(roundTime({ hours: 10, minutes: 23 }, 15)).toEqual({ hours: 10, minutes: 30 });
  });

  it('handles seconds overflow into minutes', () => {
    // 10:00:45 → 10:01 (seconds contribute to the total)
    const result = roundTime({ hours: 10, minutes: 0, seconds: 45 }, 1);
    expect(result.hours).toBe(10);
    expect(result.minutes).toBe(1);
  });

  it('handles minutes overflow to next hour', () => {
    // 53 → round(53/15)*15 = round(3.53)*15 = 4*15 = 60 → overflow → 11:00
    expect(roundTime({ hours: 10, minutes: 53 }, 15)).toEqual({ hours: 11, minutes: 0 });
    expect(roundTime({ hours: 10, minutes: 58 }, 15)).toEqual({ hours: 11, minutes: 0 });
    // 52 → round(52/15)*15 = round(3.47)*15 = 3*15 = 45
    expect(roundTime({ hours: 10, minutes: 52 }, 15)).toEqual({ hours: 10, minutes: 45 });
  });

  it('preserves negative sign for sunrise/sunset offsets', () => {
    const result = roundTime({ hours: -1, minutes: -30 }, 15);
    expect(result.hours).toBe(-1);
    expect(result.minutes).toBe(30); // sign carried by hours
  });

  it('preserves negative sign when hours are 0', () => {
    const result = roundTime({ hours: 0, minutes: -20 }, 15);
    expect(result.hours).toBe(0);
    expect(result.minutes).toBe(-15);
  });

  it('stepSize 1 keeps each minute unchanged', () => {
    expect(roundTime({ hours: 5, minutes: 37 }, 1)).toEqual({ hours: 5, minutes: 37 });
  });

  it('defaults to stepSize=1 when not given', () => {
    expect(roundTime({ hours: 12, minutes: 45 })).toEqual({ hours: 12, minutes: 45 });
  });
});

// ---------------------------------------------------------------------------
// parseTimeString
// ---------------------------------------------------------------------------
describe('parseTimeString', () => {
  it('parses a fixed time "HH:MM:SS"', () => {
    const t = parseTimeString('14:30:00');
    expect(t).toEqual({ mode: TimeMode.Fixed, hours: 14, minutes: 30 });
  });

  it('parses midnight "00:00:00"', () => {
    const t = parseTimeString('00:00:00');
    expect(t).toEqual({ mode: TimeMode.Fixed, hours: 0, minutes: 0 });
  });

  it('parses "23:59:00"', () => {
    const t = parseTimeString('23:59:00');
    expect(t).toEqual({ mode: TimeMode.Fixed, hours: 23, minutes: 59 });
  });

  it('parses sunrise with positive offset', () => {
    const t = parseTimeString('sunrise+01:30:00');
    expect(t).toEqual({ mode: TimeMode.Sunrise, hours: 1, minutes: 30 });
  });

  it('parses sunrise with negative offset', () => {
    const t = parseTimeString('sunrise-00:45:00');
    expect(t).toEqual({ mode: TimeMode.Sunrise, hours: 0, minutes: -45 });
  });

  it('parses sunset with positive offset', () => {
    const t = parseTimeString('sunset+02:00:00');
    expect(t).toEqual({ mode: TimeMode.Sunset, hours: 2, minutes: 0 });
  });

  it('parses sunset with negative offset', () => {
    const t = parseTimeString('sunset-01:15:00');
    expect(t).toEqual({ mode: TimeMode.Sunset, hours: -1, minutes: -15 });
  });

  it('parses "sunrise+00:00:00" as zero offset', () => {
    const t = parseTimeString('sunrise+00:00:00');
    expect(t).toEqual({ mode: TimeMode.Sunrise, hours: 0, minutes: 0 });
  });
});

// ---------------------------------------------------------------------------
// timeToString
// ---------------------------------------------------------------------------
describe('timeToString', () => {
  it('formats fixed time with seconds', () => {
    const s = timeToString({ mode: TimeMode.Fixed, hours: 9, minutes: 5 });
    expect(s).toBe('09:05:00');
  });

  it('formats fixed time without seconds', () => {
    const s = timeToString({ mode: TimeMode.Fixed, hours: 14, minutes: 30 }, { seconds: false });
    expect(s).toBe('14:30');
  });

  it('pads single-digit hours and minutes', () => {
    expect(timeToString({ mode: TimeMode.Fixed, hours: 1, minutes: 2 })).toBe('01:02:00');
  });

  it('wraps hours >= 24 to 0', () => {
    const s = timeToString({ mode: TimeMode.Fixed, hours: 24, minutes: 0 });
    expect(s).toBe('00:00:00');
  });

  it('formats sunrise positive offset', () => {
    const s = timeToString({ mode: TimeMode.Sunrise, hours: 1, minutes: 30 });
    expect(s).toBe('sunrise+01:30:00');
  });

  it('formats sunrise negative offset', () => {
    const s = timeToString({ mode: TimeMode.Sunrise, hours: -1, minutes: -15 });
    expect(s).toBe('sunrise-01:15:00');
  });

  it('formats sunset negative offset', () => {
    const s = timeToString({ mode: TimeMode.Sunset, hours: 0, minutes: -30 });
    expect(s).toBe('sunset-00:30:00');
  });

  it('formats sunset positive offset without seconds', () => {
    const s = timeToString({ mode: TimeMode.Sunset, hours: 2, minutes: 0 }, { seconds: false });
    expect(s).toBe('sunset+02:00');
  });
});

// ---------------------------------------------------------------------------
// addTimeOffset
// ---------------------------------------------------------------------------
describe('addTimeOffset', () => {
  it('adds positive offset to a fixed time', () => {
    const result = addTimeOffset({ mode: TimeMode.Fixed, hours: 10, minutes: 0 }, { hours: 1, minutes: 30 });
    expect(result).toEqual({ mode: TimeMode.Fixed, hours: 11, minutes: 30 });
  });

  it('subtracts time with negative offset', () => {
    const result = addTimeOffset({ mode: TimeMode.Fixed, hours: 10, minutes: 30 }, { hours: -1, minutes: -15 });
    expect(result).toEqual({ mode: TimeMode.Fixed, hours: 9, minutes: 15 });
  });

  it('handles minutes overflow (>=60)', () => {
    const result = addTimeOffset({ mode: TimeMode.Fixed, hours: 10, minutes: 45 }, { minutes: 20 });
    expect(result).toEqual({ mode: TimeMode.Fixed, hours: 11, minutes: 5 });
  });

  it('handles minutes underflow (<0) in fixed mode', () => {
    const result = addTimeOffset({ mode: TimeMode.Fixed, hours: 10, minutes: 10 }, { minutes: -20 });
    expect(result).toEqual({ mode: TimeMode.Fixed, hours: 9, minutes: 50 });
  });

  it('wraps around midnight backwards in fixed mode', () => {
    const result = addTimeOffset({ mode: TimeMode.Fixed, hours: 0, minutes: 30 }, { hours: -1, minutes: 0 });
    expect(result).toEqual({ mode: TimeMode.Fixed, hours: 23, minutes: 30 });
  });

  it('wraps around midnight forwards in fixed mode', () => {
    const result = addTimeOffset({ mode: TimeMode.Fixed, hours: 23, minutes: 30 }, { hours: 1, minutes: 0 });
    expect(result).toEqual({ mode: TimeMode.Fixed, hours: 0, minutes: 30 });
  });

  it('preserves TimeMode through offset', () => {
    const result = addTimeOffset({ mode: TimeMode.Sunrise, hours: 1, minutes: 0 }, { minutes: 15 });
    expect(result.mode).toBe(TimeMode.Sunrise);
  });

  it('offset of zero returns same time', () => {
    const t = { mode: TimeMode.Fixed, hours: 12, minutes: 0 };
    const result = addTimeOffset(t, { hours: 0, minutes: 0 });
    expect(result).toEqual(t);
  });
});

// ---------------------------------------------------------------------------
// computeTimestamp
// ---------------------------------------------------------------------------
describe('computeTimestamp', () => {
  it('converts fixed time to seconds since midnight', () => {
    expect(computeTimestamp({ mode: TimeMode.Fixed, hours: 1, minutes: 0 }, mockHass)).toBe(3600);
    expect(computeTimestamp({ mode: TimeMode.Fixed, hours: 0, minutes: 0 }, mockHass)).toBe(0);
    expect(computeTimestamp({ mode: TimeMode.Fixed, hours: 12, minutes: 30 }, mockHass)).toBe(45000);
  });

  it('accepts a time string directly', () => {
    expect(computeTimestamp('14:30:00', mockHass)).toBe(14 * 3600 + 30 * 60);
  });

  it('computes sunrise with zero offset using mock sunrise 06:30', () => {
    // sunrise reference = 06:30 → 23400 seconds
    const ts = computeTimestamp({ mode: TimeMode.Sunrise, hours: 0, minutes: 0 }, mockHass);
    expect(ts).toBe(6 * 3600 + 30 * 60); // 23400
  });

  it('computes sunrise with +1h offset', () => {
    const ts = computeTimestamp({ mode: TimeMode.Sunrise, hours: 1, minutes: 0 }, mockHass);
    expect(ts).toBe(7 * 3600 + 30 * 60); // 27000
  });

  it('computes sunset with zero offset using mock sunset 20:15', () => {
    const ts = computeTimestamp({ mode: TimeMode.Sunset, hours: 0, minutes: 0 }, mockHass);
    expect(ts).toBe(20 * 3600 + 15 * 60); // 72900
  });

  it('computes sunset with -30min offset', () => {
    const ts = computeTimestamp({ mode: TimeMode.Sunset, hours: 0, minutes: -30 }, mockHass);
    expect(ts).toBe(19 * 3600 + 45 * 60); // 71100
  });
});
