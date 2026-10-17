import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": {
        target: "https://localhost:1443",
        changeOrigin: true,
        secure: false,
        // Transmet aussi la mise à niveau WebSocket de la messagerie (/api/chat/ws).
        ws: true,
      },
    },
  },
});
