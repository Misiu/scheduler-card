import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { html, LitElement } from 'lit';
import { ScheduleEntry, TimeMode, TConditionLogicType, TWeekday } from '../../src/types';
import { mockHass } from '../helpers/mock-hass';
import { actionSlot, fillerSlot } from '../helpers/slot-factory';

// Register ha-icon-button stub before the component tries to use it
beforeAll(async () => {
  // Stub HA custom elements that don't exist outside of Home Assistant
  for (const tag of ['ha-icon-button', 'ha-icon', 'ha-svg-icon']) {
    if (!customElements.get(tag)) {
      customElements.define(tag, class extends HTMLElement {});
    }
  }
  // Dynamic import so the @customElement decorator runs after stubs are registered
  await import('../../src/components/scheduler-timeslot-editor');
});

const defaultSchedule: ScheduleEntry = {
  weekdays: [TWeekday.Daily],
  slots: [
    fillerSlot('00:00:00', '06:00:00'),
    actionSlot('06:00:00', '12:00:00'),
    fillerSlot('12:00:00', '18:00:00'),
    actionSlot('18:00:00', '00:00:00'),
  ],
};

const renderEditor = async (schedule: ScheduleEntry = defaultSchedule) => {
  const container = document.createElement('div');
  container.style.width = '400px';
  document.body.appendChild(container);

  const el = document.createElement('scheduler-timeslot-editor') as LitElement & {
    hass: any;
    config: any;
    schedule: ScheduleEntry;
    selectedSlot: number | null;
    _width: number;
  };

  el.hass = mockHass;
  el.config = { time_step: 15 };
  el.schedule = schedule;

  container.appendChild(el);

  // Wait for the element to render and the ResizeObserver to set _width
  await el.updateComplete;
  await new Promise(r => setTimeout(r, 100));
  // Force a valid _width if ResizeObserver hasn't fired
  if ((el as any)._width === 0) (el as any)._width = 400;
  await el.updateComplete;
  await new Promise(r => setTimeout(r, 50));
  await el.updateComplete;

  return { el, container };
};

// ---------------------------------------------------------------------------
describe('scheduler-timeslot-editor (browser)', () => {
  afterEach(() => {
    // Clean up all rendered elements
    document.body.querySelectorAll('div').forEach(d => d.remove());
  });

  it('is registered as a custom element', () => {
    expect(customElements.get('scheduler-timeslot-editor')).toBeDefined();
  });

  it('renders the correct number of slot divs', async () => {
    const { el } = await renderEditor();
    const shadowRoot = el.shadowRoot!;
    const slots = shadowRoot.querySelectorAll('.bar .slot');
    expect(slots.length).toBe(4);
  });

  it('renders handles between slots', async () => {
    const { el } = await renderEditor();
    const shadowRoot = el.shadowRoot!;
    // Handles appear between consecutive slots that both have stop times
    const handles = shadowRoot.querySelectorAll('.bar .handle');
    expect(handles.length).toBeGreaterThan(0);
  });

  it('marks empty slots with the "empty" class', async () => {
    const { el } = await renderEditor();
    const shadowRoot = el.shadowRoot!;
    const emptySlots = shadowRoot.querySelectorAll('.bar .slot.empty');
    // 2 fillers have no actions → should have 'empty' class
    expect(emptySlots.length).toBe(2);
  });

  it('selects a slot on click and adds "selected" class', async () => {
    const { el } = await renderEditor();
    const shadowRoot = el.shadowRoot!;
    const slots = shadowRoot.querySelectorAll('.bar .slot');

    // Click the second slot (action slot at index 1)
    (slots[1] as HTMLElement).click();
    await el.updateComplete;
    await new Promise(r => setTimeout(r, 50));
    await el.updateComplete;

    const selected = shadowRoot.querySelectorAll('.bar .slot.selected');
    expect(selected.length).toBe(1);
  });

  it('deselects a slot when clicked again', async () => {
    const { el } = await renderEditor();
    const shadowRoot = el.shadowRoot!;
    const slots = shadowRoot.querySelectorAll('.bar .slot');

    // Select
    (slots[1] as HTMLElement).click();
    await el.updateComplete;
    await new Promise(r => setTimeout(r, 50));
    await el.updateComplete;

    // Deselect
    (slots[1] as HTMLElement).click();
    await el.updateComplete;
    await new Promise(r => setTimeout(r, 50));
    await el.updateComplete;

    const selected = shadowRoot.querySelectorAll('.bar .slot.selected');
    expect(selected.length).toBe(0);
  });

  it('renders time-bar with labels', async () => {
    const { el } = await renderEditor();
    const shadowRoot = el.shadowRoot!;
    const timeBar = shadowRoot.querySelector('.time-bar');
    expect(timeBar).toBeDefined();
    const labels = timeBar!.querySelectorAll('span');
    // Should have at least 2 labels (00:00 and 24:00)
    expect(labels.length).toBeGreaterThanOrEqual(2);
  });

  it('slot widths sum to approximately the total bar width', async () => {
    const { el } = await renderEditor();
    const shadowRoot = el.shadowRoot!;
    const slotEls = shadowRoot.querySelectorAll('.bar .slot') as NodeListOf<HTMLElement>;
    let totalWidth = 0;
    slotEls.forEach(s => {
      const w = parseFloat(s.style.width);
      if (!isNaN(w)) totalWidth += w;
    });
    // Should be roughly 400 minus gaps (3px per gap between 4 slots = 9px)
    expect(totalWidth).toBeGreaterThan(350);
    expect(totalWidth).toBeLessThanOrEqual(400);
  });

  it('handles become visible when adjacent slot is selected', async () => {
    const { el } = await renderEditor();
    const shadowRoot = el.shadowRoot!;
    const slots = shadowRoot.querySelectorAll('.bar .slot');

    // Select second slot (index 1)
    (slots[1] as HTMLElement).click();
    await el.updateComplete;
    await new Promise(r => setTimeout(r, 50));
    await el.updateComplete;

    const handles = shadowRoot.querySelectorAll('.bar .handle');
    // At least one handle should NOT have the 'hidden' class
    const visibleHandles = Array.from(handles).filter(h => !h.classList.contains('hidden'));
    expect(visibleHandles.length).toBeGreaterThan(0);
  });

  it('renders checkpoint slots (no stop) with "short" class', async () => {
    const schedule: ScheduleEntry = {
      weekdays: [TWeekday.Daily],
      slots: [
        fillerSlot('00:00:00', '10:00:00'),
        { ...actionSlot('10:00:00', undefined) },
        fillerSlot('10:01:00', '00:00:00'),
      ],
    };
    const { el } = await renderEditor(schedule);
    const shadowRoot = el.shadowRoot!;
    const shortSlots = shadowRoot.querySelectorAll('.bar .slot.short');
    expect(shortSlots.length).toBe(1);
  });
});
