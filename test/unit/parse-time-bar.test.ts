import { describe, it, expect } from 'vitest';
import { parseTimeBar } from '../../src/data/time/parse_time_bar';
import { Schedule, ScheduleEntry, TimeMode, Timeslot, TConditionLogicType, TRepeatType, TWeekday } from '../../src/types';
import { mockHass } from '../helpers/mock-hass';
import { actionSlot, fillerSlot } from '../helpers/slot-factory';

/** Build a minimal Schedule around some slots. */
const makeSchedule = (slots: Timeslot[]): Schedule => ({
  entries: [{ slots, weekdays: [TWeekday.Daily] } as ScheduleEntry],
  next_entries: [],
  timestamps: [],
  repeat_type: TRepeatType.Repeat,
  enabled: true,
});

/** Extract processed slots from the first entry. */
const processedSlots = (schedule: Schedule) => parseTimeBar(schedule, mockHass).entries[0].slots;

// ---------------------------------------------------------------------------
describe('parseTimeBar', () => {
  describe('filler insertion', () => {
    it('inserts filler at the beginning when first slot starts after 00:00', () => {
      const slots = [actionSlot('06:00:00', '12:00:00')];
      const result = processedSlots(makeSchedule(slots));
      // Should have a filler 00:00-06:00 before, the action slot, and a filler after 12:00-24:00
      expect(result.length).toBeGreaterThanOrEqual(3);
      expect(result[0].start).toBe('00:00:00');
      expect(result[0].stop).toBe('06:00:00');
      expect(result[0].actions.length).toBe(0);
    });

    it('inserts filler at the end when last slot stops before 24:00', () => {
      const slots = [actionSlot('00:00:00', '18:00:00')];
      const result = processedSlots(makeSchedule(slots));
      const last = result[result.length - 1];
      expect(last.start).toBe('18:00:00');
      expect(last.actions.length).toBe(0);
    });

    it('inserts fillers in gaps between non-adjacent slots', () => {
      const slots = [
        actionSlot('06:00:00', '08:00:00'),
        actionSlot('10:00:00', '12:00:00'),
      ];
      const result = processedSlots(makeSchedule(slots));
      // Find the filler between 08:00 and 10:00
      const gap = result.find(s => s.start === '08:00:00' && s.stop === '10:00:00' && s.actions.length === 0);
      expect(gap).toBeDefined();
    });

    it('no extra fillers when slots already cover 00:00-24:00', () => {
      const slots = [
        actionSlot('00:00:00', '12:00:00'),
        actionSlot('12:00:00', '00:00:00'),
      ];
      const result = processedSlots(makeSchedule(slots));
      // Only the two action slots — 00:00:00 maps to 24h for stop
      expect(result.filter(s => s.actions.length > 0).length).toBe(2);
    });
  });

  describe('slot sorting', () => {
    it('sorts slots by start time', () => {
      const slots = [
        actionSlot('18:00:00', '00:00:00'),
        actionSlot('06:00:00', '12:00:00'),
        actionSlot('12:00:00', '18:00:00'),
      ];
      const result = processedSlots(makeSchedule(slots));
      const actionSlots = result.filter(s => s.actions.length > 0);
      // The action slots should be in time order
      expect(actionSlots[0].start).toBe('06:00:00');
      expect(actionSlots[1].start).toBe('12:00:00');
    });
  });

  describe('minimum duration enforcement', () => {
    it('enforces a minimum 1-minute duration on short slots', () => {
      // Create a slot with start=stop (0 duration)
      const slots = [actionSlot('10:00:00', '10:00:00')];
      const result = processedSlots(makeSchedule(slots));
      // The action slot should have been expanded to 10:00-10:01
      const actionSlotResult = result.find(s => s.actions.length > 0);
      expect(actionSlotResult).toBeDefined();
      expect(actionSlotResult!.stop).toBe('10:01:00');
    });
  });

  describe('start/stop flip correction', () => {
    it('flips start and stop when start > stop (non-midnight)', () => {
      // A slot with start=14:00, stop=08:00 should be flipped
      const slots = [actionSlot('14:00:00', '08:00:00')];
      const result = processedSlots(makeSchedule(slots));
      // Should be corrected to 08:00-14:00
      const actionSlotResult = result.find(s => s.actions.length > 0);
      expect(actionSlotResult).toBeDefined();
      expect(actionSlotResult!.start).toBe('08:00:00');
      expect(actionSlotResult!.stop).toBe('14:00:00');
    });

    it('maps stop=00:00:00 to 24:00 when start > stop', () => {
      // stop of 00:00:00 with start > 0 means end-of-day
      const slots = [actionSlot('20:00:00', '00:00:00')];
      const result = processedSlots(makeSchedule(slots));
      const actionSlotResult = result.find(s => s.actions.length > 0);
      expect(actionSlotResult).toBeDefined();
      // The stop should now represent 24:00
      expect(actionSlotResult!.start).toBe('20:00:00');
    });
  });

  describe('checkpoint slot handling', () => {
    it('advances startTime by 1 minute after a checkpoint slot', () => {
      // A checkpoint (no stop) at 10:00 — the following filler must start at 10:01
      const slots: Timeslot[] = [
        { ...actionSlot('10:00:00', undefined) }, // checkpoint
        actionSlot('14:00:00', '18:00:00'),
      ];
      const result = processedSlots(makeSchedule(slots));
      // Filler between checkpoint end (10:01) and next action (14:00)
      const filler = result.find(
        s => s.start === '10:01:00' && s.stop === '14:00:00' && s.actions.length === 0
      );
      expect(filler).toBeDefined();
    });

    it('inserts leading filler before a non-zero-start checkpoint', () => {
      const slots: Timeslot[] = [
        { ...actionSlot('08:00:00', undefined) },
      ];
      const result = processedSlots(makeSchedule(slots));
      // Should have a filler 00:00-08:00 at the start
      expect(result[0].start).toBe('00:00:00');
      expect(result[0].stop).toBe('08:00:00');
      expect(result[0].actions.length).toBe(0);
    });
  });

  describe('edge cases', () => {
    it('handles a sunrise-offset slot correctly', () => {
      // sunrise at 06:30, sunrise-07:00 → addTimeOffset wraps to 23:30 (Fixed mode wrap)
      const slots: Timeslot[] = [
        {
          start: 'sunrise-01:00:00',
          stop: '12:00:00',
          actions: [{ service: 'light.turn_on', service_data: {}, target: { entity_id: 'light.test' } }],
          conditions: { type: TConditionLogicType.Or, items: [], track_changes: false },
        },
      ];
      const result = processedSlots(makeSchedule(slots));
      // sunrise-01:00 resolves to 05:30, so action slot should start at sunrise-01:00:00
      const actionSlotResult = result.find(s => s.actions.length > 0);
      expect(actionSlotResult).toBeDefined();
      // There should be a leading filler from 00:00 to the sunrise-offset time
      expect(result[0].actions.length).toBe(0);
      expect(result[0].start).toBe('00:00:00');
    });

    it('handles single slot covering full day', () => {
      const slots = [actionSlot('00:00:00', '00:00:00')];
      const result = processedSlots(makeSchedule(slots));
      // stop=00:00:00 when start=00:00:00 maps stop to 24:00 (end of day)
      const actionSlotResult = result.find(s => s.actions.length > 0);
      expect(actionSlotResult).toBeDefined();
    });
  });
});
