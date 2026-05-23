import { create } from 'zustand';
import { RoastProfile } from '../types';
import {
  EngineState,
  createInitialEngineState,
  toggleAction,
  advanceToNextEvent,
  evaluatePreAlert,
} from '../engine/roastEngine';
import { alertThresholdSeconds, testOffsetSeconds } from '../data';

interface RoastStore {
  selectedProfile: RoastProfile | null;
  engineState: EngineState | null;

  // Timer (advisory only — never a trigger)
  roastStartedAt: number | null;
  elapsedSeconds: number;
  preAlertActive: boolean;
  secondsUntilNext: number | null;

  selectProfile: (profile: RoastProfile) => void;
  startRoast: () => void;
  toggleAction: (eventIndex: number, actionIndex: number) => void;
  advanceEvent: () => void;
  resetRoast: () => void;
}

let timerInterval: ReturnType<typeof setInterval> | null = null;

function clearTimer() {
  if (timerInterval !== null) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

export const useRoastStore = create<RoastStore>((set, get) => ({
  selectedProfile: null,
  engineState: null,
  roastStartedAt: null,
  elapsedSeconds: 0,
  preAlertActive: false,
  secondsUntilNext: null,

  selectProfile: (profile) => {
    clearTimer();
    set({ selectedProfile: profile, engineState: null, roastStartedAt: null, elapsedSeconds: 0, preAlertActive: false, secondsUntilNext: null });
  },

  startRoast: () => {
    const { selectedProfile } = get();
    if (!selectedProfile) return;
    set({ engineState: createInitialEngineState(selectedProfile) });
  },

  toggleAction: (eventIndex, actionIndex) => {
    const { engineState } = get();
    if (!engineState) return;
    set({ engineState: toggleAction(engineState, eventIndex, actionIndex) });
  },

  advanceEvent: () => {
    const { selectedProfile, engineState, roastStartedAt } = get();
    if (!selectedProfile || !engineState) return;

    const newEngineState = advanceToNextEvent(engineState, selectedProfile);

    // Start timer when leaving index 0 (first event confirmed)
    if (engineState.currentEventIndex === 0 && roastStartedAt === null) {
      const now = Date.now() - testOffsetSeconds * 1000;
      clearTimer();
      timerInterval = setInterval(() => {
        const { engineState: es, roastStartedAt: startedAt } = get();
        if (!startedAt) return;
        const elapsed = Math.floor((Date.now() - startedAt) / 1000);
        const { preAlertActive, secondsUntilNext } = evaluatePreAlert(
          elapsed,
          es?.currentEvent ?? null,
          alertThresholdSeconds,
        );
        set({ elapsedSeconds: elapsed, preAlertActive, secondsUntilNext });
      }, 1000);
      set({ engineState: newEngineState, roastStartedAt: now, preAlertActive: false, secondsUntilNext: null });
      return;
    }

    // Clear pre-alert immediately on advance so banner doesn't linger
    set({ engineState: newEngineState, preAlertActive: false, secondsUntilNext: null });

    if (newEngineState.isComplete) clearTimer();
  },

  resetRoast: () => {
    clearTimer();
    set({ selectedProfile: null, engineState: null, roastStartedAt: null, elapsedSeconds: 0, preAlertActive: false, secondsUntilNext: null });
  },
}));
