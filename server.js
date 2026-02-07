// server.js
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const gameManager = require("./gameManager");
const validateWord = require("./wordValidator");
const path = require("path");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: { origin: "*" }
});

app.use(express.static("public"));

// This tells the server: "If anyone goes to the main URL, show them join.html"
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'join.html'));
});

// Keep your host route as well
app.get('/host', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'host.html'));
});


// -------------------
// Helper: Get all possible words for a game
// -------------------
function getAllPossibleWords(game) {
    const fs = require("fs");

    const dictionaryPath = path.join(__dirname, "master-dictionary.txt");
    const WORDS = fs.readFileSync(dictionaryPath, "utf-8")
                .split("\n")
                .map(w => w.trim().toLowerCase());

    const letters = game.letters.map(l => l.toLowerCase());

    function canBuildWord(word) {
        const pool = [...letters];
        for (const char of word) {
            const index = pool.indexOf(char);
            if (index === -1) return false;
            pool.splice(index, 1);
        }
        return true;
    }

    return WORDS.filter(w => w.length >= 3 && canBuildWord(w));
}


// -------------------
// Helper: End Game
// -------------------
function endGame(code) {
    const game = gameManager.getGame(code);
    if (!game) return;

    // Collate all words from all players
    const foundWordsSet = new Set();
    for (const playerId in game.players) {
        const player = game.players[playerId];
        player.words.forEach(w => foundWordsSet.add(w.toLowerCase()));
    }

    const foundWords = Array.from(foundWordsSet).sort((a,b) => b.length - a.length || a.localeCompare(b));

    // Compute all possible words
    const allWords = getAllPossibleWords(game).sort((a,b) => b.length - a.length || a.localeCompare(b));

    io.to(code).emit("game-ended", {
        words: foundWords,
        allWords: allWords,
        solution: game.solution,
        classScore: game.classScore
    });

    io.to(code).emit("lock-input");
}


// -------------------
// Socket connection
// -------------------
io.on("connection", socket => {
    console.log("Connected:", socket.id);

    // -------- HOST CREATES GAME --------
    socket.on("host-create", () => {
        const code = gameManager.createGame(socket.id);
        socket.join(code);
        socket.emit("game-created", code);
        console.log("Game created:", code);
    });

    // -------- HOST STARTS GAME --------
    socket.on("start-game", ({ code, duration = 90 }) => {
        const game = gameManager.getGame(code);
        if (!game) return;

        gameManager.startGame(code);
        game.started = true;
        game.endTime = Date.now() + duration * 1000;

        // Broadcast letters & end time
        io.to(code).emit("game-started", {
            letters: game.letters,
            endTime: game.endTime
        });

        // Automatically end the game after duration
        setTimeout(() => endGame(code), duration * 1000);
    });

    // -------- PLAYER JOINS --------
    socket.on("player-join", ({ code, name }) => {
    const game = gameManager.getGame(code);
    if (!game) return socket.emit("error-msg", "Game not found");

    socket.join(code);

    game.players[socket.id] = {
        name,
        score: 0,
        words: []
    };

    io.to(code).emit("player-count", Object.keys(game.players).length);

    // 👇 NEW: if game already running, sync late joiner
    if (game.started && Date.now() < game.endTime) {
        socket.emit("game-started", {
            letters: game.letters,
            endTime: game.endTime
        });

        socket.emit("class-score", game.classScore);
    }
});


    // -------- WORD SUBMISSION --------
    socket.on("submit-word", ({ code, word }) => {
    const game = gameManager.getGame(code);
    if (!game || !game.started) return;

    if (Date.now() > game.endTime) return;

    const player = game.players[socket.id]; // only declare once

    // Validate word (per-player uniqueness)
    const result = validateWord(word, game, player);

    if (!result.valid) {
        // restore letters on client if invalid
        socket.emit("word-result", result);
        socket.emit("player-words", player.words);
        return;
    }

    // Word is valid
    // Scoring: Length squared (3=9pts, 6=36pts, 9=81pts)
    const points = Math.pow(word.length, 2); 

    player.score += points;
    player.words.push(word);
    game.classScore += points;

    // Feedback to player
    socket.emit("word-result", {
        valid: true,
        points,
        total: player.score
    });

    // Send updated word list to that player in real time
    socket.emit("player-words", player.words);

    // Update class score for everyone
    io.to(code).emit("class-score", game.classScore);
});

    socket.on("host-restart", ({ code }) => {
    const game = gameManager.getGame(code);
    if (!game) return;

    // 1. This handles picking new letters and resetting game.started
    gameManager.startGame(code); 

    // 2. Manual resets for the new round
    game.classScore = 0;
    game.usedWords = new Set(); // Reset the global used words set
    game.endTime = Date.now() + 90 * 1000; 

    // 3. Reset individual player stats so they start at 0
    for (const playerId in game.players) {
        game.players[playerId].score = 0;
        game.players[playerId].words = [];
    }

    // 4. Tell everyone to reset their UI
    io.to(code).emit("game-restart", {
        letters: game.letters,
        endTime: game.endTime
    });

    // 5. Set the auto-end timer
    setTimeout(() => endGame(code), 90 * 1000);
});



    // -------- DISCONNECT HANDLING --------
    socket.on("disconnect", () => {
        // Iterate over all games
        const codes = gameManager.getAllCodes?.() || [];

        for (const code of codes) {
            const game = gameManager.getGame(code);
            if (!game) continue;

            // If host left → end game
            if (game.host === socket.id) {
                endGame(code);
                return;
            }

            // If a player left
            if (game.players[socket.id]) {
                delete game.players[socket.id];
                io.to(code).emit(
                    "player-count",
                    Object.keys(game.players).length
                );
            }
        }
    });
});



// -------------------
// Start server
// -------------------
const PORT = process.env.PORT || 3000; // Use Render's port or 3000 locally
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
