const fs = require('fs');
const path = 'c:/Users/Hamed/SITEMAN/messages/ar.json';
const content = fs.readFileSync(path, 'utf8');
try {
    JSON.parse(content);
    console.log("JSON is valid");
} catch (e) {
    console.error(e.message);
    const pos = parseInt(e.message.match(/position (\d+)/)[1]);
    console.log("Context at error position:");
    console.log(JSON.stringify(content.substring(pos - 50, pos + 50)));
}
