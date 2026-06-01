import {
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Image,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { roastProfiles } from '../data';
import { useRoastStore } from '../store/roastStore';
import { RoastProfile } from '../types';
import { RootStackParamList } from '../../App';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'ProfileSelect'>;
};

export default function ProfileSelectScreen({ navigation }: Props) {
  const selectProfile = useRoastStore(s => s.selectProfile);

  function handleSelect(profile: RoastProfile) {
    selectProfile(profile);
    navigation.navigate('Recipe');
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.watermarkContainer} pointerEvents="none">
        <Image
          source={require('../../assets/E46 Inverted Logo.png')}
          style={styles.watermark}
        />
      </View>
      <TouchableOpacity style={styles.settingsButton} onPress={() => navigation.navigate('Settings')}>
        <Text style={styles.settingsIcon}>⚙️</Text>
      </TouchableOpacity>
      <Text style={styles.title}>Buongiorno</Text>
      <Text style={styles.subtitle}>Select a roast profile</Text>

      <FlatList
        data={roastProfiles}
        keyExtractor={p => p.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.card} onPress={() => handleSelect(item)}>
            <Text style={styles.cardName}>{item.name}</Text>
            <Text style={styles.cardMeta}>{item.roaster} · {item.events.length} events</Text>
            <Text style={styles.cardArrow}>→</Text>
          </TouchableOpacity>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111',
  },
  watermarkContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  watermark: {
    width: 320,
    height: 320,
    resizeMode: 'contain',
    opacity: 0.08,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
    marginTop: 32,
  },
  subtitle: {
    fontSize: 15,
    color: '#888',
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 32,
  },
  list: {
    paddingHorizontal: 24,
    gap: 16,
  },
  card: {
    backgroundColor: '#36363695',
    borderRadius: 16,
    padding: 24,
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
    flex: 1,
  },
  cardMeta: {
    fontSize: 13,
    color: '#888',
    marginRight: 12,
  },
  cardArrow: {
    fontSize: 20,
    color: '#555',
  },
  settingsButton: {
    position: 'absolute',
    top: 16,
    right: 20,
    zIndex: 10,
    padding: 8,
  },
  settingsIcon: {
    fontSize: 22,
  },
});
