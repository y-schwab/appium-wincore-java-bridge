import { execSync, spawn } from 'node:child_process';
import { resolve } from 'node:path';
import type { ChildProcess } from 'node:child_process';
import type { Browser } from 'webdriverio';
import { remote } from 'webdriverio';

export const APPIUM_SERVER = {
    hostname: '127.0.0.1',
    port: 4723,
    path: '/',
};

/**
 * Fixture apps live in the sibling appium-wincore-test-apps repo, not in this repo — override
 * via env var for CI or a different checkout layout.
 */
export const TEST_APPS_DIR = process.env.TEST_APPS_DIR ?? resolve(process.cwd(), '..', 'appium-wincore-test-apps');

export const NOTEPAD_APP_PATH = 'C:\\Windows\\notepad.exe';

// The Java fixture runs on whatever JDK JAVA_HOME points at (actions/setup-java sets it
// in CI). Fall back to `javaw` on PATH rather than a hard-coded install dir — a stale
// absolute path fails with a confusing ENOENT if that JVM was ever removed.
export const JAVAW_EXE_PATH = process.env.JAVA_HOME
    ? `${process.env.JAVA_HOME}\\bin\\javaw.exe`
    : 'javaw';
export const JAVA_SWING_FORM_CLASSPATH = resolve(TEST_APPS_DIR, 'java-swing-form');

/**
 * Launches the Java Swing test form as an external process (without Appium agent injection).
 * Returns the child process and its main window handle (decimal HWND string).
 * The caller is responsible for killing the process in afterAll.
 */
export async function launchJavaSwingFormExternally(): Promise<{ proc: ChildProcess; hwnd: string }> {
    const args = ['-cp', JAVA_SWING_FORM_CLASSPATH, 'TestForm'];
    const proc = spawn(JAVAW_EXE_PATH, args, { detached: true, stdio: 'ignore' });

    if (!proc.pid) {
        throw new Error(`Failed to spawn Java process: ${JAVAW_EXE_PATH}`);
    }

    // Poll for MainWindowHandle to appear (window may take a moment to open)
    const pid = proc.pid;
    const deadline = Date.now() + 15_000;
    let hwnd = '0';
    while (Date.now() < deadline) {
        try {
            hwnd = execSync(
                `powershell -Command "(Get-Process -Id ${pid} -ErrorAction Stop).MainWindowHandle"`,
                { stdio: ['ignore', 'pipe', 'ignore'] }
            ).toString().trim();
        } catch {
            hwnd = '0';
        }
        if (hwnd !== '0') {
            break;
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
    }

    if (hwnd === '0') {
        proc.kill();
        throw new Error(`Java Swing form window did not appear within 15s (pid=${pid})`);
    }

    return { proc, hwnd };
}

/**
 * Session attached to an already-running Java window (external launch), then the
 * Java Access Bridge agent injected via the appium-wincore-java-bridge plugin's
 * `windows: attachJavaSwing` command — the only supported attach path.
 */
export async function createJavaSwingAttachSession(hwnd: string, extraCaps?: Record<string, unknown>): Promise<Browser> {
    const driver = await remote({
        ...APPIUM_SERVER,
        capabilities: {
            platformName: 'Windows',
            'appium:automationName': 'Wincore',
            'appium:appTopLevelWindow': hwnd,
            'appium:shouldCloseApp': false,
            ...extraCaps,
        } as WebdriverIO.Capabilities,
    });
    await driver.executeScript('windows: attachJavaSwing', []);
    await driver.setTimeout({ implicit: 3000 });
    return driver;
}

/**
 * Launches the Java Swing test form externally, opens a session on its window, and
 * attaches the JAB agent. Returns the child process too — the caller must kill it.
 */
export async function createJavaSwingFormSession(
    extraCaps?: Record<string, unknown>,
): Promise<{ driver: Browser; proc: ChildProcess }> {
    const { proc, hwnd } = await launchJavaSwingFormExternally();
    const driver = await createJavaSwingAttachSession(hwnd, extraCaps);
    return { driver, proc };
}

export const JAVA_SWING_LARGE_CLASSPATH = resolve(TEST_APPS_DIR, 'java-swing-large');

/**
 * Launches the java-swing-large performance fixture (LargeTreeForm) with a target
 * accessible-node count. Not a correctness fixture — used only by the perf benchmark
 * in test/perf/. Pass `perfMetrics: true` in extraCaps to enable the RPC counters.
 */
export async function createJavaSwingLargeSession(
    nodeCount = 1500,
    extraCaps?: Record<string, unknown>,
): Promise<{ driver: Browser; proc: ChildProcess }> {
    const proc = spawn(
        JAVAW_EXE_PATH,
        ['-DnodeCount=' + nodeCount, '-cp', JAVA_SWING_LARGE_CLASSPATH, 'LargeTreeForm'],
        { detached: true, stdio: 'ignore' },
    );
    if (!proc.pid) {
        throw new Error(`Failed to spawn Java process: ${JAVAW_EXE_PATH}`);
    }
    const pid = proc.pid;
    const deadline = Date.now() + 20_000;
    let hwnd = '0';
    while (Date.now() < deadline) {
        try {
            hwnd = execSync(
                `powershell -Command "(Get-Process -Id ${pid} -ErrorAction Stop).MainWindowHandle"`,
                { stdio: ['ignore', 'pipe', 'ignore'] },
            ).toString().trim();
        } catch {
            hwnd = '0';
        }
        if (hwnd !== '0') {
            break;
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
    }
    if (hwnd === '0') {
        proc.kill();
        throw new Error(`java-swing-large window did not appear within 20s (pid=${pid})`);
    }

    const driver = await createJavaSwingAttachSession(hwnd, extraCaps);
    return { driver, proc };
}

export async function quitSession(driver: Browser | null): Promise<void> {
    try {
        await driver?.deleteSession();
    } catch {
        // noop — session may already be terminated
    }
}
