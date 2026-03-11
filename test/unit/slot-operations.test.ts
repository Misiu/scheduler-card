import { describe, it, expect } from 'vitest';
import { insertTimeslot } from '../../src/data/schedule/insert_timeslot';
import { removeTimeslot } from '../../src/data/schedule/remove_timeslot';
import { Schedule, ScheduleEntry, TConditionLogicType, TRepeatType, TWeekday } from '../../src/types';
import { mockHass } from '../helpers/mock-hass';
import { actionSlot, fillerSlot } from '../helpers/slot-factory';

const makeSchedule = (slots: ReturnType<typeof actionSlot>[]): Schedule => ({
  entries: [{ slots, weekdays: [TWeekday.Daily] } as ScheduleEntry],
  next_entries: [],
  timestamps: [],
  repeat_type: TRepeatType.Repeat,
  enabled: true,
});

// ---------------------------------------------------------------------------
// insertTimeslot
// ---------------------------------------------------------------------------
describe('insertTimeslot', () => {
  it('splits a slot into two at the midpoint', () => {
    const schedule = makeSchedule([
      actionSlot('00:00:00', '12:00:00'),
      fillerSlot('12:00:00', '00:00:00'),
    ]);
    const result = insertTimeslot(schedule, 0, 0, mockHass);
    const slots = result.entries[0].slots;

    // Original 2 slots become 3
    expect(slots.length).toBe(3);
    // First slot now stops at midpoint (06:00 rounded to 15-min step)
    expect(slots[0].stop).toBe('06:00:00');
    // New slot starts at midpoint and has no actions (empty filler)
    expect(slots[1].start).toBe('06:00:00');
    expect(slots[1].stop).toBe('12:00:00');
    expect(slots[1].actions.length).toBe(0);
    // Original second slot unaffected
    expect(slots[2].start).toBe('12:00:00');
  });

  it('splits a 1-hour slot into ~30-min halves', () => {
    const schedule = makeSchedule([
      fillerSlot('00:00:00', '10:00:00'),
      actionSlot('10:00:00', '11:00:00'),
      fillerSlot('11:00:00', '00:00:00'),
    ]);
    const result = insertTimeslot(schedule, 0, 1, mockHass);
    const slots = result.entries[0].slots;

    expect(slots.length).toBe(4);
    // Split point: midpoint of 10:00–11:00 = 10:30
    expect(slots[1].stop).toBe('10:30:00');
    expect(slots[2].start).toBe('10:30:00');
    expect(slots[2].stop).toBe('11:00:00');
    expect(slots[2].actions.length).toBe(0);
  });

  it('rounds the split point to 15-minute granularity', () => {
    // Slot from 10:00 to 10:50 → midpoint at 10:25 → rounded to 10:30
    const schedule = makeSchedule([
      fillerSlot('00:00:00', '10:00:00'),
      actionSlot('10:00:00', '10:50:00'),
      fillerSlot('10:50:00', '00:00:00'),
    ]);
    const result = insertTimeslot(schedule, 0, 1, mockHass);
    const slots = result.entries[0].slots;

    // Midpoint = 25 min → roundTime(25, 15) = 30 → split at 10:30
    expect(slots[1].stop).toBe('10:30:00');
    expect(slots[2].start).toBe('10:30:00');
  });

  it('preserves actions on the original slot and creates empty new slot', () => {
    const schedule = makeSchedule([
      actionSlot('06:00:00', '18:00:00'),
      fillerSlot('18:00:00', '00:00:00'),
    ]);
    const result = insertTimeslot(schedule, 0, 0, mockHass);
    const slots = result.entries[0].slots;

    expect(slots[0].actions.length).toBeGreaterThan(0); // original keeps actions
    expect(slots[1].actions.length).toBe(0); // new one is empty
  });

  it('handles a slot that ends at midnight (00:00:00 → treated as 24:00)', () => {
    const schedule = makeSchedule([
      fillerSlot('00:00:00', '12:00:00'),
      actionSlot('12:00:00', '00:00:00'),
    ]);
    const result = insertTimeslot(schedule, 0, 1, mockHass);
    const slots = result.entries[0].slots;

    // 12:00 to 24:00 = 12h, midpoint at 18:00
    expect(slots.length).toBe(3);
    expect(slots[1].stop).toBe('18:00:00');
    expect(slots[2].start).toBe('18:00:00');
  });

  it('does not modify other schedule entries', () => {
    const schedule: Schedule = {
      entries: [
        { slots: [actionSlot('00:00:00', '12:00:00'), fillerSlot('12:00:00', '00:00:00')], weekdays: [TWeekday.Daily] },
        { slots: [actionSlot('08:00:00', '20:00:00'), fillerSlot('20:00:00', '00:00:00')], weekdays: [TWeekday.Monday] },
      ],
      next_entries: [],
      timestamps: [],
      repeat_type: TRepeatType.Repeat,
      enabled: true,
    };
    const result = insertTimeslot(schedule, 0, 0, mockHass);
    expect(result.entries[1].slots.length).toBe(2); // untouched
  });
});

// ---------------------------------------------------------------------------
// removeTimeslot
// ---------------------------------------------------------------------------
describe('removeTimeslot', () => {
  it('merges the removed slot with the next slot', () => {
    const schedule = makeSchedule([
      actionSlot('00:00:00', '08:00:00'),
      fillerSlot('08:00:00', '16:00:00'),
      actionSlot('16:00:00', '00:00:00'),
    ]);
    const result = removeTimeslot(schedule, 0, 1);
    const slots = result.entries[0].slots;

    // 3 slots become 2
    expect(slots.length).toBe(2);
    // The merged slot takes start from the removed slot and stop from next
    expect(slots[0].start).toBe('00:00:00');
    expect(slots[1].start).toBe('08:00:00');
    expect(slots[1].stop).toBe('00:00:00');
  });

  it('removing the first slot merges slot[0] and slot[1]', () => {
    const schedule = makeSchedule([
      fillerSlot('00:00:00', '06:00:00'),
      actionSlot('06:00:00', '12:00:00'),
      actionSlot('12:00:00', '00:00:00'),
    ]);
    const result = removeTimeslot(schedule, 0, 0);
    const slots = result.entries[0].slots;

    expect(slots.length).toBe(2);
    // Merged: start from slot[0], stop from slot[1]
    expect(slots[0].start).toBe('00:00:00');
    expect(slots[0].stop).toBe('12:00:00');
  });

  it('removing the last slot merges slot[n-2] and slot[n-1]', () => {
    const schedule = makeSchedule([
      actionSlot('00:00:00', '08:00:00'),
      actionSlot('08:00:00', '16:00:00'),
      fillerSlot('16:00:00', '00:00:00'),
    ]);
    // Last slot index = 2
    const result = removeTimeslot(schedule, 0, 2);
    const slots = result.entries[0].slots;

    expect(slots.length).toBe(2);
    // cutIndex = slotIdx - 1 = 1, merge slot[1] and slot[2]
    expect(slots[1].start).toBe('08:00:00');
    expect(slots[1].stop).toBe('00:00:00');
  });

  it('removing a middle slot preserves surrounding slots', () => {
    const schedule = makeSchedule([
      actionSlot('00:00:00', '06:00:00'),
      fillerSlot('06:00:00', '12:00:00'),
      actionSlot('12:00:00', '18:00:00'),
      fillerSlot('18:00:00', '00:00:00'),
    ]);
    const result = removeTimeslot(schedule, 0, 1);
    const slots = result.entries[0].slots;

    expect(slots.length).toBe(3);
    expect(slots[0].start).toBe('00:00:00');
    expect(slots[0].stop).toBe('06:00:00');
    // Merged slot covers 06:00-18:00
    expect(slots[1].start).toBe('06:00:00');
    expect(slots[1].stop).toBe('18:00:00');
  });

  it('preserves actions of the surviving slot', () => {
    const schedule = makeSchedule([
      actionSlot('00:00:00', '08:00:00'),
      fillerSlot('08:00:00', '16:00:00'),
      actionSlot('16:00:00', '00:00:00'),
    ]);
    // Remove the middle filler — the merged slot takes properties from slot[cutIndex+1]
    const result = removeTimeslot(schedule, 0, 1);
    const slots = result.entries[0].slots;

    // cutIndex=1, merged takes from slots[2] (actionSlot) with start from slots[1]
    expect(slots[1].actions.length).toBeGreaterThan(0);
  });

  it('can reduce from 3 slots to 2 slots', () => {
    const schedule = makeSchedule([
      actionSlot('00:00:00', '12:00:00'),
      fillerSlot('12:00:00', '18:00:00'),
      actionSlot('18:00:00', '00:00:00'),
    ]);
    const result = removeTimeslot(schedule, 0, 1);
    expect(result.entries[0].slots.length).toBe(2);
  });
});
