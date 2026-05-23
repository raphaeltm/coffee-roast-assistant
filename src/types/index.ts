export type TriggerSource = 'ART' | 'PID';
export type EventType = 'action' | 'info';
export type RoastPhase = 'preheat' | 'drying' | 'maillard' | 'development' | 'end';

export interface TemperatureTrigger {
  temperature: number;
  unit: 'F';
  source: TriggerSource;
}

interface BaseRoastEvent {
  index: number;
  trigger: TemperatureTrigger;
  type: EventType;
  phase: RoastPhase;
  /** Seconds elapsed from roast start. 0 for first event, null = not yet set. */
  estimated_time_seconds: number | null;
}

export interface ActionEvent extends BaseRoastEvent {
  type: 'action';
  actions: string[];
  notes?: string[];
}

export interface InfoEvent extends BaseRoastEvent {
  type: 'info';
  info: string[];
  hidden?: boolean;
}

export type RoastEvent = ActionEvent | InfoEvent;

export interface RoastProfile {
  id: string;
  name: string;
  roaster: string;
  events: RoastEvent[];
}

export interface RoastProfilesData {
  meta: {
    model_version: string;
    principle: string;
    time_role: string;
    /** Seconds before next estimated event to trigger pre-alert */
    alert_threshold_seconds: number;
    /** Offset timer by this many seconds at start — for testing only, set to 0 in production */
    test_offset_seconds: number;
  };
  profiles: RoastProfile[];
}

export interface RoastState {
  profile: RoastProfile;
  currentEventIndex: number;
  completedActions: Record<number, boolean[]>;
  isComplete: boolean;
  startedAt: number;
}
