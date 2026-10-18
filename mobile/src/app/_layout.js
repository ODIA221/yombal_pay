import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts, SpaceGrotesk_600SemiBold, SpaceGrotesk_700Bold } from '@expo-google-fonts/space-grotesk';
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold } from '@expo-google-fonts/inter';
import { AuthProvider, useAuth } from '../lib/auth';
import { Loading } from '../components/ui';
import { colors, fonts } from '../theme';

// En-têtes des écrans de détail : sombres, sans transparence (iOS 26 les rend transparents par défaut)
const header = {
  headerShown: true,
  headerTransparent: false,
  headerStyle: { backgroundColor: colors.bg },
  headerTintColor: colors.text,
  headerTitleStyle: { fontFamily: fonts.displayMedium, color: colors.text },
  headerShadowVisible: false,
  headerBackTitle: 'Retour',
};

function RootStack() {
  const { merchant } = useAuth();
  if (merchant === undefined) return <Loading />;
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
      <Stack.Protected guard={!!merchant}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="encaisser/[id]" options={{ presentation: 'fullScreenModal', gestureEnabled: false }} />
        <Stack.Screen name="paiement/[id]" options={{ ...header, title: 'Paiement' }} />
        <Stack.Screen name="epargne" options={{ ...header, title: 'Épargne' }} />
        <Stack.Screen name="liens" options={{ ...header, title: 'Liens de paiement' }} />
        <Stack.Screen name="rapprochement" options={{ ...header, title: 'Rapprochement' }} />
      </Stack.Protected>
      <Stack.Protected guard={!merchant}>
        <Stack.Screen name="login" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  const [loaded] = useFonts({ SpaceGrotesk_600SemiBold, SpaceGrotesk_700Bold, Inter_400Regular, Inter_500Medium, Inter_600SemiBold });
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      {loaded ? (
        <AuthProvider>
          <RootStack />
        </AuthProvider>
      ) : (
        <Loading />
      )}
    </SafeAreaProvider>
  );
}
