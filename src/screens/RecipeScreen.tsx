import { useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useRoastStore } from '../store/roastStore';
import { PHASE_COLORS } from '../utils/phaseColors';
import { RootStackParamList } from '../../App';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Recipe'>;
};

export default function RecipeScreen({ navigation }: Props) {
  const selectedProfile = useRoastStore(s => s.selectedProfile);
  const startRoast      = useRoastStore(s => s.startRoast);

  useEffect(() => {
    if (!selectedProfile) navigation.goBack();
  }, [selectedProfile, navigation]);

  if (!selectedProfile) return null;

  function handleStart() {
    startRoast();
    navigation.navigate('Roast');
  }

  const actionCount = selectedProfile.events.filter(e => e.type === 'action').length;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Ready to Roast</Text>
        <View style={styles.backButton} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>

        {/* Profile name */}
        <View style={[styles.profileBadge, { backgroundColor: PHASE_COLORS.preheat }]}>
          <Text style={styles.profileName}>{selectedProfile.name}</Text>
          <Text style={styles.profileMeta}>{selectedProfile.roaster} · {actionCount} steps</Text>
        </View>

        {/* Recipe */}
        {selectedProfile.recipe ? (
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Recipe</Text>
            <Text style={styles.cardBody}>{selectedProfile.recipe}</Text>
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Recipe</Text>
            <Text style={styles.cardBodyMuted}>No recipe set — add one in the admin tool.</Text>
          </View>
        )}

        {/* DTP target */}
        {selectedProfile.dtp_target != null && (
          <View style={styles.card}>
            <Text style={styles.cardLabel}>DTP Target</Text>
            <Text style={styles.dtpValue}>{selectedProfile.dtp_target}%</Text>
            <Text style={styles.cardBodyMuted}>Development Time Percent — tracked after First Crack</Text>
          </View>
        )}

      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.startButton} onPress={handleStart}>
          <Text style={styles.startButtonText}>Start Roast →</Text>
        </TouchableOpacity>
      </View>
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
  headerTitle: { color: '#FFF', fontSize: 18, fontWeight: '700' },

  scroll: { padding: 20, gap: 16 },

  profileBadge: {
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
  },
  profileName: { color: '#FFF', fontSize: 28, fontWeight: '800' },
  profileMeta: { color: 'rgba(255,255,255,0.6)', fontSize: 14, marginTop: 4 },

  card: {
    backgroundColor: '#1E1E1E',
    borderRadius: 16,
    padding: 20,
    gap: 8,
  },
  cardLabel: {
    color: '#666',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontWeight: '700',
  },
  cardBody: { color: '#FFF', fontSize: 16, lineHeight: 24 },
  cardBodyMuted: { color: '#555', fontSize: 14, fontStyle: 'italic' },
  dtpValue: { color: '#FFF', fontSize: 36, fontWeight: '800' },

  footer: {
    padding: 20,
    paddingBottom: 8,
  },
  startButton: {
    backgroundColor: '#3B82F6',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
  },
  startButtonText: { color: '#FFF', fontSize: 18, fontWeight: '700' },
});
