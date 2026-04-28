const fs = require('fs');
const path = 'c:/Users/Hamed/SITEMAN/messages/ar.json';
const content = fs.readFileSync(path, 'utf8');
const lines = content.split(/\r?\n/);
for (let i = 970; i <= 985; i++) {
    console.log(`${i+1}: ${lines[i]}`);
}
