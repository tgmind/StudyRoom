import "@testing-library/jest-dom";

try {
  if (typeof process.loadEnvFile === "function") {
    process.loadEnvFile(".env.local");
  }
} catch {
  // Ignore if .env.local not found in CI
}

