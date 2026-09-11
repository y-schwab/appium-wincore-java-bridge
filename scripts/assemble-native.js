// Post-publish tidy for native/plugin/:
//  - the shared contract assembly must NOT ship in the plugin folder (the host's
//    PluginLoadContext pins "WincoreServerSdk" to its own already-loaded copy);
//    strip it if a publish dragged it in.
//  - make sure plugin.json is present (it is source-controlled, but a clean
//    `dotnet publish -o` into an empty dir would omit it).
const fs = require('node:fs');
const path = require('node:path');

const pluginDir = path.join(__dirname, '..', 'native', 'plugin');

for (const stray of ['WincoreServerSdk.dll', 'WincoreServerSdk.pdb']) {
    const p = path.join(pluginDir, stray);
    if (fs.existsSync(p)) {
        fs.rmSync(p);
        console.log(`removed ${stray} from plugin payload (host provides it)`);
    }
}

// C++ linker byproducts — never loaded at runtime, no reason to ship them.
const CRUFT = new Set(['.exp', '.lib', '.ilk', '.metagen']);
for (const dir of [pluginDir, path.join(pluginDir, 'win-x86')]) {
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
        const ext = path.extname(f) === '' && f.endsWith('.dll.metagen') ? '.metagen' : path.extname(f);
        if (CRUFT.has(ext)) {
            fs.rmSync(path.join(dir, f));
            console.log(`removed build byproduct ${path.relative(pluginDir, path.join(dir, f))}`);
        }
    }
}

const manifest = path.join(pluginDir, 'plugin.json');
if (!fs.existsSync(manifest)) {
    fs.writeFileSync(manifest, JSON.stringify({
        name: 'java-bridge',
        entry: 'WincoreJavaBridge.dll',
        type: 'Wincore.JavaBridge.Plugin',
        sdkVersion: '1.0.0',
    }, null, 2) + '\n');
    console.log('regenerated plugin.json');
}
