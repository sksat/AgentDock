import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const serverPort = env.AGENTDOCK_PORT || '3001'
  const clientPort = env.AGENTDOCK_CLIENT_PORT ? parseInt(env.AGENTDOCK_CLIENT_PORT, 10) : 5173
  const noWatch = env.AGENTDOCK_NO_WATCH === 'true'
  const hostExpose = env.AGENTDOCK_HOST_EXPOSE === 'true'

  return {
    plugins: [react(), tailwindcss()],
    define: {
      // Expose stable mode flag to client code
      'import.meta.env.VITE_STABLE_MODE': JSON.stringify(noWatch),
    },
    server: {
      host: hostExpose ? true : undefined,
      port: clientPort,
      hmr: noWatch ? false : undefined,
      proxy: {
        '/ws': {
          target: `http://localhost:${serverPort}`,
          ws: true,
          changeOrigin: true,
        },
        '/api': {
          target: `http://localhost:${serverPort}`,
          changeOrigin: true,
        },
      },
    },
  }
})
