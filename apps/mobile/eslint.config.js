const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*"],
    settings: {
      "import/resolver": {
        node: {
          conditionNames: ["types", "import", "require", "default"],
          exportsFields: ["exports"],
          extensions: [".js", ".jsx", ".ts", ".tsx", ".d.ts", ".json"],
        },
      },
    },
  },
]);
