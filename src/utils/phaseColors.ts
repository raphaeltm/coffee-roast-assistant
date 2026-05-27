import { RoastPhase } from '../types';

export const PHASE_COLORS: Record<RoastPhase, string> = {
  preheat:     '#3A3A3A',
  drying:      '#3B82F6',
  maillard:    '#EAB308',
  development: '#4e0065',
  end:         '#3A3A3A',
};

export const PHASE_TEXT_COLORS: Record<RoastPhase, string> = {
  preheat:     '#FFFFFF',
  drying:      '#FFFFFF',
  maillard:    '#1A1A1A',
  development: '#FFFFFF',
  end:         '#FFFFFF',
};

export const PHASE_LABELS: Record<RoastPhase, string> = {
  preheat:     'Preheat',
  drying:      'Drying',
  maillard:    'Maillard',
  development: 'Development',
  end:         'End',
};
