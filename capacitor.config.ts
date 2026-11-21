import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'es.legio.roma',
  appName: 'Legio',
  webDir: 'dist',
  backgroundColor: '#221810',
  android: {
    // Mantener la página activa y permitir WebAudio sin gesto extra.
    allowMixedContent: false,
  },
  plugins: {
    SystemBars: {
      insetsHandling: 'native',
      style: 'DARK',
    },
  },
};

export default config;
