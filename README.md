# appium-wincore-java-bridge

Java Access Bridge (Swing / AWT) UI-tree bridge for
[appium-wincore-driver](https://github.com/y-schwab/appium-wincore-driver), as an installable
Appium plugin.

## The problem

Java Swing / AWT windows are opaque to out-of-process UI Automation — UIA sees a single
childless `Pane`. The controls only exist in the JVM's own accessibility model
(`javax.accessibility` / AccessibleContext).

## The fix

A small agent JAR (`appium-desktop-agent.jar`) is loaded into the target JVM via the Java
**Attach API** and walks the `AccessibleContext` tree, serving it over a loopback-TCP JSON
protocol. The driver's server reaches it through a **tree provider** (`ITreeProvider`)
contributed by this package's WincoreServer plugin
(`native/plugin/WincoreJavaBridge.dll`).

Once attached, a Java window's subtree is stitched into the normal tree — standard
`findElement`, `getPageSource`, `click`, `getText`, XPath all work against the Java controls
(element ids carry a `java:` prefix; the driver routes them transparently).

## Install

```bash
appium plugin install --source=npm appium-wincore-java-bridge
appium --use-plugins=wincore-java-bridge
```

Requires Appium 3 and `appium-wincore-driver`. The plugin registers its server-side tree
provider by appending its `native/plugin/` directory to the `WINCORE_SERVER_PLUGINS`
environment variable at load, before any session starts.

## Usage

Attach is a command, not a capability. Start the session on the target Java window
(`appTopLevelWindow` capability, or `switchToWindow` first), then:

```js
await driver.executeScript('windows: attachJavaSwing', []);
// optionally: await driver.executeScript('windows: attachJavaSwing', [{ jdkPath: 'C:\\jdk-21' }]);

// from here, the normal API reaches the Swing controls:
const btn = await driver.$('~submitButton');
await btn.click();
```

| Command | Params | Description |
|---|---|---|
| `windows: attachJavaSwing` | `jdkPath?` | Inject the JAB agent into the current window's JVM via the Attach API. `jdkPath` overrides `JAVA_HOME` / `PATH` for the one-shot loader. |

The JVM must allow the Attach API (default for a locally-launched app; some hardened
deployments disable it). There is no launch-time `-javaagent` path in this plugin — if you
need one, set `JAVA_TOOL_OPTIONS=-javaagent:...\appium-desktop-agent.jar` in the environment
before the app starts.

## Build from source

```bash
npm install
npm run build:all      # javac the agent (needs a JDK on PATH), publish the plugin DLL, tsc
```

## Contract

The plugin DLL compiles against `WincoreServerSdk` (`ITreeProvider`, `IServerPlugin`). While
the contract is still stabilising this is a relative project reference to a sibling
`appium-wincore-driver` checkout; it moves to a published NuGet package once stable.
