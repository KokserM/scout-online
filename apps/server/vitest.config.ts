import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@grandstand/shared": fileURLToPath(new URL("../../packages/shared/src/index.ts", import.meta.url)),
      "@grandstand/game-engine": fileURLToPath(
        new URL("../../packages/game-engine/src/index.ts", import.meta.url),
      ),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
