import { RoastProfile, RoastEvent, ActionEvent, InfoEvent } from '../types';

export interface EngineState {
  currentEvent: RoastEvent | null;
  nextEvent: RoastEvent | null;
  currentEventIndex: number;
  isComplete: boolean;
  completedActions: Record<number, boolean[]>;
}

export interface EngineResult {
  activeEvent: RoastEvent | null;
  nextEvent: RoastEvent | null;
  isComplete: boolean;
}

export function createInitialEngineState(profile: RoastProfile): EngineState {
  const firstEvent = profile.events[0] ?? null;
  const secondEvent = profile.events[1] ?? null;

  const completedActions: Record<number, boolean[]> = {};
  for (const event of profile.events) {
    if (event.type === 'action') {
      completedActions[event.index] = (event as ActionEvent).actions.map(() => false);
    }
  }

  return {
    currentEvent: firstEvent,
    nextEvent: secondEvent,
    currentEventIndex: 0,
    isComplete: false,
    completedActions,
  };
}

/**
 * Evaluates the current temperature against the profile and returns
 * the active and next events. This is the core of the state machine —
 * temperature is the only trigger for progression.
 */
export function evaluateTemperature(
  profile: RoastProfile,
  currentTemp: number,
  state: EngineState,
): EngineState {
  if (state.isComplete) return state;

  const events = profile.events;
  let newIndex = state.currentEventIndex;

  // Advance through events whose temperature threshold has been reached
  for (let i = state.currentEventIndex; i < events.length; i++) {
    if (currentTemp >= events[i].trigger.temperature) {
      newIndex = i;
    } else {
      break;
    }
  }

  const currentEvent = events[newIndex] ?? null;
  const nextEvent = events[newIndex + 1] ?? null;
  const isComplete = newIndex === events.length - 1 && currentEvent?.phase === 'end';

  return {
    ...state,
    currentEvent,
    nextEvent,
    currentEventIndex: newIndex,
    isComplete,
  };
}

/**
 * Marks a single action checkbox as complete.
 * Returns a new state — does not mutate.
 */
export function toggleAction(
  state: EngineState,
  eventIndex: number,
  actionIndex: number,
): EngineState {
  const current = state.completedActions[eventIndex] ?? [];
  const updated = [...current];
  updated[actionIndex] = !updated[actionIndex];

  return {
    ...state,
    completedActions: {
      ...state.completedActions,
      [eventIndex]: updated,
    },
  };
}

/**
 * Returns true if all actions for a given event index are checked off.
 */
export function areActionsComplete(state: EngineState, eventIndex: number): boolean {
  const actions = state.completedActions[eventIndex];
  if (!actions || actions.length === 0) return true;
  return actions.every(Boolean);
}

/**
 * MVP 1: Manually advance to the next event in sequence.
 * Temperature-driven advancement is preserved in evaluateTemperature
 * for use in Phase 2/3 — this is the manual override for Phase 1.
 */
export function advanceToNextEvent(
  state: EngineState,
  profile: RoastProfile,
): EngineState {
  let nextIndex = state.currentEventIndex + 1;
  // Skip hidden info events
  while (nextIndex < profile.events.length) {
    const ev = profile.events[nextIndex];
    if (ev.type === 'info' && (ev as InfoEvent).hidden === true) nextIndex++;
    else break;
  }
  if (nextIndex >= profile.events.length) {
    return { ...state, isComplete: true };
  }
  return {
    ...state,
    currentEventIndex: nextIndex,
    currentEvent: profile.events[nextIndex] ?? null,
    nextEvent: profile.events[nextIndex + 1] ?? null,
  };
}
