export const BOILERPLATE_PATTERNS: RegExp[] = [
  // Lock files — explicit names first, then the generic *.lock catch-all.
  // Order matters: BOILERPLATE is checked before WIRING, so package-lock.json
  // is correctly caught here even though WIRING has a \.json$ pattern.
  /package-lock\.json$/,   // npm
  /npm-shrinkwrap\.json$/, // npm (legacy shrinkwrap)
  /pnpm-lock[^/]*\.ya?ml$/, // pnpm — covers pnpm-lock.yaml, pnpm-lock-2.yaml, etc.
  /bun\.lockb?$/,          // bun (bun.lock or bun.lockb)
  /\.lock$/,               // yarn.lock, Gemfile.lock, Cargo.lock, composer.lock,
                           //   poetry.lock, Pipfile.lock, pubspec.lock, Podfile.lock, etc.
  /go\.sum$/,              // Go module checksums
  /shrinkwrap\.yaml$/,     // Helm / other shrinkwrap formats
  // Test snapshots
  /\.snap$/,
  // Build / generated output dirs
  /^dist\//,
  /^build\//,
  /^\.next\//,
  /^coverage\//,
  /generated\//,
  /\.min\.(js|css)$/,
];

export const WIRING_PATTERNS: RegExp[] = [
  /(^|\/)index\.(ts|tsx|js|jsx)$/,
  // Files whose base name IS "config" (e.g. src/config.ts) as well as the
  // conventional *.config.ts / *.config.js pattern (e.g. vite.config.ts).
  /(^|\/)config\.(ts|tsx|js|jsx|mjs|cjs|json|yaml|yml)$/,
  /\.(config|cfg)\.(ts|js|mjs|cjs)$/,
  /tsconfig.*\.json$/,
  /^\.env/,
  /Dockerfile/,
  /docker-compose/,
  /(^|\/)server\.(ts|js)$/,
  /(^|\/)app\.(ts|js)$/,
  /(^|\/)routes?\.(ts|js)$/,
  /\.json$/,
];

export const SPLIT_TOO_BIG_LINES = 400;
