import { ConditionConfig, TConditionLogicType, Timeslot } from '../../src/types';

const defaultConditions: ConditionConfig = {
  type: TConditionLogicType.Or,
  items: [],
  track_changes: false,
};

/** Create a simple timeslot with start/stop and optional actions */
export const slot = (start: string, stop: string | undefined, hasAction = false): Timeslot => ({
  start,
  stop,
  actions: hasAction ? [{ service: 'light.turn_on', service_data: {}, target: { entity_id: 'light.test' } }] : [],
  conditions: { ...defaultConditions },
});

/** Shortcut: slot with actions */
export const actionSlot = (start: string, stop: string | undefined): Timeslot => slot(start, stop, true);

/** Shortcut: empty filler slot */
export const fillerSlot = (start: string, stop: string): Timeslot => slot(start, stop, false);
