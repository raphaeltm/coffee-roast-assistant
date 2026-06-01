import { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';
import ProfileSelectScreen from './src/screens/ProfileSelectScreen';
import RecipeScreen from './src/screens/RecipeScreen';
import RoastScreen from './src/screens/RoastScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import { useRoastStore } from './src/store/roastStore';

export type RootStackParamList = {
  ProfileSelect: undefined;
  Recipe: undefined;
  Roast: undefined;
  Settings: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  const loadSettings = useRoastStore(s => s.loadSettings);
  useEffect(() => { loadSettings(); }, []);

  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <NavigationContainer>
        <Stack.Navigator
          initialRouteName="ProfileSelect"
          screenOptions={{ headerShown: false }}
        >
          <Stack.Screen name="ProfileSelect" component={ProfileSelectScreen} />
          <Stack.Screen name="Recipe" component={RecipeScreen} />
          <Stack.Screen name="Roast" component={RoastScreen} />
          <Stack.Screen name="Settings" component={SettingsScreen} />
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
