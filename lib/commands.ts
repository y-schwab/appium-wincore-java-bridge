import type { ExternalDriver, NextPluginCallback } from '@appium/types';

/**
 * `driver.sendCommand` is a server-side method of appium-wincore-driver (its
 * stdin/stdout bridge to WincoreServer.exe), not part of the generic
 * `ExternalDriver` type — same cast the sibling appium-wincore-uia-bridge-plugin
 * uses. The `injectJavaAgent` server command it reaches is contributed by this
 * package's WincoreJavaBridge.dll tree provider.
 */
type ServerDriver = ExternalDriver & {
    sendCommand(method: string, params: Record<string, unknown>): Promise<unknown>;
};

/**
 * `windows: attachJavaSwing` — inject the Java Access Bridge agent into the JVM
 * owning the session's current root window (the server resolves the PID from the
 * root element's HWND, via the Java Attach API) and connect to it. Attach only:
 * switch to the target Java window first.
 *
 * @param jdkPath - optional path to the JDK whose `java.exe` runs the one-shot
 * Attach-API loader; defaults to `JAVA_HOME` / `PATH` resolution.
 */
export async function attachJavaSwing(
    this: unknown,
    _next: NextPluginCallback,
    driver: ExternalDriver,
    jdkPath?: string,
): Promise<void> {
    await (driver as ServerDriver).sendCommand('injectJavaAgent', { jdkPath: jdkPath ?? null });
}
