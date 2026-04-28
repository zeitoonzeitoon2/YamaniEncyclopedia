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
        if (balance === 0 && i < lines.length - 1) {
            console.log(`Balance reached 0 at line ${i+1}: ${line}`);
            // Check if there is anything after this
            const rest = content.substring(content.indexOf(line) + line.length).trim();
            if (rest.length > 0) {
                 console.log("JSON ends early!");
            }
            process.exit(0);
        }
    }
}
