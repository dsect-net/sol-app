import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'net.dsect.sol',
  appName: 'Sol',
  webDir: 'dist',
  // The prototype is fully static, so the bundled web app runs offline
  // inside the native shell with no server required.
};

export default config;
