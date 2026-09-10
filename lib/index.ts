import { BasePlugin } from 'appium/plugin';
import type { ExecuteMethodMap, ExternalDriver, NextPluginCallback } from '@appium/types';
import { join } from 'node:path';
import { attachJavaSwing } from './commands.js';

/**
 * The real work of this bridge is a DesktopDriverServer tree-provider plugin
 * (`native/plugin/WincoreJavaBridge.dll` + `appium-desktop-agent.jar`). It is made
 * discoverable by appending its folder to `DESKTOP_DRIVER_PLUGINS` here, at module
 * load — which happens once when Appium boots an enabled plugin, before any session
 * spawns a server, so the server inherits the variable.
 *
 * `__dirname` at runtime is `build/lib/`, so the payload sits three levels up.
 */
const PLUGIN_NATIVE_DIR = join(__dirname, '..', '..', 'native', 'plugin');
const existing = process.env.DESKTOP_DRIVER_PLUGINS;
process.env.DESKTOP_DRIVER_PLUGINS =
    existing && existing.length > 0 ? `${existing};${PLUGIN_NATIVE_DIR}` : PLUGIN_NATIVE_DIR;

export class JavaBridgePlugin extends BasePlugin {
    static override executeMethodMap: ExecuteMethodMap<JavaBridgePlugin> = {
        'windows: attachJavaSwing': { command: 'attachJavaSwing', params: { optional: ['jdkPath'] } },
    };

    attachJavaSwing = attachJavaSwing;

    /**
     * Appium's plugin dispatcher only gives a plugin a turn for the classic
     * `execute`/`executeScript` endpoint if the instance defines an `execute`
     * method; `BasePlugin` implements only `executeMethod`. Delegating into the
     * inherited `executeMethod` (which does the `executeMethodMap` lookup and calls
     * `next()` for anything it does not recognise) is what makes the command
     * reachable. Same shim as appium-wincore-vision-plugin / uia-bridge.
     */
    async execute(next: NextPluginCallback, driver: ExternalDriver, script: string, args: unknown[]): Promise<unknown> {
        return await this.executeMethod(next, driver, script, args as [Record<string, unknown>]);
    }
}

export default JavaBridgePlugin;
