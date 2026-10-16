// Inlines the shared rules engine (src/rules.js) and level table (src/levels.json) into index.html,
// between the @rules markers, so the single-file game runs exactly the code the simulator tests.
// Usage: node tools/build.js          (rewrite index.html)
//        node tools/build.js --check  (exit 1 if index.html is out of date)
'use strict';
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), file = path.join(root, 'index.html');
const html = fs.readFileSync(file, 'utf8');
const rules = fs.readFileSync(path.join(root, 'src/rules.js'), 'utf8').trim();
const levels = JSON.stringify(JSON.parse(fs.readFileSync(path.join(root, 'src/levels.json'), 'utf8')));
const begin = '/* @rules:begin */', end = '/* @rules:end */';
const a = html.indexOf(begin), b = html.indexOf(end);
if (a < 0 || b < a) { console.error('index.html: @rules markers not found'); process.exit(1); }
const block = `${begin}\n${rules}\nSugarRules.setLevels(${levels});\n`;
const out = html.slice(0, a) + block + html.slice(b);
if (process.argv.includes('--check')) {
  if (out !== html) { console.error('index.html is out of date: run node tools/build.js'); process.exit(1); }
  console.log('index.html is up to date');
} else { fs.writeFileSync(file, out); console.log('index.html rebuilt'); }
