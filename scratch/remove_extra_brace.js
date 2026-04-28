const fs = require('fs');
const path = 'c:/Users/Hamed/SITEMAN/messages/ar.json';
const lines = fs.readFileSync(path, 'utf8').split(/\r?\n/);
// Line 946 is index 945
console.log("Removing line 946:", lines[945]);
lines.splice(945, 1);
fs.writeFileSync(path, lines.join('\n'), 'utf8');
console.log("Fixed ar.json by removing extra closing brace");
