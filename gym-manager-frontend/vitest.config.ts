import { defineConfig } from 'vitest/config';

// The first test of each spec file pays the one-off TestBed/Material compilation (2-3 s),
// which overruns the 5 s default as soon as the machine is busy.
export default defineConfig({
  test: {
    testTimeout: 15000,
  },
});
