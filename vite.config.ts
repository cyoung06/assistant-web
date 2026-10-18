import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    // The API runs separately (`./gradlew bootTestRun` in ../api).
    proxy: { "/api": "http://localhost:8080" },
  },
  test: {
    environment: "node",
  },
});
