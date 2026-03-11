import { HomeAssistant } from '../../src/lib/types';

/**
 * Minimal mock of Home Assistant's `hass` object.
 * Only the fields actually touched by time utilities and schedule logic.
 */
export const mockHass = {
  states: {
    'sun.sun': {
      attributes: {
        next_rising: '06:30:00',
        next_setting: '20:15:00',
      },
    },
  },
  locale: {
    language: 'en',
    number_format: 'language',
    time_format: '24',
  },
  localize: (key: string) => key.split('.').pop() || key,
  callWS: () => Promise.resolve([]),
} as unknown as HomeAssistant;
