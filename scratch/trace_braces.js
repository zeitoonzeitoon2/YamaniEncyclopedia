const fs = require('fs');
const path = 'c:/Users/Hamed/SITEMAN/messages/ar.json';
const content = fs.readFileSync(path, 'utf8');
const lines = content.split(/\r?\n/);
let openBraces = 0;
for (let i = 880; i < 975; i++) {
    const line = lines[i];
    for (let char of line) {
        if (char === '{') openBraces++;
        if (char === '}') openBraces--;
    }
    console.log(`Line ${i+1} (open: ${openBraces}): ${line}`);
}
