import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Port 3000 matches Supabase's default Site URL, so magic links land back here locally.
export default defineConfig({
  plugins: [react()],
  server: { port: 3000, strictPort: true },
});
