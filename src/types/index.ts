export type TriggerSource = 'ART' | 'PID';
export type EventType = 'action' | 'info';
export type RoastPhase = 'Drying' | 'Maillard' | 'Development';

export interface TemperatureTrigger {
  type: 'temperature';
  value: number;
  unit: 'F';
  source: TriggerSource;
}

export interface RoastEvent {
  id: string;
  eventType: EventType;
  label: string;
  phase: RoastPhase;
  trigger: TemperatureTrigger;
  actions: string[];
  notes?: string;
}

export interface RoastProfile {
  id: string;
  name: string;
  events: RoastEvent[];
}

export interface RoastState {
  profile: RoastProfile;
  currentEventIndex: number;
  completedActions: Record<string, boolean[]>;
  isComplete: boolean;
  startedAt: number;
}
