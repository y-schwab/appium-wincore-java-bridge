import { defineConfig } from 'vitest/config';

// Performance benchmark. Opt-in: only does anything when RUN_PERF=1 is set (the suite
// is describe.skipIf-gated), and needs a running Appium server with the wincore driver
// plus this plugin, and the java-swing-large fixture built in the sibling
// appium-wincore-test-apps checkout. Run with `npm run test:perf`.
export default defineConfig({
    test: {
        globals: true,
        include: ['test/perf/**/*.perf.ts'],
        // Selecting this config is itself the opt-in; the RUN_PERF gate in the spec
        // then also guards against the perf file being picked up by another config.
        env: { RUN_PERF: '1' },
        testTimeout: 600_000,
        hookTimeout: 120_000,
        pool: 'forks',
        poolOptions: {
            forks: {
                singleFork: true,
            },
        },
    },
});
