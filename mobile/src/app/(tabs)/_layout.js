import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../lib/auth';
import { colors, fonts } from '../../theme';

function icon(name) {
  return function TabIcon({ color, focused }) {
    return <Ionicons name={focused ? name : `${name}-outline`} size={24} color={color} />;
  };
}

export default function TabsLayout() {
  const { merchant } = useAuth();
  // Un caissier n'accède qu'à la caisse et à ses propres ventes
  const staff = !!merchant?.staff;
  const ownerOnly = staff ? { href: null } : {};
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colors.bg },
        tabBarActiveTintColor: colors.btc,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: { backgroundColor: colors.bg2, borderTopColor: colors.line, height: 84, paddingTop: 8 },
        tabBarLabelStyle: { fontFamily: fonts.bodyBold, fontSize: 11 },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Accueil', tabBarIcon: icon('home'), ...ownerOnly }} />
      <Tabs.Screen name="caisse" options={{ title: 'Caisse', tabBarIcon: icon('calculator') }} />
      <Tabs.Screen name="paiements" options={{ title: staff ? 'Mes ventes' : 'Paiements', tabBarIcon: icon('receipt') }} />
      <Tabs.Screen name="portefeuille" options={{ title: 'Portefeuille', tabBarIcon: icon('wallet'), ...ownerOnly }} />
      <Tabs.Screen name="plus" options={{ title: staff ? 'Compte' : 'Plus', tabBarIcon: icon('grid') }} />
    </Tabs>
  );
}
