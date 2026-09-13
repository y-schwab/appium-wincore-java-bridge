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

**Before calling `windows: attachJavaSwing`, the session must be pointed at the Java
window** — the agent injects into whatever JVM owns the session's current root window,
regardless of where the session started. Switch first if you began elsewhere:

```js
// started from app: Root — switch to the Java window before attaching
const hexHwnd = `0x${parseInt(decimalHwnd, 10).toString(16).padStart(8, '0')}`;
await driver.switchToWindow(hexHwnd);
await driver.executeScript('windows: attachJavaSwing', []);
```

### JDK setup

Injecting into an already-running JVM needs a JDK (not just a JRE) to run the one-shot
Attach-API loader. Resolved in this order:

1. **`jdkPath` argument** — passed directly to `windows: attachJavaSwing`. Takes priority.
2. **`JAVA_HOME` environment variable** — fallback when no `jdkPath` is given.

```js
// per-call override
await driver.executeScript('windows: attachJavaSwing', [{ jdkPath: 'C:\\Program Files\\Java\\jdk1.8.0_xxx' }]);
```

```powershell
# JAVA_HOME — check current value
[System.Environment]::GetEnvironmentVariable("JAVA_HOME", "Machine")

# set permanently (run as Administrator)
[System.Environment]::SetEnvironmentVariable(
  "JAVA_HOME",
  "C:\Program Files\Java\jdk1.8.0_xxx",
  "Machine"
)
```

For Java 8, the JDK must contain `lib\tools.jar` — if the path points to a JRE, the loader
scans common JDK sibling directories (`C:\Program Files\Java\jdk*`, Corretto, Zulu)
automatically before failing. Java 9+ only needs `bin\java.exe` (no `tools.jar`). Tested on
JDK 8 and JDK 25.

### Locator strategies

All standard locator strategies work against Java elements once attached. In an XPath node
test, write the **UIA control-type term**, not the Java role — the reflected tree maps each
role to its UIA equivalent before serving it:

| XPath tag | Java role | Example component |
| --- | --- | --- |
| `Edit` | text | `JTextField`, `JTextArea` |
| `Button` | push button | `JButton` |
| `CheckBox` | check box | `JCheckBox` |
| `ComboBox` | combo box | `JComboBox` |
| `Text` | label | `JLabel` |
| `List` | list | `JList` |
| `Tree` | tree | `JTree` |
| `Table` | table | `JTable` |
| `RadioButton` | radio button | `JRadioButton` |
| `MenuItem` | menu item | `JMenuItem` |
| `Slider` | slider | `JSlider` |
| `TabItem` | page tab | tab in `JTabbedPane` |

A role with no UIA equivalent (`root pane`, `glass pane`, `filler`, …) keeps its role name in
PascalCase: `//RootPane`, `//GlassPane`. Node tests are **PascalCase and case-sensitive** —
`//pushbutton` matches nothing. Use `//*[@attr=…]` when unsure of the tag; `getPageSource`
prints the same tag names, so a tag copied from page source is a valid node test as-is.

```js
// by accessible name (set via setAccessibleName() in app code)
await driver.$('~usernameField')

// by XPath role + name attribute
await driver.$('//Edit[@Name="usernameField"]')

// by Java class name — works even when no accessible name is set
await driver.$('//*[@JavaSimpleClass="HrIDTextField"]')
await driver.$('//*[@JavaClass="com.example.HrIDTextField"]')
```

Every Java element also exposes two extra XPath-predicate attributes, unique per component
type and stable across layout changes — the most reliable locator for legacy apps that never
call `setAccessibleName()`:

| Attribute | Value | Example |
| --- | --- | --- |
| `JavaClass` | Fully-qualified class name | `javax.swing.JTextField` |
| `JavaSimpleClass` | Simple class name | `JTextField` |

### Window switching

Switching to a non-Java window mid-session uses normal UIA. The driver detects Java windows
by Win32 class name (`SunAwtFrame` etc.) and routes each find call to the correct engine
automatically once attached.

## Build from source

```bash
npm install
npm run build:all      # javac the agent (needs a JDK on PATH), publish the plugin DLL, tsc
```

## Contract

The plugin DLL compiles against [`WincoreServerSdk`](https://www.nuget.org/packages/WincoreServerSdk)
(`ITreeProvider`, `IServerPlugin`) via a `PackageReference`. `PluginLoader` refuses to load a
plugin whose declared SDK major version doesn't match the host's — see the driver's
[server plugin architecture](https://github.com/y-schwab/appium-wincore-driver#readme) docs.
