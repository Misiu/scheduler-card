import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { LitElement } from 'lit';
import {
  EditorMode, Schedule, ScheduleEntry, TConditionLogicType,
  TRepeatType, TWeekday, Timeslot
} from '../../src/types';
import { mockHass } from '../helpers/mock-hass';
import { actionSlot, fillerSlot } from '../helpers/slot-factory';

// All HA custom-element stubs that need to exist before importing components
const HA_STUBS = [
  'ha-button', 'ha-checkbox', 'ha-combo-box-item', 'ha-dialog',
  'ha-dialog-footer', 'ha-dialog-header', 'ha-dropdown', 'ha-dropdown-item',
  'ha-generic-picker', 'ha-icon', 'ha-icon-button', 'ha-list', 'ha-list-item',
  'ha-picker-field', 'ha-select', 'ha-slider', 'ha-state-icon', 'ha-svg-icon',
  'ha-textfield', 'ha-tooltip',
];

beforeAll(async () => {
  for (const tag of HA_STUBS) {
    if (!customElements.get(tag)) {
      customElements.define(tag, class extends HTMLElement {});
    }
  }
  // Import components — side-effect registrations run after stubs
  await import('../../src/components/scheduler-timeslot-editor');
  await import('../../src/dialogs/scheduler-main-panel');
});

// ------- helpers -------

/** Create a click event whose target has .blur() so _addTimeslot/_removeTimeslot won't throw */
const clickEvent = (): Event => {
  const btn = document.createElement('button');
  document.body.appendChild(btn);
  const ev = new MouseEvent('click', { bubbles: true });
  // Dispatch so that ev.target is set to btn
  btn.dispatchEvent(ev);
  btn.remove();
  return ev;
};

type MainPanel = LitElement & {
  hass: any;
  config: any;
  viewMode: EditorMode;
  selectedSlot: number | null;
  schedule: Schedule;
  selectedEntry: number | null;
  _addTimeslot(ev: Event): void;
  _removeTimeslot(ev: Event): void;
};

const makeSchedule = (slots: Timeslot[]): Schedule => ({
  entries: [{ slots, weekdays: [TWeekday.Daily] } as ScheduleEntry],
  next_entries: [],
  timestamps: [],
  repeat_type: TRepeatType.Repeat,
  enabled: true,
});

const renderMainPanel = async (slots: Timeslot[], selectedSlot: number | null = 0) => {
  const container = document.createElement('div');
  container.style.width = '500px';
  document.body.appendChild(container);

  const el = document.createElement('scheduler-main-panel') as MainPanel;
  el.hass = mockHass;
  el.config = { time_step: 15 };
  el.viewMode = EditorMode.Scheme;
  el.schedule = makeSchedule(slots);
  el.selectedSlot = selectedSlot;

  container.appendChild(el);

  await el.updateComplete;
  await new Promise(r => setTimeout(r, 150));
  await el.updateComplete;

  return { el, container };
};

const getActionButtons = (el: MainPanel) => {
  const shadow = el.shadowRoot!;
  const actionsDiv = shadow.querySelector('div.actions');
  if (!actionsDiv) return null;
  const btns = actionsDiv.querySelectorAll('ha-icon-button');
  return {
    prev: btns[0] as HTMLElement | undefined,
    next: btns[1] as HTMLElement | undefined,
    add: btns[2] as HTMLElement | undefined,
    remove: btns[3] as HTMLElement | undefined,
  };
};

// ------- tests -------

describe('scheduler-main-panel: slot operations (browser)', () => {
  afterEach(() => {
    document.body.querySelectorAll('div').forEach(d => d.remove());
  });

  // ===== ADD SLOT =====

  describe('add slot', () => {
    it('add button is present when a slot is selected in scheme mode', async () => {
      const { el } = await renderMainPanel([
        actionSlot('00:00:00', '12:00:00'),
        fillerSlot('12:00:00', '00:00:00'),
      ], 0);
      const btns = getActionButtons(el);
      expect(btns).not.toBeNull();
      expect(btns!.add).toBeDefined();
    });

    it('add button is enabled for slots >= 30 min', async () => {
      // 12h slot → delta = 43200 > 1800
      const { el } = await renderMainPanel([
        actionSlot('00:00:00', '12:00:00'),
        fillerSlot('12:00:00', '00:00:00'),
      ], 0);
      const btns = getActionButtons(el);
      expect(btns!.add!.hasAttribute('disabled')).toBe(false);
    });

    it('add button is disabled for slots < 30 min', async () => {
      // 20-min slot → delta = 1200 < 1800
      const { el } = await renderMainPanel([
        fillerSlot('00:00:00', '10:00:00'),
        actionSlot('10:00:00', '10:20:00'),
        fillerSlot('10:20:00', '00:00:00'),
      ], 1);
      const btns = getActionButtons(el);
      expect(btns!.add!.hasAttribute('disabled')).toBe(true);
    });

    it('clicking add button increases slot count by 1', async () => {
      const { el } = await renderMainPanel([
        actionSlot('00:00:00', '12:00:00'),
        fillerSlot('12:00:00', '00:00:00'),
      ], 0);

      const before = el.schedule.entries[0].slots.length;
      // Call the add method directly (button click triggers it)
      el._addTimeslot(clickEvent());
      await el.updateComplete;

      expect(el.schedule.entries[0].slots.length).toBe(before + 1);
    });

    it('new slot created by add has no actions (empty)', async () => {
      const { el } = await renderMainPanel([
        actionSlot('00:00:00', '12:00:00'),
        fillerSlot('12:00:00', '00:00:00'),
      ], 0);

      el._addTimeslot(clickEvent());
      await el.updateComplete;

      const slots = el.schedule.entries[0].slots;
      // The new slot (inserted after the split) should be empty
      expect(slots[1].actions.length).toBe(0);
    });

    it('add button disabled at exactly 30 min (boundary: enabled)', async () => {
      // Exactly 30 min → delta = 1800 → NOT < 1800 → enabled
      const { el } = await renderMainPanel([
        fillerSlot('00:00:00', '10:00:00'),
        actionSlot('10:00:00', '10:30:00'),
        fillerSlot('10:30:00', '00:00:00'),
      ], 1);
      const btns = getActionButtons(el);
      expect(btns!.add!.hasAttribute('disabled')).toBe(false);
    });
  });

  // ===== REMOVE SLOT =====

  describe('remove slot', () => {
    it('remove button is disabled when only 2 slots exist', async () => {
      const { el } = await renderMainPanel([
        actionSlot('00:00:00', '12:00:00'),
        fillerSlot('12:00:00', '00:00:00'),
      ], 0);
      const btns = getActionButtons(el);
      expect(btns!.remove!.hasAttribute('disabled')).toBe(true);
    });

    it('remove button is enabled when 3+ slots exist', async () => {
      const { el } = await renderMainPanel([
        actionSlot('00:00:00', '08:00:00'),
        fillerSlot('08:00:00', '16:00:00'),
        actionSlot('16:00:00', '00:00:00'),
      ], 1);
      const btns = getActionButtons(el);
      expect(btns!.remove!.hasAttribute('disabled')).toBe(false);
    });

    it('clicking remove decreases slot count by 1', async () => {
      const { el } = await renderMainPanel([
        actionSlot('00:00:00', '08:00:00'),
        fillerSlot('08:00:00', '16:00:00'),
        actionSlot('16:00:00', '00:00:00'),
      ], 1);

      const before = el.schedule.entries[0].slots.length;
      el._removeTimeslot(clickEvent());
      await el.updateComplete;

      expect(el.schedule.entries[0].slots.length).toBe(before - 1);
    });

    it('removing a middle slot merges it with the next slot', async () => {
      const { el } = await renderMainPanel([
        actionSlot('00:00:00', '08:00:00'),
        fillerSlot('08:00:00', '16:00:00'),
        actionSlot('16:00:00', '00:00:00'),
      ], 1);

      el._removeTimeslot(clickEvent());
      await el.updateComplete;

      const slots = el.schedule.entries[0].slots;
      expect(slots.length).toBe(2);
      // Merged slot covers 08:00-00:00
      expect(slots[1].start).toBe('08:00:00');
      expect(slots[1].stop).toBe('00:00:00');
    });

    it('cannot remove when only 1 action slot + 1 filler remain', async () => {
      // Exactly 2 slots → button disabled
      const { el } = await renderMainPanel([
        actionSlot('00:00:00', '12:00:00'),
        fillerSlot('12:00:00', '00:00:00'),
      ], 0);
      const btns = getActionButtons(el);
      expect(btns!.remove!.hasAttribute('disabled')).toBe(true);
    });

    it('after removing last slot, selectedSlot adjusts to stay in bounds', async () => {
      const { el } = await renderMainPanel([
        actionSlot('00:00:00', '08:00:00'),
        fillerSlot('08:00:00', '16:00:00'),
        actionSlot('16:00:00', '00:00:00'),
      ], 2); // select last slot

      el._removeTimeslot(clickEvent());
      await el.updateComplete;

      // selectedSlot should be adjusted to not exceed array length
      expect(el.selectedSlot).toBeLessThan(el.schedule.entries[0].slots.length);
    });

    it('repeated removals stop at 2 slots (minimum)', async () => {
      const { el } = await renderMainPanel([
        actionSlot('00:00:00', '06:00:00'),
        fillerSlot('06:00:00', '12:00:00'),
        actionSlot('12:00:00', '18:00:00'),
        fillerSlot('18:00:00', '00:00:00'),
      ], 1);

      // Remove once (4 → 3)
      el._removeTimeslot(clickEvent());
      await el.updateComplete;
      expect(el.schedule.entries[0].slots.length).toBe(3);

      // Remove again (3 → 2)
      el.selectedSlot = 1;
      el._removeTimeslot(clickEvent());
      await el.updateComplete;
      expect(el.schedule.entries[0].slots.length).toBe(2);

      // At 2 slots, the button should be disabled (check via method guard)
      const btns = getActionButtons(el);
      expect(btns!.remove!.hasAttribute('disabled')).toBe(true);
    });
  });

  // ===== NAVIGATION =====

  describe('slot navigation', () => {
    it('prev button is disabled when first slot is selected', async () => {
      const { el } = await renderMainPanel([
        actionSlot('00:00:00', '12:00:00'),
        fillerSlot('12:00:00', '00:00:00'),
      ], 0);
      const btns = getActionButtons(el);
      expect(btns!.prev!.hasAttribute('disabled')).toBe(true);
    });

    it('next button is disabled when last slot is selected', async () => {
      const { el } = await renderMainPanel([
        actionSlot('00:00:00', '12:00:00'),
        fillerSlot('12:00:00', '00:00:00'),
      ], 1); // last slot
      const btns = getActionButtons(el);
      expect(btns!.next!.hasAttribute('disabled')).toBe(true);
    });

    it('prev is enabled when not on first slot', async () => {
      const { el } = await renderMainPanel([
        actionSlot('00:00:00', '12:00:00'),
        fillerSlot('12:00:00', '00:00:00'),
      ], 1);
      const btns = getActionButtons(el);
      expect(btns!.prev!.hasAttribute('disabled')).toBe(false);
    });

    it('next is enabled when not on last slot', async () => {
      const { el } = await renderMainPanel([
        actionSlot('00:00:00', '12:00:00'),
        fillerSlot('12:00:00', '00:00:00'),
      ], 0);
      const btns = getActionButtons(el);
      expect(btns!.next!.hasAttribute('disabled')).toBe(false);
    });
  });
});

// ===== TIMESLOT-EDITOR: HANDLE/RESIZE BEHAVIOR =====

describe('scheduler-timeslot-editor: handle/resize behavior (browser)', () => {
  type TimeslotEditor = LitElement & {
    hass: any;
    config: any;
    schedule: ScheduleEntry;
    selectedSlot: number | null;
    _width: number;
  };

  const renderEditor = async (slots: Timeslot[], selectedSlot: number | null = null) => {
    const container = document.createElement('div');
    container.style.width = '400px';
    document.body.appendChild(container);

    const el = document.createElement('scheduler-timeslot-editor') as TimeslotEditor;
    el.hass = mockHass;
    el.config = { time_step: 15 };
    el.schedule = { slots, weekdays: [TWeekday.Daily] };

    container.appendChild(el);
    await el.updateComplete;
    await new Promise(r => setTimeout(r, 100));
    if (el._width === 0) el._width = 400;
    await el.updateComplete;
    await new Promise(r => setTimeout(r, 50));
    await el.updateComplete;

    if (selectedSlot !== null) {
      el.selectedSlot = selectedSlot;
      await el.updateComplete;
      await new Promise(r => setTimeout(r, 50));
      await el.updateComplete;
    }

    return { el, container };
  };

  afterEach(() => {
    document.body.querySelectorAll('div').forEach(d => d.remove());
  });

  // ------- Handle counts -------

  it('4 slots with all stops produce 3 handles', async () => {
    const { el } = await renderEditor([
      fillerSlot('00:00:00', '06:00:00'),
      actionSlot('06:00:00', '12:00:00'),
      fillerSlot('12:00:00', '18:00:00'),
      actionSlot('18:00:00', '00:00:00'),
    ]);
    const handles = el.shadowRoot!.querySelectorAll('.bar .handle');
    expect(handles.length).toBe(3);
  });

  it('2 slots produce 1 handle', async () => {
    const { el } = await renderEditor([
      actionSlot('00:00:00', '12:00:00'),
      fillerSlot('12:00:00', '00:00:00'),
    ]);
    const handles = el.shadowRoot!.querySelectorAll('.bar .handle');
    expect(handles.length).toBe(1);
  });

  // ------- First slot: no left handle -------

  it('first slot has no handle to its left (handle idx starts at 0 between slot 0-1)', async () => {
    const { el } = await renderEditor([
      actionSlot('00:00:00', '12:00:00'),
      fillerSlot('12:00:00', '00:00:00'),
    ], 0);
    const shadow = el.shadowRoot!;
    const handles = shadow.querySelectorAll('.bar .handle');

    // Only 1 handle, at idx=0 (between slot 0 and slot 1)
    expect(handles.length).toBe(1);
    expect(handles[0].getAttribute('idx')).toBe('0');
    // This handle acts as the RIGHT handle of slot 0 and LEFT handle of slot 1
    // There is NO handle before slot 0
  });

  // ------- Last slot: no right handle -------

  it('last slot has no handle to its right', async () => {
    const { el } = await renderEditor([
      actionSlot('00:00:00', '12:00:00'),
      fillerSlot('12:00:00', '18:00:00'),
      actionSlot('18:00:00', '00:00:00'),
    ], 2);
    const shadow = el.shadowRoot!;
    const handles = shadow.querySelectorAll('.bar .handle');

    // All handles have idx values < last slot index
    const handleIndices = Array.from(handles).map(h => Number(h.getAttribute('idx')));
    const lastSlotIdx = 2;
    // No handle has idx === lastSlotIdx (which would be after it)
    expect(handleIndices.every(idx => idx < lastSlotIdx)).toBe(true);
  });

  // ------- Handle visibility logic -------

  it('selecting first slot shows only the handle to its right', async () => {
    const { el } = await renderEditor([
      actionSlot('00:00:00', '08:00:00'),
      fillerSlot('08:00:00', '16:00:00'),
      actionSlot('16:00:00', '00:00:00'),
    ], 0);
    const shadow = el.shadowRoot!;
    const handles = shadow.querySelectorAll('.bar .handle');

    // handle[0] (idx=0): between slot 0 and 1 → selectedSlot==0 → visible
    expect(handles[0].classList.contains('hidden')).toBe(false);
    // handle[1] (idx=1): between slot 1 and 2 → selectedSlot==0 → hidden
    expect(handles[1].classList.contains('hidden')).toBe(true);
  });

  it('selecting last slot shows only the handle to its left', async () => {
    const { el } = await renderEditor([
      actionSlot('00:00:00', '08:00:00'),
      fillerSlot('08:00:00', '16:00:00'),
      actionSlot('16:00:00', '00:00:00'),
    ], 2);
    const shadow = el.shadowRoot!;
    const handles = shadow.querySelectorAll('.bar .handle');

    // handle[0] (idx=0): between slot 0 and 1 → selectedSlot==2 → hidden
    expect(handles[0].classList.contains('hidden')).toBe(true);
    // handle[1] (idx=1): between slot 1 and 2 → selectedSlot==2 → visible
    expect(handles[1].classList.contains('hidden')).toBe(false);
  });

  it('selecting a middle slot shows both adjacent handles', async () => {
    const { el } = await renderEditor([
      actionSlot('00:00:00', '08:00:00'),
      fillerSlot('08:00:00', '16:00:00'),
      actionSlot('16:00:00', '00:00:00'),
    ], 1);
    const shadow = el.shadowRoot!;
    const handles = shadow.querySelectorAll('.bar .handle');

    // handle[0] (idx=0): selectedSlot==1 == idx+1 → visible
    expect(handles[0].classList.contains('hidden')).toBe(false);
    // handle[1] (idx=1): selectedSlot==1 == idx → visible
    expect(handles[1].classList.contains('hidden')).toBe(false);
  });

  it('no handles visible when no slot is selected', async () => {
    const { el } = await renderEditor([
      actionSlot('00:00:00', '08:00:00'),
      fillerSlot('08:00:00', '16:00:00'),
      actionSlot('16:00:00', '00:00:00'),
    ], null);
    const shadow = el.shadowRoot!;
    const handles = shadow.querySelectorAll('.bar .handle');

    const allHidden = Array.from(handles).every(h => h.classList.contains('hidden'));
    expect(allHidden).toBe(true);
  });

  // ------- Resize via drag: update event -------

  it('dragging a handle dispatches an update event with modified slots', async () => {
    const { el } = await renderEditor([
      actionSlot('00:00:00', '12:00:00'),
      fillerSlot('12:00:00', '00:00:00'),
    ], 0);
    const shadow = el.shadowRoot!;
    const handle = shadow.querySelector('.bar .handle') as HTMLElement;
    const haIconButton = handle.querySelector('ha-icon-button') as HTMLElement;

    let updateDetail: any = null;
    el.addEventListener('update', (ev: Event) => {
      updateDetail = (ev as CustomEvent).detail;
    });

    // Get the bar bounds for positioning
    const bar = shadow.querySelector('.bar') as HTMLElement;
    const barRect = bar.getBoundingClientRect();

    // Simulate mousedown on handle icon-button
    const mousedownEvent = new MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
      clientX: barRect.left + barRect.width / 2,
      clientY: barRect.top + 30,
    });
    haIconButton.dispatchEvent(mousedownEvent);

    // Simulate mousemove to new position (25% of bar = ~06:00)
    const mousemoveEvent = new MouseEvent('mousemove', {
      bubbles: true,
      cancelable: true,
      clientX: barRect.left + barRect.width * 0.25,
      clientY: barRect.top + 30,
    });
    window.dispatchEvent(mousemoveEvent);

    // Simulate mouseup
    const mouseupEvent = new MouseEvent('mouseup', { bubbles: true });
    window.dispatchEvent(mouseupEvent);

    await new Promise(r => setTimeout(r, 50));

    // The update event should have been dispatched with modified slots
    expect(updateDetail).not.toBeNull();
    expect(updateDetail.slots).toBeDefined();
    expect(updateDetail.slots.length).toBe(2);
    // The boundary between the two slots should have moved
    expect(updateDetail.slots[0].stop).not.toBe('12:00:00');
  });

  // ------- Checkpoint slot: no handle rendered after it -------

  it('no handle is rendered after a checkpoint slot (no stop)', async () => {
    const { el } = await renderEditor([
      fillerSlot('00:00:00', '10:00:00'),
      { ...actionSlot('10:00:00', undefined) }, // checkpoint
      fillerSlot('10:01:00', '00:00:00'),
    ], 1);
    const shadow = el.shadowRoot!;
    const handles = shadow.querySelectorAll('.bar .handle');

    // Handle between slot 0 (has stop) and slot 1 → rendered
    // Checkpoint (slot 1, no stop) → no handle rendered after it
    // So only 1 handle total
    expect(handles.length).toBe(1);
    expect(handles[0].getAttribute('idx')).toBe('0');
  });
});
