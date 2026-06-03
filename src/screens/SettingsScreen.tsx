import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Audio } from 'expo-av';
import { SOUND_OPTIONS, useSoundPreference, AlertSoundKey } from '../hooks/useSoundPreference';
import { useRoastStore } from '../store/roastStore';
import { RootStackParamList } from '../../App';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Settings'>;
};

const THRESHOLD_OPTIONS = [5, 10, 15, 20, 30];

export default function SettingsScreen({ navigation }: Props) {
  const { soundKey, setSoundKey } = useSoundPreference();
  const alertThresholdSeconds = useRoastStore(s => s.alertThresholdSeconds);
  const setAlertThreshold = useRoastStore(s => s.setAlertThreshold);
  const bridgeIp = useRoastStore(s => s.bridgeIp);
  const setBridgeIp = useRoastStore(s => s.setBridgeIp);
  const wsStatus = useRoastStore(s => s.wsStatus);
  const tempAlertMinF = useRoastStore(s => s.tempAlertMinF);
  const setTempAlertMinF = useRoastStore(s => s.setTempAlertMinF);
  const tempAlertMaxF = useRoastStore(s => s.tempAlertMaxF);
  const setTempAlertMaxF = useRoastStore(s => s.setTempAlertMaxF);
  const tempAlertPct = useRoastStore(s => s.tempAlertPct);
  const setTempAlertPct = useRoastStore(s => s.setTempAlertPct);

  async function previewSound(key: AlertSoundKey) {
    const option = SOUND_OPTIONS.find(o => o.key === key);
    if (!option || option.require === null) return;
    const { sound } = await Audio.Sound.createAsync(option.require, { shouldPlay: true, volume: 1.0 });
    sound.setOnPlaybackStatusUpdate(status => {
      if ('didJustFinish' in status && status.didJustFinish) sound.unloadAsync();
    });
  }

  async function handleSoundSelect(key: AlertSoundKey) {
    await setSoundKey(key);
    previewSound(key);
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Settings</Text>
        <View style={styles.backButton} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>

        {/* Alert Threshold */}
        <Text style={styles.sectionLabel}>PRE-ALERT THRESHOLD</Text>
        <Text style={styles.sectionHint}>How many seconds before a step's trigger time to fire the alert</Text>
        <View style={styles.pillRow}>
          {THRESHOLD_OPTIONS.map(secs => (
            <TouchableOpacity
              key={secs}
              style={[styles.pill, alertThresholdSeconds === secs && styles.pillActive]}
              onPress={() => setAlertThreshold(secs)}
            >
              <Text style={[styles.pillText, alertThresholdSeconds === secs && styles.pillTextActive]}>
                {secs}s
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Alert Sound */}
        <Text style={[styles.sectionLabel, { marginTop: 32 }]}>ALERT SOUND</Text>
        <Text style={styles.sectionHint}>Tap to select and preview</Text>
        {SOUND_OPTIONS.map(option => (
          <TouchableOpacity
            key={option.key}
            style={[styles.soundRow, soundKey === option.key && styles.soundRowActive]}
            onPress={() => handleSoundSelect(option.key)}
          >
            <View style={styles.soundInfo}>
              <Text style={[styles.soundLabel, soundKey === option.key && styles.soundLabelActive]}>
                {option.label}
              </Text>
              <Text style={styles.soundDesc}>{option.description}</Text>
            </View>
            {soundKey === option.key && <Text style={styles.checkmark}>✓</Text>}
          </TouchableOpacity>
        ))}

        {/* Temperature Alert */}
        <Text style={[styles.sectionLabel, { marginTop: 32 }]}>LIVE TEMP ALERT</Text>
        <Text style={styles.sectionHint}>Alert when BT is within this range of the next target (live mode only)</Text>

        <Text style={[styles.sectionLabel, { marginTop: 16, fontSize: 11 }]}>MINIMUM °F</Text>
        <View style={styles.pillRow}>
          {[2, 3, 5, 8, 10].map(val => (
            <TouchableOpacity
              key={val}
              style={[styles.pill, tempAlertMinF === val && styles.pillActive]}
              onPress={() => setTempAlertMinF(val)}
            >
              <Text style={[styles.pillText, tempAlertMinF === val && styles.pillTextActive]}>
                {val}°F
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={[styles.sectionLabel, { marginTop: 16, fontSize: 11 }]}>MAXIMUM °F</Text>
        <View style={styles.pillRow}>
          {[8, 10, 15, 20, 25].map(val => (
            <TouchableOpacity
              key={val}
              style={[styles.pill, tempAlertMaxF === val && styles.pillActive]}
              onPress={() => setTempAlertMaxF(val)}
            >
              <Text style={[styles.pillText, tempAlertMaxF === val && styles.pillTextActive]}>
                {val}°F
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={[styles.sectionLabel, { marginTop: 16, fontSize: 11 }]}>% OF GAP</Text>
        <View style={styles.pillRow}>
          {[15, 20, 30, 40, 50].map(val => (
            <TouchableOpacity
              key={val}
              style={[styles.pill, tempAlertPct === val && styles.pillActive]}
              onPress={() => setTempAlertPct(val)}
            >
              <Text style={[styles.pillText, tempAlertPct === val && styles.pillTextActive]}>
                {val}%
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Artisan Bridge */}
        <Text style={[styles.sectionLabel, { marginTop: 32 }]}>ARTISAN BRIDGE</Text>
        <Text style={styles.sectionHint}>IP address of the computer running bridge.py (e.g. 192.168.1.42)</Text>
        <View style={styles.bridgeRow}>
          <TextInput
            style={styles.bridgeInput}
            value={bridgeIp}
            onChangeText={setBridgeIp}
            placeholder="192.168.1.42"
            placeholderTextColor="#444"
            keyboardType="decimal-pad"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <View style={[styles.statusDot, styles[`statusDot_${wsStatus}`]]} />
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  backButton: { width: 70 },
  backText: { color: '#888', fontSize: 16 },
  title: { color: '#FFF', fontSize: 18, fontWeight: '700' },

  scroll: { padding: 20 },

  sectionLabel: {
    color: '#666',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.2,
    marginBottom: 8,
  },
  sectionHint: {
    color: '#555',
    fontSize: 13,
    marginBottom: 16,
  },

  pillRow: {
    flexDirection: 'row',
    gap: 10,
  },
  pill: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#1E1E1E',
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  pillActive: {
    backgroundColor: '#7C4A00',
    borderColor: '#E67E22',
  },
  pillText: { color: '#666', fontSize: 15, fontWeight: '600' },
  pillTextActive: { color: '#FFB347' },

  soundRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E1E1E',
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  soundRowActive: {
    borderColor: '#E67E22',
    backgroundColor: '#241800',
  },
  soundInfo: { flex: 1 },
  soundLabel: { color: '#CCC', fontSize: 16, fontWeight: '600' },
  soundLabelActive: { color: '#FFB347' },
  soundDesc: { color: '#555', fontSize: 13, marginTop: 2 },
  checkmark: { color: '#FFB347', fontSize: 18, fontWeight: '700' },

  bridgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  bridgeInput: {
    flex: 1,
    backgroundColor: '#1E1E1E',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    color: '#FFF',
    fontSize: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  statusDot_disconnected: { backgroundColor: '#444' },
  statusDot_connecting:   { backgroundColor: '#E67E22' },
  statusDot_connected:    { backgroundColor: '#2ECC71' },
  statusDot_error:        { backgroundColor: '#E74C3C' },
});
