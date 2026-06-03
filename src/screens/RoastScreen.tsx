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
import { useSoundPreference } from '../hooks/useSoundPreference';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Roast'>;
};

export default function RoastScreen({ navigation }: Props) {
  const { currentOption } = useSoundPreference();
  const engineState     = useRoastStore(s => s.engineState);
  const selectedProfile = useRoastStore(s => s.selectedProfile);
  const toggleAction    = useRoastStore(s => s.toggleAction);
  const advanceEvent    = useRoastStore(s => s.advanceEvent);
  const resetRoast      = useRoastStore(s => s.resetRoast);
  const elapsedSeconds  = useRoastStore(s => s.elapsedSeconds);
  const roastStartedAt  = useRoastStore(s => s.roastStartedAt);
  const preAlertActive  = useRoastStore(s => s.preAlertActive);
  const secondsUntilNext = useRoastStore(s => s.secondsUntilNext);
  const btLive          = useRoastStore(s => s.btLive);
  const rorLive         = useRoastStore(s => s.rorLive);
  const wsStatus        = useRoastStore(s => s.wsStatus);
  const bridgeIp        = useRoastStore(s => s.bridgeIp);
  const tempAlertMinF   = useRoastStore(s => s.tempAlertMinF);
  const tempAlertMaxF   = useRoastStore(s => s.tempAlertMaxF);
  const tempAlertPct    = useRoastStore(s => s.tempAlertPct);
  const isLive = btLive !== null && wsStatus === 'connected';
  const showManualWarning = bridgeIp.trim() !== '' && wsStatus !== 'connected';

  // Derived timer values
  const currentEst = engineState?.currentEvent?.estimated_time_seconds ?? null;
  const isOverdue = roastStartedAt !== null && currentEst !== null && elapsedSeconds > currentEst;

  const timerDisplay = roastStartedAt !== null ? formatTime(elapsedSeconds) : null;
  const timeRemaining = roastStartedAt !== null && currentEst !== null
    ? currentEst - elapsedSeconds : null;
  const timeRemainingDisplay = timeRemaining !== null
    ? (timeRemaining < 0 ? `-${formatTime(Math.abs(timeRemaining))}` : formatTime(timeRemaining))
    : '--:--';

  // Current event's target temp (what we need to be at for this step)
  const currentTriggerTemp = engineState?.currentEvent?.trigger.temperature ?? null;
  // Next event's target temp (what we're heading towards)
  const nextTriggerTemp = engineState?.nextEvent?.trigger.temperature ?? null;

  // Effective target: what BT is climbing towards right now
  // - If BT < current trigger: approaching current step (e.g. rising to 405 for charge)
  // - If BT > current trigger and next is higher: approaching next step
  // - If temp is dropping: no effective target (no alert)
  const isRising = rorLive !== null && rorLive > 0;
  const { effectiveTarget, effectiveGap } = (() => {
    if (!isLive || btLive === null || !isRising) return { effectiveTarget: null, effectiveGap: null };

    // BT hasn't reached current event's trigger yet (e.g. climbing to charge at 405)
    if (currentTriggerTemp !== null && btLive < currentTriggerTemp) {
      const prevIndex = (engineState?.currentEventIndex ?? 1) - 1;
      const prevTrigger = prevIndex >= 0
        ? selectedProfile?.events[prevIndex]?.trigger.temperature ?? null : null;
      const gap = prevTrigger !== null && currentTriggerTemp > prevTrigger
        ? currentTriggerTemp - prevTrigger : null;
      return { effectiveTarget: currentTriggerTemp, effectiveGap: gap };
    }

    // Normal case: heading towards next trigger (must be higher than current BT)
    if (nextTriggerTemp !== null && nextTriggerTemp > btLive) {
      const gap = currentTriggerTemp !== null && nextTriggerTemp > currentTriggerTemp
        ? nextTriggerTemp - currentTriggerTemp : null;
      return { effectiveTarget: nextTriggerTemp, effectiveGap: gap };
    }

    return { effectiveTarget: null, effectiveGap: null };
  })();

  // ETA to effective target (advisory only)
  const etaSeconds: number | null = (() => {
    if (!isLive || btLive === null || rorLive === null || rorLive <= 0 || effectiveTarget === null) return null;
    const delta = effectiveTarget - btLive;
    if (delta <= 0) return 0;
    return Math.round((delta / rorLive) * 60);
  })();

  // Temperature approach alert: fires only when rising towards target
  const tempAlertThreshold = (effectiveGap !== null && effectiveGap > 0)
    ? Math.min(tempAlertMaxF, Math.max(tempAlertMinF, Math.round(effectiveGap * tempAlertPct / 100)))
    : tempAlertMinF;
  const degreesToTarget = (effectiveTarget !== null && btLive !== null)
    ? effectiveTarget - btLive : null;
  const tempApproaching = isRising && degreesToTarget !== null && degreesToTarget > 0 && degreesToTarget <= tempAlertThreshold;

  // Blink when overdue (time), pre-alert (time), or approaching target temp (live)
  const shouldBlink = isOverdue || preAlertActive || tempApproaching;

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

  // Fire haptic + sound on pre-alert OR temp approach rising edge
  const prevAlertRef = useRef(false);
  const shouldAlert = preAlertActive || tempApproaching;
  useEffect(() => {
    if (shouldAlert && !prevAlertRef.current) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      if (currentOption.require !== null) {
        Audio.Sound.createAsync(
          currentOption.require,
          { shouldPlay: true, volume: 1.0 },
        ).then(({ sound }) => {
          sound.setOnPlaybackStatusUpdate(status => {
            if ('didJustFinish' in status && status.didJustFinish) sound.unloadAsync();
          });
        }).catch(() => {/* silent fail */});
      }
    }
    prevAlertRef.current = shouldAlert;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldAlert]);

  if (!engineState || !selectedProfile) return null;

  const { currentEvent, nextEvent, completedActions, isComplete } = engineState;
  const phase = currentEvent?.phase ?? 'preheat';
  const phaseColor = PHASE_COLORS[phase];
  const phaseTextColor = PHASE_TEXT_COLORS[phase];

  const actionEvents = selectedProfile.events.filter(e => e.type === 'action');
  const totalSteps   = actionEvents.length;
  const isInfoEvent  = currentEvent?.type === 'info';
  const actionStepNumber = currentEvent
    ? selectedProfile.events.slice(0, (currentEvent.index ?? 0) + 1).filter(e => e.type === 'action').length
    : 0;
  const infoNumber = currentEvent
    ? selectedProfile.events.slice(0, (currentEvent.index ?? 0) + 1).filter(e => e.type === 'info').length
    : 0;
  const stepLabel = isInfoEvent ? `Info ${infoNumber}` : `${actionStepNumber}/${totalSteps}`;

  const actionsComplete = currentEvent
    ? areActionsComplete(engineState, currentEvent.index) : true;
  const canAdvance = currentEvent?.type === 'info' || actionsComplete;

  const profileShort = (selectedProfile.name ?? '').slice(0, 10);

  // Current event's target temp (for the action card info strip)
  const currentTargetTemp = currentEvent?.trigger.temperature ?? null;
  const currentTargetUnit = currentEvent?.trigger.unit ?? 'F';

  function handleExit() {
    resetRoast();
    navigation.goBack();
  }

  return (
    <SafeAreaView style={styles.container}>

      {/* ─── Top header: phase + mode + profile ─── */}
      <View style={[styles.topHeader, { backgroundColor: phaseColor }]}>
        <Text style={[styles.topHeaderPhase, { color: phaseTextColor }]}>
          {PHASE_LABELS[phase]}
        </Text>
        {isLive ? (
          <Text style={styles.modeIndicatorLive}>● LIVE</Text>
        ) : showManualWarning ? (
          <Text style={styles.modeIndicatorManual}>⚠ MANUAL</Text>
        ) : null}
        <Text style={[styles.topHeaderProfile, { color: phaseTextColor }]}>
          {profileShort}
        </Text>
      </View>

      {/* ─── Live bar: target / BT / elapsed — always visible ─── */}
      <View style={styles.liveBar}>
        {/* Left — effective target + ETA */}
        <View style={styles.liveBarSide}>
          <Text style={styles.liveBarValue}>
            {effectiveTarget !== null ? `${effectiveTarget}°F` : (currentTriggerTemp !== null ? `${currentTriggerTemp}°F` : '—')}
          </Text>
          <Text style={styles.liveBarLabel}>target</Text>
          {etaSeconds !== null && etaSeconds > 0 && (
            <Text style={styles.liveBarEta}>~{formatTime(etaSeconds)}</Text>
          )}
        </View>

        {/* Centre — live BT (or ref temp in manual mode) */}
        <View style={styles.liveBarCenter}>
          {isLive ? (
            <>
              <Animated.Text style={[
                styles.liveBarBT,
                { opacity: tempApproaching ? blinkAnim : 1 },
                tempApproaching && styles.liveBarBTApproaching,
              ]}>
                {Math.round(btLive!)}°F
              </Animated.Text>
              {rorLive !== null && (
                <Text style={[styles.liveBarRoR, rorLive > 0 ? styles.rorRising : styles.rorDropping]}>
                  {rorLive > 0 ? '▲' : '▼'} {Math.abs(Math.round(rorLive))}°/min
                </Text>
              )}
            </>
          ) : (
            <>
              <Text style={styles.liveBarBT}>
                {currentTargetTemp !== null ? `${currentTargetTemp}°${currentTargetUnit}` : '—'}
              </Text>
              <Text style={styles.liveBarRefLabel}>ref temp</Text>
            </>
          )}
        </View>

        {/* Right — elapsed time */}
        <View style={styles.liveBarSide}>
          <Text style={styles.liveBarValue}>
            {timerDisplay ?? '--:--'}
          </Text>
          <Text style={styles.liveBarLabel}>elapsed</Text>
        </View>
      </View>

      {/* ─── Scrollable content ─── */}
      <ScrollView contentContainerStyle={styles.scroll}>

        {/* Current event */}
        {currentEvent && !isComplete && (
          <View style={styles.eventCard}>

            {/* Info strip: target · remaining · step */}
            <View style={[styles.infoStrip, { backgroundColor: phaseColor }]}>
              <View style={styles.infoStripItem}>
                <Text style={[styles.infoStripValue, { color: phaseTextColor }]}>
                  {currentTargetTemp}°{currentTargetUnit}
                </Text>
                <Text style={[styles.infoStripLabel, { color: phaseTextColor }]}>
                  {currentEvent.trigger.source} trigger
                </Text>
              </View>
              <View style={styles.infoStripItem}>
                <Animated.Text style={[
                  styles.infoStripValue,
                  { color: phaseTextColor, opacity: isOverdue ? blinkAnim : 1 },
                  isOverdue && { color: '#FF4444' },
                ]}>
                  {timeRemainingDisplay}
                </Animated.Text>
                <Text style={[styles.infoStripLabel, { color: phaseTextColor }]}>remaining</Text>
              </View>
              <View style={styles.infoStripItem}>
                <Text style={[styles.infoStripValue, { color: phaseTextColor }]}>
                  {stepLabel}
                </Text>
                <Text style={[styles.infoStripLabel, { color: phaseTextColor }]}>
                  {isInfoEvent ? 'note' : 'step'}
                </Text>
              </View>
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

        {/* Next button */}
        {!isComplete && (
          <TouchableOpacity
            style={[
              styles.nextButton,
              !canAdvance && !shouldAlert && styles.nextButtonDisabled,
              shouldAlert && styles.nextButtonAlert,
            ]}
            onPress={advanceEvent}
            disabled={!canAdvance}
          >
            <Text style={[
              styles.nextButtonText,
              !canAdvance && !shouldAlert && styles.nextButtonTextDisabled,
              shouldAlert && styles.nextButtonTextAlert,
            ]}>
              {tempApproaching && canAdvance
                ? `🌡 Target approaching — Next →`
                : preAlertActive && secondsUntilNext !== null
                  ? `⏱ Engage in ~${secondsUntilNext}s${canAdvance ? ' — Next →' : ''}`
                  : !canAdvance
                    ? 'Check all actions to continue'
                    : 'Next →'}
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

  /* ─── Top header ─── */
  topHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  topHeaderPhase: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    width: 90,
  },
  topHeaderProfile: {
    fontSize: 13,
    fontWeight: '600',
    opacity: 0.8,
    textAlign: 'right',
    width: 90,
  },
  modeIndicatorLive: {
    color: '#2ECC71',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  modeIndicatorManual: {
    color: '#E67E22',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
  },

  /* ─── Live bar ─── */
  liveBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1A1A1A',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#2A2A2A',
  },
  liveBarSide: {
    width: 80,
    alignItems: 'center',
  },
  liveBarCenter: {
    flex: 1,
    alignItems: 'center',
  },
  liveBarValue: {
    color: '#CCC',
    fontSize: 18,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  liveBarLabel: {
    color: '#666',
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: 2,
  },
  liveBarEta: {
    color: '#888',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
    fontVariant: ['tabular-nums'],
  },
  liveBarBT: {
    color: '#FFF',
    fontSize: 42,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  liveBarBTApproaching: {
    color: '#FFB347',
  },
  liveBarRoR: {
    color: '#888',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 2,
  },
  liveBarRefLabel: {
    color: '#666',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: 2,
  },

  /* ─── Scrollable content ─── */
  scroll: { padding: 16, gap: 14 },

  eventCard: {
    backgroundColor: '#1E1E1E',
    borderRadius: 16,
    overflow: 'hidden',
  },

  /* Info strip inside event card */
  infoStrip: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 14,
    paddingHorizontal: 12,
  },
  infoStripItem: {
    alignItems: 'center',
  },
  infoStripValue: {
    fontSize: 16,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  infoStripLabel: {
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    opacity: 0.7,
    marginTop: 2,
  },

  actionList: { padding: 20, gap: 16 },
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
  nextButtonAlert: {
    backgroundColor: '#7C4A00',
    borderWidth: 1,
    borderColor: '#E67E22',
  },
  nextButtonTextAlert: {
    color: '#FFB347',
    fontSize: 18,
    fontWeight: '700',
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

  exitButton: {
    padding: 18,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    alignItems: 'center',
  },
  exitButtonText: { color: '#555', fontSize: 15 },

  rorRising: { color: '#FF6B6B' },
  rorDropping: { color: '#4DA6FF' },
});
