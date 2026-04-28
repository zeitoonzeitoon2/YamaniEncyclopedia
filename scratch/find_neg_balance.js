const fs = require('fs');
const path = 'c:/Users/Hamed/SITEMAN/messages/ar.json';
const content = fs.readFileSync(path, 'utf8');
let balance = 0;
const lines = content.split(/\r?\n/);
for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (let char of line) {
        if (char === '{') balance++;
        if (char === '}') balance--;
        if (balance < 0) {
            console.log(`Negative balance at line ${i+1}: ${line}`);
            process.exit(0);
        }
    }
}
