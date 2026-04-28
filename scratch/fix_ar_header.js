const fs = require('fs');
const path = 'c:/Users/Hamed/SITEMAN/messages/ar.json';
let content = fs.readFileSync(path, 'utf8');

// Fix the title line in the header
// It has "title": "شجرة العلم'
content = content.replace(/"title":\s*"شجرة العلم'/, '"title": "شجرة العلم",');
// Also check for other variations
content = content.replace(/"title":\s*"شجرة العلم""/, '"title": "شجرة العلم",');

fs.writeFileSync(path, content, 'utf8');
console.log("Fixed ar.json header title");
