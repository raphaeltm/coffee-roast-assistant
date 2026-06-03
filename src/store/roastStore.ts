import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { RoastProfile } from '../types';
import {
  EngineState,
  createInitialEngineState,
  toggleAction,
  advanceToNextEvent,
  evaluatePreAlert,
} from '../engine/roastEngine';
import { alertThresholdSeconds as DEFAULT_ALERT_THRESHOLD, testOffsetSeconds } from '../data';

const THRESHOLD_STORAGE_KEY = '@alert_threshold';
const BRIDGE_IP_STORAGE_KEY = '@bridge_ip';

interface RoastStore {
  selectedProfile: RoastProfile | null;
  engineState: EngineState | null;

  // Timer (advisory only — never a trigger)
  roastStartedAt: number | null;
  elapsedSeconds: number;
  preAlertActive: boolean;
  secondsUntilNext: number | null;

  // Settings
  alertThresholdSeconds: number;
  setAlertThreshold: (seconds: number) => void;
  loadSettings: () => Promise<void>;

  // Artisan bridge
  bridgeIp: string;
  setBridgeIp: (ip: string) => void;
  wsStatus: 'disconnected' | 'connecting' | 'connected' | 'error';

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
  alertThresholdSeconds: DEFAULT_ALERT_THRESHOLD,
  setAlertThreshold: (seconds) => {
    set({ alertThresholdSeconds: seconds });
    AsyncStorage.setItem(THRESHOLD_STORAGE_KEY, String(seconds));
  },

  bridgeIp: '',
  setBridgeIp: (ip) => {
    set({ bridgeIp: ip });
    AsyncStorage.setItem(BRIDGE_IP_STORAGE_KEY, ip);
  },
  wsStatus: 'disconnected',
  loadSettings: async () => {
    const [thresholdVal, bridgeIpVal] = await Promise.all([
      AsyncStorage.getItem(THRESHOLD_STORAGE_KEY),
      AsyncStorage.getItem(BRIDGE_IP_STORAGE_KEY),
    ]);
    if (thresholdVal !== null) {
      const parsed = parseInt(thresholdVal, 10);
      if (!isNaN(parsed)) set({ alertThresholdSeconds: parsed });
    }
    if (bridgeIpVal !== null) set({ bridgeIp: bridgeIpVal });
  },

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
        const { engineState: es, roastStartedAt: startedAt, alertThresholdSeconds: threshold } = get();
        if (!startedAt) return;
        const elapsed = Math.floor((Date.now() - startedAt) / 1000);
        const { preAlertActive, secondsUntilNext } = evaluatePreAlert(
          elapsed,
          es?.currentEvent ?? null,
          threshold,
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
