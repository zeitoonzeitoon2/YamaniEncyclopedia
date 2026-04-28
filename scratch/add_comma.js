const fs = require('fs');
const path = 'c:/Users/Hamed/SITEMAN/messages/ar.json';
const lines = fs.readFileSync(path, 'utf8').split(/\r?\n/);
// Line 945 is index 944
console.log("Adding comma to line 945:", lines[944]);
lines[944] = lines[944].replace('}', '},');
fs.writeFileSync(path, lines.join('\n'), 'utf8');
console.log("Fixed ar.json by adding missing comma");
