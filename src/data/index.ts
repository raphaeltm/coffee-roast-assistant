import { RoastProfile, RoastProfilesData } from '../types';
import rawData from './roastProfiles.json';

const data = rawData as RoastProfilesData;

export const roastProfiles: RoastProfile[] = data.profiles;

export function getProfileById(id: string): RoastProfile | undefined {
  return data.profiles.find(p => p.id === id);
}
