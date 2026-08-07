import { defineConfig } from "tsdown";

import { emberConfig } from "./src/config.ts";

export default defineConfig({
  entry: {
    index: "index.ts",
    "app-reexports": "src/app-reexports.ts",
  },
  plugins: [emberConfig()],
});
