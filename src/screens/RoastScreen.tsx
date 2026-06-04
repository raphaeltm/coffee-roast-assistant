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
import { useSoundPreference, SOUND_OPTIONS } from '../hooks/useSoundPreference';

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
  const showManualWarning = bridgeIp.trim() !== '' && wsStatus !== 'connected' && wsStatus !== 'connecting';

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
  const { effectiveTarget, effectiveGap, effectiveTargetEst } = (() => {
    if (!isLive || btLive === null || !isRising) return { effectiveTarget: null, effectiveGap: null, effectiveTargetEst: null };

    // BT hasn't reached current event's trigger yet (e.g. climbing to charge at 405)
    if (currentTriggerTemp !== null && btLive < currentTriggerTemp) {
      const prevIndex = (engineState?.currentEventIndex ?? 1) - 1;
      const prevTrigger = prevIndex >= 0
        ? selectedProfile?.events[prevIndex]?.trigger.temperature ?? null : null;
      const gap = prevTrigger !== null && currentTriggerTemp > prevTrigger
        ? currentTriggerTemp - prevTrigger : null;
      const est = engineState?.currentEvent?.estimated_time_seconds ?? null;
      return { effectiveTarget: currentTriggerTemp, effectiveGap: gap, effectiveTargetEst: est };
    }

    // Normal case: heading towards next trigger (must be higher than current BT)
    if (nextTriggerTemp !== null && nextTriggerTemp > btLive) {
      const gap = currentTriggerTemp !== null && nextTriggerTemp > currentTriggerTemp
        ? nextTriggerTemp - currentTriggerTemp : null;
      const est = engineState?.nextEvent?.estimated_time_seconds ?? null;
      return { effectiveTarget: nextTriggerTemp, effectiveGap: gap, effectiveTargetEst: est };
    }

    return { effectiveTarget: null, effectiveGap: null, effectiveTargetEst: null };
  })();

  // ETA to effective target (advisory, biased slightly early)
  // Uses RoR-based projection when RoR is stable (≥5°F/min), otherwise
  // falls back to profile time estimates. When both are available, takes
  // the minimum so the roaster is warned sooner rather than later.
  const MIN_ROR_FOR_ETA = 5; // °F/min — below this RoR is too unstable
  const etaSeconds: number | null = (() => {
    if (!isLive || btLive === null || effectiveTarget === null) return null;
    const delta = effectiveTarget - btLive;
    if (delta <= 0) return 0;

    // RoR-based ETA (only when RoR is stable enough)
    const rorEta = (rorLive !== null && rorLive >= MIN_ROR_FOR_ETA)
      ? Math.round((delta / rorLive) * 60)
      : null;

    // Time-based ETA from profile estimates
    const timeEta = (effectiveTargetEst !== null && roastStartedAt !== null)
      ? Math.max(0, effectiveTargetEst - elapsedSeconds)
      : null;

    // Use whichever is available; if both, take the smaller (err early)
    if (rorEta !== null && timeEta !== null) return Math.min(rorEta, timeEta);
    return rorEta ?? timeEta;
  })();

  // Temperature approach alert: fires only when rising towards target
  const tempAlertThreshold = (effectiveGap !== null && effectiveGap > 0)
    ? Math.min(tempAlertMaxF, Math.max(tempAlertMinF, Math.round(effectiveGap * tempAlertPct / 100)))
    : tempAlertMinF;
  const degreesToTarget = (effectiveTarget !== null && btLive !== null)
    ? effectiveTarget - btLive : null;
  const tempApproaching = isRising && degreesToTarget !== null && degreesToTarget > 0 && degreesToTarget <= tempAlertThreshold;

  // Critical alert: loud "original" sound at 400°F for Charge step only
  const CRITICAL_TEMP = 400;
  const isChargeNext = (() => {
    if (!selectedProfile || !engineState) return false;
    // Check if the effective target belongs to a Charge event
    const nextIdx = engineState.currentEventIndex + 1;
    const targetEvent = (currentTriggerTemp !== null && btLive !== null && btLive < currentTriggerTemp)
      ? engineState.currentEvent
      : (nextIdx < selectedProfile.events.length ? selectedProfile.events[nextIdx] : null);
    if (!targetEvent || targetEvent.type !== 'action') return false;
    return (targetEvent as ActionEvent).actions.some(a => a.toLowerCase().includes('charge'));
  })();
  const criticalAlert = isLive && isChargeNext && isRising && btLive !== null && btLive >= CRITICAL_TEMP && btLive < (effectiveTarget ?? Infinity);

  // Action overdue: BT is rising, passed current trigger by 5°F+, and user hasn't confirmed
  const actionOverdue = isLive && isRising && btLive !== null && currentTriggerTemp !== null
    && btLive >= currentTriggerTemp + 5
    && engineState !== null && engineState.currentEvent?.type === 'action'
    && !areActionsComplete(engineState, engineState.currentEvent.index);

  // Blink when overdue (time), pre-alert (time), approaching target temp (live), or action overdue
  const shouldBlink = isOverdue || preAlertActive || tempApproaching || criticalAlert || actionOverdue;

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

  // Play a sound file helper
  const playSound = useRef((soundRequire: number) => {
    Audio.Sound.createAsync(soundRequire, { shouldPlay: true, volume: 1.0 })
      .then(({ sound }) => {
        sound.setOnPlaybackStatusUpdate(status => {
          if ('didJustFinish' in status && status.didJustFinish) sound.unloadAsync();
        });
      }).catch(() => {/* silent fail */});
  }).current;

  // Normal alert: clave (or user-selected sound) on temp approach
  const prevAlertRef = useRef(false);
  useEffect(() => {
    if (tempApproaching && !prevAlertRef.current) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      if (currentOption.require !== null) playSound(currentOption.require);
    }
    prevAlertRef.current = tempApproaching;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tempApproaching]);

  // Critical alert: loud original sound at 400°F for Charge
  const criticalFiredRef = useRef(false);
  const criticalSoundRequire = SOUND_OPTIONS.find(o => o.key === 'alert')?.require ?? null;
  useEffect(() => {
    if (criticalAlert && !criticalFiredRef.current) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      if (criticalSoundRequire !== null) playSound(criticalSoundRequire);
      criticalFiredRef.current = true;
    }
    // Reset when we move past charge (effective target changes)
    if (!isChargeNext) criticalFiredRef.current = false;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [criticalAlert, isChargeNext]);

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

  // In live mode, engine auto-advances by temperature. Action buttons are
  // for roaster acknowledgment only. In manual mode, keep old Next-button flow.
  const actionsComplete = currentEvent
    ? areActionsComplete(engineState, currentEvent.index) : true;
  const canAdvance = currentEvent?.type === 'info' || actionsComplete;

  // Track whether the engine has moved ahead of acknowledged actions.
  // When the engine advances past a step whose actions weren't confirmed,
  // those actions become "overdue" — the buttons should blink.
  const pendingAcks: number[] = [];
  if (engineState && selectedProfile) {
    for (let i = 0; i < engineState.currentEventIndex; i++) {
      const ev = selectedProfile.events[i];
      if (ev.type === 'action' && !areActionsComplete(engineState, ev.index)) {
        pendingAcks.push(ev.index);
      }
    }
  }

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

            {/* Action buttons */}
            {currentEvent.type === 'action' && (
              <View style={styles.actionList}>
                <Text style={styles.sectionTitle}>Actions</Text>
                {(currentEvent as ActionEvent).actions.map((action, i) => {
                  const done = completedActions[currentEvent.index]?.[i] ?? false;
                  if (done) return null; // confirmed actions disappear
                  // In live mode: locked until BT is rising and reaches trigger (2°F tolerance)
                  const canTap = !isLive || (isRising && btLive !== null && currentTriggerTemp !== null && btLive >= currentTriggerTemp - 2);
                  // Overdue: BT rising, passed the target by 5°F+, user hasn't confirmed — blink
                  const overdue = canTap && isLive && isRising && btLive !== null && currentTriggerTemp !== null && btLive >= currentTriggerTemp + 5;
                  return (
                    <Animated.View key={i} style={overdue ? { opacity: blinkAnim } : undefined}>
                      <TouchableOpacity
                        style={[
                          styles.actionButton,
                          !canTap && styles.actionButtonLocked,
                          canTap && !overdue && styles.actionButtonReady,
                          overdue && styles.actionButtonOverdue,
                        ]}
                        onPress={() => {
                          if (!canTap) return;
                          toggleAction(currentEvent.index, i);
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                          // Always advance when the last action for this step is confirmed
                          const actions = (currentEvent as ActionEvent).actions;
                          const allOthersDone = actions.every((_, j) =>
                            j === i || (completedActions[currentEvent.index]?.[j] ?? false)
                          );
                          if (allOthersDone) {
                            // Small delay to let toggleAction's set() flush
                            setTimeout(() => advanceEvent(), 0);
                          }
                        }}
                      >
                        <Text style={[
                          styles.actionButtonText,
                          !canTap && styles.actionButtonTextLocked,
                        ]}>
                          {action}
                        </Text>
                      </TouchableOpacity>
                    </Animated.View>
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

        {/* Pending acknowledgments — blink reminder for actions the roaster hasn't confirmed */}
        {pendingAcks.length > 0 && selectedProfile && (
          <Animated.View style={[styles.pendingCard, { opacity: blinkAnim }]}>
            <Text style={styles.pendingTitle}>Confirm previous actions:</Text>
            {pendingAcks.map(evIdx => {
              const ev = selectedProfile.events.find(e => e.index === evIdx);
              if (!ev || ev.type !== 'action') return null;
              return (ev as ActionEvent).actions.map((action, i) => {
                const done = completedActions[evIdx]?.[i] ?? false;
                if (done) return null;
                return (
                  <TouchableOpacity
                    key={`${evIdx}-${i}`}
                    style={[styles.actionButton, styles.actionButtonOverdue]}
                    onPress={() => {
                      toggleAction(evIdx, i);
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    }}
                  >
                    <Text style={styles.actionButtonText}>{action}</Text>
                  </TouchableOpacity>
                );
              });
            })}
          </Animated.View>
        )}

        {/* Next button — manual mode fallback + info events */}
        {!isComplete && !isLive && (
          <TouchableOpacity
            style={[
              styles.nextButton,
              !canAdvance && styles.nextButtonDisabled,
            ]}
            onPress={advanceEvent}
            disabled={!canAdvance}
          >
            <Text style={[
              styles.nextButtonText,
              !canAdvance && styles.nextButtonTextDisabled,
            ]}>
              {preAlertActive && secondsUntilNext !== null
                ? `⏱ Engage in ~${secondsUntilNext}s${canAdvance ? ' — Next →' : ''}`
                : !canAdvance
                  ? 'Complete all actions to continue'
                  : 'Next →'}
            </Text>
          </TouchableOpacity>
        )}
        {/* Info events in live mode still need a Next button */}
        {!isComplete && isLive && currentEvent?.type === 'info' && (
          <TouchableOpacity
            style={styles.nextButton}
            onPress={advanceEvent}
          >
            <Text style={styles.nextButtonText}>Next →</Text>
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
    paddingVertical: 20,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#474747',
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
    fontSize: 21,
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
    fontWeight: '600',
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
    backgroundColor: '#222222',
    borderRadius: 16,
    overflow: 'hidden',
  },

  /* Info strip inside event card */
  infoStrip: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 19,
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

  /* Action buttons — replace checkboxes */
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#444',
    backgroundColor: '#1A1A1A',
    gap: 12,
  },
  actionButtonLocked: {
    borderColor: '#E67E22',
    backgroundColor: '#1A1400',
    opacity: 0.6,
  },
  actionButtonReady: {
    borderColor: '#5B9A6A',
    backgroundColor: '#0F1A12',
  },
  actionButtonDone: {
    borderColor: '#2A2A2A',
    backgroundColor: '#1A1A1A',
  },
  actionButtonOverdue: {
    borderColor: '#E74C3C',
    backgroundColor: '#1F0A0A',
  },
  actionButtonCheckmark: {
    color: '#5B9A6A',
    fontSize: 20,
    fontWeight: '700',
  },
  actionButtonText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '600',
    flex: 1,
  },
  actionButtonTextLocked: {
    color: '#888',
  },
  actionButtonTextDone: {
    color: '#555',
    textDecorationLine: 'line-through',
  },

  /* Pending acks card */
  pendingCard: {
    backgroundColor: '#1F0A0A',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E74C3C',
    gap: 10,
  },
  pendingTitle: {
    color: '#E74C3C',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
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
