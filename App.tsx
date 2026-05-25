import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';
import ProfileSelectScreen from './src/screens/ProfileSelectScreen';
import RoastScreen from './src/screens/RoastScreen';
import SettingsScreen from './src/screens/SettingsScreen';

export type RootStackParamList = {
  ProfileSelect: undefined;
  Roast: undefined;
  Settings: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <NavigationContainer>
        <Stack.Navigator
          initialRouteName="ProfileSelect"
          screenOptions={{ headerShown: false }}
        >
          <Stack.Screen name="ProfileSelect" component={ProfileSelectScreen} />
          <Stack.Screen name="Roast" component={RoastScreen} />
          <Stack.Screen name="Settings" component={SettingsScreen} />
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
