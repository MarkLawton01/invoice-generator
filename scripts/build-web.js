// Copies just the files the phone/web version needs into web-dist/,
// ready to upload to any static host (Netlify Drop, GitHub Pages, …).
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const out = path.join(root, 'web-dist');
const files = ['index.html', 'manifest.webmanifest', 'sw.js', 'vendor', 'icons'];

fs.rmSync(out, { recursive: true, force: true });
for (const f of files) fs.cpSync(path.join(root, f), path.join(out, f), { recursive: true });

// bump the offline cache name so phones pick up the new version on next launch
const sw = path.join(out, 'sw.js');
fs.writeFileSync(sw, fs.readFileSync(sw, 'utf8').replace(/invoice-gen-v1/, 'invoice-gen-' + Date.now()));

console.log('Web version ready in', out);
