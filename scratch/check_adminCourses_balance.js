const fs = require('fs');
const path = 'c:/Users/Hamed/SITEMAN/messages/ar.json';
const content = fs.readFileSync(path, 'utf8');
const lines = content.split(/\r?\n/);
let balance = 0;
let started = false;
for (let i = 887; i < 975; i++) {
    const line = lines[i];
    for (let char of line) {
        if (char === '{') { balance++; started = true; }
        if (char === '}') balance--;
    }
    if (started && balance === 0) {
        console.log(`adminCourses balanced at line ${i+1}: ${line}`);
        break;
    }
}
