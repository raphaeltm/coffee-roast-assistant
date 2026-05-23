import { RoastProfile, RoastProfilesData } from '../types';
import rawData from './roastProfiles.json';

const data = rawData as RoastProfilesData;

export const roastProfiles: RoastProfile[] = data.profiles;
export const alertThresholdSeconds: number = data.meta.alert_threshold_seconds ?? 10;
export const testOffsetSeconds: number = data.meta.test_offset_seconds ?? 0;

export function getProfileById(id: string): RoastProfile | undefined {
  return data.profiles.find(p => p.id === id);
}
