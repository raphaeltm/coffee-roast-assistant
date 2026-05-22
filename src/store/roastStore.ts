import { create } from 'zustand';
import { RoastProfile } from '../types';
import {
  EngineState,
  createInitialEngineState,
  toggleAction,
  advanceToNextEvent,
} from '../engine/roastEngine';

interface RoastStore {
  selectedProfile: RoastProfile | null;
  engineState: EngineState | null;

  selectProfile: (profile: RoastProfile) => void;
  startRoast: () => void;
  toggleAction: (eventIndex: number, actionIndex: number) => void;
  advanceEvent: () => void;
  resetRoast: () => void;
}

export const useRoastStore = create<RoastStore>((set, get) => ({
  selectedProfile: null,
  engineState: null,

  selectProfile: (profile) => {
    set({ selectedProfile: profile, engineState: null });
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
    const { selectedProfile, engineState } = get();
    if (!selectedProfile || !engineState) return;
    set({ engineState: advanceToNextEvent(engineState, selectedProfile) });
  },

  resetRoast: () => {
    set({ selectedProfile: null, engineState: null });
  },
}));
