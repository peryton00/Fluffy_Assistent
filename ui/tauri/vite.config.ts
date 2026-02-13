import { defineConfig } from "vite";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
        protocol: "ws",
        host,
        port: 1421,
      }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
    proxy: {
      '/status': 'http://127.0.0.1:5123',
      '/logs': 'http://127.0.0.1:5123',
      '/command': 'http://127.0.0.1:5123',
      '/normalize': 'http://127.0.0.1:5123',
      '/ui_connected': 'http://127.0.0.1:5123',
      '/ui_disconnected': 'http://127.0.0.1:5123',
      '/security_action': 'http://127.0.0.1:5123',
      '/net-speed': 'http://127.0.0.1:5123',
      '/trust_process': 'http://127.0.0.1:5123',
      '/clear_guardian_data': 'http://127.0.0.1:5123',
      '/tts_test': 'http://127.0.0.1:5123',
      '/test_stt': 'http://127.0.0.1:5123',
      '/stop_stt': 'http://127.0.0.1:5123',
      '/stt_status': 'http://127.0.0.1:5123',
      '/apps': 'http://127.0.0.1:5123'
    }
  },
}));
