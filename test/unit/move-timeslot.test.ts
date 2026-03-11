import { describe, it, expect } from 'vitest';
import { moveTimeslot } from '../../src/data/schedule/move_timeslot';
import { TimeMode, Timeslot, TConditionLogicType } from '../../src/types';
import { mockHass } from '../helpers/mock-hass';
import { actionSlot, fillerSlot } from '../helpers/slot-factory';

// Helpers for readability
const fixedTime = (hours: number, minutes: number) => ({
  mode: TimeMode.Fixed,
  hours,
  minutes,
});

// ---------------------------------------------------------------------------
// moveTimeslot
// ---------------------------------------------------------------------------
describe('moveTimeslot', () => {
  describe('basic start-time movement', () => {
    it('moves start time of a slot forward', () => {
      const slots: Timeslot[] = [
        actionSlot('06:00:00', '12:00:00'),
        fillerSlot('12:00:00', '18:00:00'),
        actionSlot('18:00:00', '00:00:00'),
      ];
      const [result, idx] = moveTimeslot(slots, 1, { start: fixedTime(13, 0) }, mockHass);
      // The moved slot should start at 13:00
      expect(result[idx].start).toBe('13:00:00');
    });

    it('moves start time of a slot backward', () => {
      const slots: Timeslot[] = [
        fillerSlot('00:00:00', '10:00:00'),
        actionSlot('10:00:00', '20:00:00'),
        fillerSlot('20:00:00', '00:00:00'),
      ];
      const [result, idx] = moveTimeslot(slots, 1, { start: fixedTime(8, 0) }, mockHass);
      expect(result[idx].start).toBe('08:00:00');
    });
  });

  describe('boundary capping', () => {
    it('caps newTime to lower limit when moved too far back', () => {
      // slot[0] has actions → lower limit for slot[1] is slot[0].start + 1min
      const slots: Timeslot[] = [
        actionSlot('06:00:00', '12:00:00'),
        fillerSlot('12:00:00', '18:00:00'),
        actionSlot('18:00:00', '00:00:00'),
      ];
      // Try to move slot[1] start to 05:00 (below slot[0] start+1min = 06:01)
      const [result, idx] = moveTimeslot(slots, 1, { start: fixedTime(5, 0) }, mockHass);
      expect(result[idx].start).toBe('06:01:00');
    });

    it('caps newTime to upper limit when moved too far forward', () => {
      // slot[1] has a stop at 18:00 → upper limit is stop - 1min = 17:59
      const slots: Timeslot[] = [
        fillerSlot('00:00:00', '10:00:00'),
        actionSlot('10:00:00', '18:00:00'),
        fillerSlot('18:00:00', '00:00:00'),
      ];
      // Try to move slot[1] start to 19:00 (above 17:59)
      const [result, idx] = moveTimeslot(slots, 1, { start: fixedTime(19, 0) }, mockHass);
      expect(result[idx].start).toBe('17:59:00');
    });
  });

  describe('overlap handling', () => {
    it('shortens overlapped previous slot when moving backward', () => {
      const slots: Timeslot[] = [
        actionSlot('00:00:00', '12:00:00'),
        actionSlot('12:00:00', '00:00:00'),
      ];
      const [result, _idx] = moveTimeslot(slots, 1, { start: fixedTime(10, 0) }, mockHass);
      // Previous slot should be shortened to end at 10:00
      const prev = result.find(s => s.start === '00:00:00' && s.actions.length > 0);
      expect(prev?.stop).toBe('10:00:00');
    });
  });

  describe('filler insertion', () => {
    it('stretches previous filler when moving start forward', () => {
      const slots: Timeslot[] = [
        fillerSlot('00:00:00', '10:00:00'),
        actionSlot('10:00:00', '20:00:00'),
        fillerSlot('20:00:00', '00:00:00'),
      ];
      const [result, idx] = moveTimeslot(slots, 1, { start: fixedTime(12, 0) }, mockHass);
      // Action slot now starts at 12:00
      expect(result[idx].start).toBe('12:00:00');
      // Previous filler (has stop) gets stretched to cover 00:00-12:00
      const prevFiller = result.find(s => s.start === '00:00:00' && s.actions.length === 0);
      expect(prevFiller).toBeDefined();
      expect(prevFiller!.stop).toBe('12:00:00');
    });
  });

  describe('stop time redirect', () => {
    it('moving stop time updates the next slot start', () => {
      const slots: Timeslot[] = [
        actionSlot('00:00:00', '12:00:00'),
        fillerSlot('12:00:00', '00:00:00'),
      ];
      const [result, idx] = moveTimeslot(slots, 0, { stop: fixedTime(14, 0) }, mockHass);
      // When updating stop, the function delegates to moveTimeslot(slots, slotIdx+1, {start: stop})
      // and returns slotIdxOut - 1, so idx should be 0
      expect(idx).toBe(0);
      // The next slot should now start at 14:00
      const nextSlot = result[idx + 1];
      expect(nextSlot?.start).toBe('14:00:00');
    });
  });

  describe('checkpoint slots (no stop)', () => {
    it('handles checkpoint slot (no stop time) correctly', () => {
      const slots: Timeslot[] = [
        fillerSlot('00:00:00', '10:00:00'),
        { ...actionSlot('10:00:00', undefined) }, // checkpoint — no stop
        fillerSlot('10:01:00', '20:00:00'),
        actionSlot('20:00:00', '00:00:00'),
      ];
      const [result, idx] = moveTimeslot(slots, 1, { start: fixedTime(12, 0) }, mockHass);
      expect(result[idx].start).toBe('12:00:00');
      expect(result[idx].stop).toBeUndefined();
    });
  });

  describe('return value', () => {
    it('returns updated slotIdx when fillers are inserted before', () => {
      const slots: Timeslot[] = [
        fillerSlot('00:00:00', '10:00:00'),
        actionSlot('10:00:00', '20:00:00'),
        fillerSlot('20:00:00', '00:00:00'),
      ];
      const [result, idx] = moveTimeslot(slots, 1, { start: fixedTime(12, 0) }, mockHass);
      // Filler is inserted before our slot, so index shifts +1
      expect(result[idx].actions.length).toBeGreaterThan(0);
    });

    it('preserves original index when no filler is inserted', () => {
      const slots: Timeslot[] = [
        actionSlot('00:00:00', '10:00:00'),
        actionSlot('10:00:00', '20:00:00'),
        fillerSlot('20:00:00', '00:00:00'),
      ];
      // Move backward — previous slot gets shortened, no filler needed
      const [result, idx] = moveTimeslot(slots, 1, { start: fixedTime(8, 0) }, mockHass);
      expect(result[idx].actions.length).toBeGreaterThan(0);
      expect(result[idx].start).toBe('08:00:00');
    });
  });
});
