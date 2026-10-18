// Identité visuelle partagée avec l'application web (mêmes couleurs, mêmes polices).
export const colors = {
  bg: '#0e0f13',
  bg2: '#14161c',
  card: '#181b22',
  card2: '#1e222b',
  line: '#262a34',
  line2: '#323745',
  text: '#eceae4',
  muted: '#8d919c',
  btc: '#f7931a',
  btcSoft: 'rgba(247,147,26,0.12)',
  onBtc: '#1a1206',
  green: '#22c55e',
  greenSoft: 'rgba(34,197,94,0.12)',
  teal: '#26a17b',
  amber: '#f5b946',
  amberSoft: 'rgba(245,185,70,0.12)',
  red: '#ef4444',
  redSoft: 'rgba(239,68,68,0.12)',
  wave: '#1dc4ff',
  orange: '#ff7900',
  free: '#e4002b',
  expresso: '#0072bc',
};

export const fonts = {
  display: 'SpaceGrotesk_700Bold',
  displayMedium: 'SpaceGrotesk_600SemiBold',
  body: 'Inter_400Regular',
  bodyMedium: 'Inter_500Medium',
  bodyBold: 'Inter_600SemiBold',
};

export const radius = { sm: 10, md: 14, lg: 20, xl: 28 };
export const space = (n) => n * 4;

export const NETWORKS = [
  { id: 'wave', label: 'Wave', color: colors.wave },
  { id: 'orange_money', label: 'Orange Money', color: colors.orange },
  { id: 'free_money', label: 'Free Money', color: colors.free },
  { id: 'expresso', label: 'Expresso', color: colors.expresso },
];

export const CHAINS = { tron: 'Tron (TRC-20)', bsc: 'BNB Chain (BEP-20)', polygon: 'Polygon', ethereum: 'Ethereum', solana: 'Solana', optimism: 'Optimism', base: 'Base' };
