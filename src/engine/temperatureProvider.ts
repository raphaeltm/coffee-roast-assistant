/**
 * TemperatureProvider abstraction.
 *
 * The Roast Engine only depends on this interface — never on a concrete
 * data source. Swap the implementation to change where temperature comes from:
 *
 *   ManualProvider  — Phase 1/2: no live feed, returns nulls
 *   ArtisanProvider — Phase 3:   reads from the WebSocket bridge
 */
export interface TemperatureProvider {
  /** Bean Temperature in °F, or null if unavailable */
  getBT(): number | null;
  /** Environmental Temperature in °F, or null if unavailable */
  getET(): number | null;
  /** Rate of Rise in °F/min, or null if unavailable */
  getRoR(): number | null;
}

/**
 * Phase 1/2 provider — no live telemetry.
 * Returns null for all values; the engine falls back to manual advancement.
 */
export class ManualProvider implements TemperatureProvider {
  getBT() { return null; }
  getET() { return null; }
  getRoR() { return null; }
}
