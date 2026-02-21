
function stringToColor(str) {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash)
  }
  const h = hash % 360
  return h
}

const ids = ["Philosophy", "Humanities", "Social Sciences", "Natural Sciences", "Formal Sciences", "Applied Sciences"]
// Assuming IDs might be English names based on "Philosophy" in screenshot.
// But "علوم انسانی" is Persian. If the ID is "Humanities" or "humanities"...

const pairs = [
    ["Philosophy", "Humanities"],
    ["Philosophy", "علوم انسانی"], // If ID is Persian?
    ["Philosophy", "Social Sciences"],
]

console.log("Current algo:")
pairs.forEach(p => {
    console.log(`${p[0]}: ${stringToColor(p[0])}, ${p[1]}: ${stringToColor(p[1])}`)
})

// Better algo test
function betterStringToColor(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = Math.imul(31, hash) + str.charCodeAt(i) | 0;
    }
    return Math.abs(hash % 360);
}

console.log("\nBetter algo:")
pairs.forEach(p => {
    console.log(`${p[0]}: ${betterStringToColor(p[0])}, ${p[1]}: ${betterStringToColor(p[1])}`)
})
