import { HomeAssistant } from "../../lib/types";
import { Action, CustomConfig } from "../../types";
import { computeDomain } from "../../lib/entity";
import { computeEntityDisplay } from "./compute_entity_display";

/**
 * Returns a human-readable display string for the target of an action.
 * Handles entity, device, area, and label targets.
 */
export const computeTargetDisplay = (
  action: Action,
  hass: HomeAssistant,
  customize?: CustomConfig
): string => {
  const entityIds = [action.target?.entity_id || []].flat();
  const domain = computeDomain(action.service);

  if (!entityIds.length && ['notify', 'script'].includes(domain)) {
    return computeEntityDisplay(action.service, hass, customize);
  }

  if (entityIds.length) {
    return entityIds.map(e => computeEntityDisplay(e, hass, customize)).join(", ");
  }

  if (action.target?.device_id) {
    const deviceIds = [action.target.device_id].flat();
    return deviceIds.map(id => hass.devices?.[id]?.name || id).join(", ");
  }

  if (action.target?.area_id) {
    const areaIds = [action.target.area_id].flat();
    return areaIds.map(id => hass.areas?.[id]?.name || id).join(", ");
  }

  if (action.target?.label_id) {
    const labelIds = [action.target.label_id].flat();
    return labelIds.map(id => hass.labels?.[id]?.name || id).join(", ");
  }

  return '';
};
