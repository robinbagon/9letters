const fs = require('fs');
const path = require('path');

const dictPath = path.join(__dirname, 'master-dictionary.txt');
const ninePath = path.join(__dirname, 'nine-letter-words.txt');

const nineLetterWords = fs.readFileSync(ninePath, 'utf-8').split('\n').map(w => w.trim().toLowerCase()).filter(Boolean);
const masterArray = fs.readFileSync(dictPath, 'utf-8').split('\n').map(w => w.trim().toLowerCase()).filter(Boolean);
const masterDict = new Set(masterArray);

const missing = nineLetterWords.filter(word => !masterDict.has(word));

if (missing.length === 0) {
    console.log("✅ All 9-letter words are already in the master dictionary.");
} else {
    console.log(`⚠️ Found ${missing.length} missing words.`);
    
    // Create a string where each missing word is on a new line
    // We start with a newline to ensure we don't accidentally append to the last word in the file
    const wordsToAdd = "\n" + missing.join('\n');
    
    try {
        fs.appendFileSync(dictPath, wordsToAdd);
        console.log("🚀 Success! The missing words have been added to master-dictionary.txt on separate lines.");
    } catch (err) {
        console.error("❌ Error writing to dictionary:", err);
    }
}