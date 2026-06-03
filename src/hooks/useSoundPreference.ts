import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@alert_sound';

export type AlertSoundKey =
  | 'alert'
  | 'woodblock_calaudio'
  | 'woodblock_kwahmah'
  | 'click_snap_waveplay'
  | 'claves_gewa_dry'
  | 'bell_highding'
  | 'bell_dingdong'
  | 'none';

export interface SoundOption {
  key: AlertSoundKey;
  label: string;
  description: string;
  /** null means no sound */
  require: number | null;
}

// Central registry — require() calls must be static so bundler can resolve them
export const SOUND_OPTIONS: SoundOption[] = [
  {
    key: 'woodblock_calaudio',
    label: 'Woodblock',
    description: 'Short wooden tap · 470ms · CC0',
    require: require('../../assets/sounds/woodblock_calaudio.mp3'),
  },
  {
    key: 'woodblock_kwahmah',
    label: 'Wood pop',
    description: 'Very short crisp pop · 104ms · CC-BY',
    require: require('../../assets/sounds/woodblock_kwahmah.mp3'),
  },
  {
    key: 'click_snap_waveplay',
    label: 'Click / Snap',
    description: 'Mechanical snap · 336ms · CC0',
    require: require('../../assets/sounds/click_snap_waveplay.mp3'),
  },
  {
    key: 'claves_gewa_dry',
    label: 'Clave',
    description: 'Dry wooden clave strike · 816ms · CC0',
    require: require('../../assets/sounds/claves_gewa_dry.mp3'),
  },
  {
    key: 'bell_highding',
    label: 'Bell — single',
    description: 'Soft high bell ding · 768ms · CC0',
    require: require('../../assets/sounds/bell_highding.mp3'),
  },
  {
    key: 'bell_dingdong',
    label: 'Bell — double',
    description: 'Soft double chime · 864ms · CC0',
    require: require('../../assets/sounds/bell_dingdong.mp3'),
  },
  {
    key: 'alert',
    label: 'Original alert',
    description: 'Default beep · 2s · original',
    require: require('../../assets/sounds/alert.mp3'),
  },
  {
    key: 'none',
    label: 'None',
    description: 'Haptic only — no sound',
    require: null,
  },
];

const DEFAULT_KEY: AlertSoundKey = 'claves_gewa_dry';

export function useSoundPreference() {
  const [soundKey, setSoundKeyState] = useState<AlertSoundKey>(DEFAULT_KEY);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then(val => {
      if (val && SOUND_OPTIONS.some(o => o.key === val)) {
        setSoundKeyState(val as AlertSoundKey);
      }
      setLoaded(true);
    });
  }, []);

  const setSoundKey = useCallback(async (key: AlertSoundKey) => {
    setSoundKeyState(key);
    await AsyncStorage.setItem(STORAGE_KEY, key);
  }, []);

  const currentOption = SOUND_OPTIONS.find(o => o.key === soundKey) ?? SOUND_OPTIONS[0];

  return { soundKey, currentOption, setSoundKey, loaded };
}
