import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useEffect, useRef } from 'react';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as Haptics from 'expo-haptics';
import { Audio } from 'expo-av';
import { useRoastStore } from '../store/roastStore';
import { PHASE_COLORS, PHASE_TEXT_COLORS, PHASE_LABELS } from '../utils/phaseColors';
import { ActionEvent, InfoEvent } from '../types';
import { areActionsComplete } from '../engine/roastEngine';
import { formatTime } from '../utils/formatTime';
import { RootStackParamList } from '../../App';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Roast'>;
};

export default function RoastScreen({ navigation }: Props) {
  const engineState     = useRoastStore(s => s.engineState);
  const selectedProfile = useRoastStore(s => s.selectedProfile);
  const toggleAction    = useRoastStore(s => s.toggleAction);
  const advanceEvent    = useRoastStore(s => s.advanceEvent);
  const resetRoast      = useRoastStore(s => s.resetRoast);
  const elapsedSeconds  = useRoastStore(s => s.elapsedSeconds);
  const roastStartedAt  = useRoastStore(s => s.roastStartedAt);
  const preAlertActive  = useRoastStore(s => s.preAlertActive);
  const secondsUntilNext = useRoastStore(s => s.secondsUntilNext);

  // Derived values computed before hooks (use optional chaining for safety)
  const currentEst = engineState?.currentEvent?.estimated_time_seconds ?? null;
  const isOverdue = roastStartedAt !== null && currentEst !== null && elapsedSeconds > currentEst;
  const shouldBlink = isOverdue || (currentEst === null && preAlertActive);

  // Blink animation — must be before early return
  const blinkAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (shouldBlink) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(blinkAnim, { toValue: 0.15, duration: 500, useNativeDriver: true }),
          Animated.timing(blinkAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
        ])
      );
      loop.start();
      return () => loop.stop();
    } else {
      blinkAnim.setValue(1);
    }
  }, [shouldBlink]);

  // Fire haptic + sound once each time pre-alert becomes active — must be before early return
  const prevPreAlert = useRef(false);
  useEffect(() => {
    if (preAlertActive && !prevPreAlert.current) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      Audio.Sound.createAsync(
        require('../../assets/alert.mp3'),
        { shouldPlay: true, volume: 1.0 },
      ).then(({ sound }) => {
        sound.setOnPlaybackStatusUpdate(status => {
          if ('didJustFinish' in status && status.didJustFinish) sound.unloadAsync();
        });
      }).catch(() => {/* silent fail */});
    }
    prevPreAlert.current = preAlertActive;
  }, [preAlertActive]);

  if (!engineState || !selectedProfile) return null;

  const { currentEvent, nextEvent, completedActions, isComplete } = engineState;
  const phase = currentEvent?.phase ?? 'preheat';
  const phaseColor = PHASE_COLORS[phase];
  const phaseTextColor = PHASE_TEXT_COLORS[phase];
  const totalEvents = selectedProfile.events.length;
  const stepNumber  = (currentEvent?.index ?? 0) + 1;

  const actionsComplete = currentEvent
    ? areActionsComplete(engineState, currentEvent.index)
    : true;

  const canAdvance = currentEvent?.type === 'info' || actionsComplete;

  const timerDisplay = roastStartedAt !== null ? formatTime(elapsedSeconds) : null;

  const currentEstDisplay = currentEst !== null ? formatTime(currentEst) : '--:--';

  function handleExit() {
    resetRoast();
    navigation.goBack();
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Phase header */}
      <View style={[styles.phaseBar, { backgroundColor: phaseColor }]}>
        <Text style={[styles.phaseLabel, { color: phaseTextColor }]}>
          {PHASE_LABELS[phase]}
        </Text>
        {timerDisplay && (
          <View style={styles.timerGroup}>
            <Animated.Text style={[
              styles.currentEstDisplay,
              { opacity: blinkAnim },
              isOverdue && { color: '#FF4444', fontWeight: '800' },
              (currentEst === null && preAlertActive) && { color: '#FFB347', fontWeight: '800' },
              (!isOverdue && currentEst !== null) && { color: phaseTextColor },
            ]}>
              {currentEstDisplay}
            </Animated.Text>
            <Text style={[styles.timerDisplay, { color: phaseTextColor }]}>
              ▶ {timerDisplay}
            </Text>
          </View>
        )}
        <Text style={[styles.stepCounter, { color: phaseTextColor }]}>
          {stepNumber} / {totalEvents}
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>

        {/* Current event */}
        {currentEvent && !isComplete && (
          <View style={styles.eventCard}>
            {/* Temperature reference (informational only in MVP 1) */}
            <View style={[styles.tempBadge, { backgroundColor: phaseColor }]}>
              <Text style={[styles.tempLabel, { color: phaseTextColor }]}>
                {currentEvent.trigger.source} reference
              </Text>
              <Text style={[styles.tempValue, { color: phaseTextColor }]}>
                {currentEvent.trigger.temperature}°{currentEvent.trigger.unit}
              </Text>
            </View>

            {/* Action checkboxes */}
            {currentEvent.type === 'action' && (
              <View style={styles.actionList}>
                <Text style={styles.sectionTitle}>Actions</Text>
                {(currentEvent as ActionEvent).actions.map((action, i) => {
                  const done = completedActions[currentEvent.index]?.[i] ?? false;
                  return (
                    <TouchableOpacity
                      key={i}
                      style={styles.actionRow}
                      onPress={() => toggleAction(currentEvent.index, i)}
                    >
                      <View style={[styles.checkbox, done && { backgroundColor: phaseColor, borderColor: phaseColor }]}>
                        {done && <Text style={styles.checkmark}>✓</Text>}
                      </View>
                      <Text style={[styles.actionText, done && styles.actionTextDone]}>
                        {action}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
                {(currentEvent as ActionEvent).notes?.map((note, i) => (
                  <Text key={i} style={styles.noteText}>ℹ {note}</Text>
                ))}
              </View>
            )}

            {/* Info event */}
            {currentEvent.type === 'info' && (
              <View style={styles.actionList}>
                <Text style={styles.sectionTitle}>Note</Text>
                {(currentEvent as InfoEvent).info.map((line, i) => (
                  <Text key={i} style={styles.infoText}>• {line}</Text>
                ))}
              </View>
            )}
          </View>
        )}

        {/* Roast complete */}
        {isComplete && (
          <View style={styles.completeCard}>
            <Text style={styles.completeEmoji}>☕</Text>
            <Text style={styles.completeText}>Roast complete!</Text>
          </View>
        )}

        {/* Next event preview */}
        {nextEvent && !isComplete && (
          <View style={styles.nextCard}>
            <Text style={styles.nextLabel}>Up next</Text>
            <Text style={styles.nextTemp}>
              {nextEvent.trigger.temperature}°{nextEvent.trigger.unit}
              <Text style={styles.nextSource}> ({nextEvent.trigger.source})</Text>
            </Text>
            {nextEvent.type === 'action' && (
              <Text style={styles.nextActions}>
                {(nextEvent as ActionEvent).actions.join('  ·  ')}
              </Text>
            )}
            {nextEvent.type === 'info' && (
              <Text style={styles.nextActions}>
                {(nextEvent as InfoEvent).info[0]}
              </Text>
            )}
          </View>
        )}

        {/* Pre-alert banner */}
        {preAlertActive && secondsUntilNext !== null && (
          <View style={styles.preAlertBanner}>
            <Text style={styles.preAlertText}>
              ⏱ Trigger in ~{secondsUntilNext}s
            </Text>
          </View>
        )}

        {/* Next button */}
        {!isComplete && (
          <TouchableOpacity
            style={[styles.nextButton, !canAdvance && styles.nextButtonDisabled]}
            onPress={advanceEvent}
            disabled={!canAdvance}
          >
            <Text style={[styles.nextButtonText, !canAdvance && styles.nextButtonTextDisabled]}>
              {canAdvance ? 'Next →' : 'Check all actions to continue'}
            </Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity style={styles.exitButton} onPress={handleExit}>
          <Text style={styles.exitButtonText}>Exit Roast</Text>
        </TouchableOpacity>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111' },

  phaseBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  phaseLabel: { fontSize: 16, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
  timerGroup: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  currentEstDisplay: { fontSize: 13, fontWeight: '600', fontVariant: ['tabular-nums'] },
  timerDisplay: { fontSize: 14, fontWeight: '600', opacity: 0.85, fontVariant: ['tabular-nums'] },
  stepCounter: { fontSize: 14, opacity: 0.8 },

  scroll: { padding: 20, gap: 16 },

  eventCard: {
    backgroundColor: '#1E1E1E',
    borderRadius: 16,
    overflow: 'hidden',
  },
  tempBadge: {
    padding: 28,
    alignItems: 'center',
  },
  tempLabel: { fontSize: 13, textTransform: 'uppercase', letterSpacing: 1, opacity: 0.8 },
  tempValue: { fontSize: 58, fontWeight: '800', marginTop: 4 },

  actionList: { padding: 24, gap: 18 },
  sectionTitle: { color: '#888', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 },

  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  checkbox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#444',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkmark: { color: '#FFF', fontSize: 17, fontWeight: '700' },
  actionText: { color: '#FFF', fontSize: 19, flex: 1 },
  actionTextDone: { color: '#555', textDecorationLine: 'line-through' },
  noteText: { color: '#888', fontSize: 13, fontStyle: 'italic' },
  infoText: { color: '#FFF', fontSize: 16, lineHeight: 24 },

  nextCard: {
    backgroundColor: '#1A1A1A',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    gap: 4,
    opacity: 0.45,
  },
  nextLabel: { color: '#9e9d9d', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 },
  nextTemp: { color: '#FFF', fontSize: 18, fontWeight: '600' },
  nextSource: { color: '#888', fontSize: 14, fontWeight: '400' },
  nextActions: { color: '#888', fontSize: 14, marginTop: 4 },

  nextButton: {
    backgroundColor: '#2A2A2A',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
  },
  nextButtonDisabled: {
    backgroundColor: '#1A1A1A',
  },
  nextButtonText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '700',
  },
  nextButtonTextDisabled: {
    color: '#444',
    fontSize: 15,
    fontWeight: '400',
  },

  completeCard: {
    backgroundColor: '#1E3A1E',
    borderRadius: 16,
    padding: 40,
    alignItems: 'center',
    gap: 12,
  },
  completeEmoji: { fontSize: 48 },
  completeText: { color: '#4ADE80', fontSize: 24, fontWeight: '700' },

  preAlertBanner: {
    backgroundColor: '#7C4A00',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E67E22',
    opacity: 0.45,
  },
  preAlertText: {
    color: '#FFB347',
    fontSize: 16,
    fontWeight: '700',
  },
  exitButton: {
    padding: 18,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    alignItems: 'center',
  },
  exitButtonText: { color: '#555', fontSize: 15 },
});
