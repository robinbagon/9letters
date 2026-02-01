const socket = io();

// -----------------
// DOM ELEMENTS
// -----------------
const joinScreen = document.getElementById("joinScreen");
const gameScreen = document.getElementById("gameScreen");

const codeInput = document.getElementById("codeInput");
const nameInput = document.getElementById("nameInput");
const joinBtn = document.getElementById("joinBtn");
const joinError = document.getElementById("joinError");
const joinStatus = document.getElementById("joinStatus");

const lettersEl = document.getElementById("letters");
const wordInput = document.getElementById("wordInput");
const submitBtn = document.getElementById("submitBtn");
const clearBtn = document.getElementById("clearBtn");

const feedbackEl = document.getElementById("feedback");
const scoreEl = document.getElementById("score");
const playerWordsEl = document.getElementById("playerWords");
const timerEl = document.getElementById("timer");

// Check if there is a code in the URL
const urlParams = new URLSearchParams(window.location.search);
const codeFromUrl = urlParams.get('code');

if (codeFromUrl) {
    codeInput.value = codeFromUrl; // Use the 'codeInput' variable you defined above
}


// -----------------
// STATE VARIABLES
// -----------------
let gameCode = null;
let gameActive = false;
let endTime = null;
let timerInterval = null;
let currentWord = "";

// =================
// JOIN GAME
// =================
joinBtn.onclick = () => {
    const code = codeInput.value.trim().toUpperCase();
    const name = nameInput.value.trim();

    if (!code || !name) {
        joinError.textContent = "Enter code and name";
        return;
    }

    socket.emit("player-join", { code, name });
    gameCode = code;

    joinStatus.textContent = `Joined game ${gameCode} as ${name}. Waiting for your teacher to start...`;
    joinError.textContent = "";
};

// =================
// SOCKET EVENTS
// =================
socket.on("error-msg", msg => {
    joinError.textContent = msg;
});

// GAME STARTED
socket.on("game-started", data => {
    joinScreen.hidden = true;
    gameScreen.hidden = false;
    gameActive = true;
    wordInput.readOnly = true;

    joinStatus.textContent = "";

    currentWord = "";
    wordInput.value = "";
    scoreEl.textContent = "0";
    playerWordsEl.innerHTML = "";
    feedbackEl.textContent = "";

    clearInterval(timerInterval);

    // Render letters as 3×3 grid buttons
    lettersEl.innerHTML = "";
    data.letters.forEach(letter => {
        const btn = document.createElement("button");
        btn.textContent = letter.toUpperCase();
        btn.className = "letter-btn";
        btn.onclick = () => {
            currentWord += letter;
            wordInput.value = currentWord;
            btn.disabled = true;
            btn.style.opacity = 0.4;
        };
        lettersEl.appendChild(btn);
    });

    // Start timer
    endTime = data.endTime;
    startTimer();
});

// GAME RESTARTED
socket.on("game-restart", data => {
    gameActive = true;
    wordInput.disabled = false;
    submitBtn.disabled = false;
    wordInput.readOnly = true;

    clearInterval(timerInterval);

    currentWord = "";
    wordInput.value = "";
    playerWordsEl.innerHTML = "";
    scoreEl.textContent = "0";
    feedbackEl.textContent = "";
    feedbackEl.style.color = "black";

    // Render new letters
    lettersEl.innerHTML = "";
    data.letters.forEach(letter => {
        const btn = document.createElement("button");
        btn.textContent = letter.toUpperCase();
        btn.className = "letter-btn";
        btn.onclick = () => {
            currentWord += letter;
            wordInput.value = currentWord;
            btn.disabled = true;
            btn.style.opacity = 0.4;
        };
        lettersEl.appendChild(btn);
    });

    // Reset timer
    endTime = data.endTime;
    startTimer();

    wordInput.value = "";
    wordInput.focus();
});

// WORD SUBMISSION RESULT
socket.on("word-result", result => {
    if (!result.valid) {

        const scoreEl = document.getElementById("score");
        
        // Update the number
        scoreEl.textContent = result.total;

        // Trigger the "Pop" animation
        scoreEl.classList.remove("score-bump"); // Reset if it's already there
        void scoreEl.offsetWidth;               // Magic trick to "reflow" the DOM
        scoreEl.classList.add("score-bump");

        feedbackEl.textContent = feedbackMessage(result.reason);
        feedbackEl.style.color = "crimson";

        // Reset letters
        currentWord = "";
        wordInput.value = "";
        document.querySelectorAll(".letter-btn").forEach(btn => {
            btn.disabled = false;
            btn.style.opacity = 1;
        });

        return;
    }

    // Valid word feedback
    scoreEl.textContent = result.total;
    feedbackEl.textContent = `+${result.points} points!`;
    feedbackEl.style.color = "green";

    setTimeout(() => feedbackEl.textContent = "", 1500);

    // Reset current word and letters
    currentWord = "";
    wordInput.value = "";
    document.querySelectorAll(".letter-btn").forEach(btn => {
        btn.disabled = false;
        btn.style.opacity = 1;
    });
});

// UPDATE PERSONAL WORD LIST
socket.on("player-words", words => {
    playerWordsEl.innerHTML = "";
    
    // Update the counter
    const wordCountEl = document.getElementById("wordCount");
    if (wordCountEl) wordCountEl.textContent = words.length;

    // We reverse the array so the most recent word is always at the top/front
    const reversedWords = [...words].reverse();

    reversedWords.forEach(word => {
        const li = document.createElement("li");
        li.textContent = word.toUpperCase();
        playerWordsEl.appendChild(li);
    });
});

// LOCK INPUT WHEN GAME ENDS
socket.on("lock-input", () => {
    gameActive = false;
    wordInput.disabled = true;
    submitBtn.disabled = true;
    feedbackEl.textContent = "Game over!";
    feedbackEl.style.color = "black";
    clearInterval(timerInterval);
    timerEl.textContent = "Time left: 0s";
});

socket.on("word-result", result => {
    const inputContainer = document.getElementById("wordInput");

    if (!result.valid) {
        // ERROR FEEL
        feedbackEl.textContent = feedbackMessage(result.reason);
        feedbackEl.style.color = "crimson";
        
        inputContainer.classList.add("input-error");
        setTimeout(() => inputContainer.classList.remove("input-error"), 400);

        // Reset letters
        resetLetters();
        return;
    }

    // SUCCESS FEEL
    scoreEl.textContent = result.total;
    feedbackEl.textContent = `+${result.points} points!`;
    feedbackEl.style.color = "green";

    inputContainer.classList.add("input-success");
    setTimeout(() => inputContainer.classList.remove("input-success"), 500);

    resetLetters();
});

// Helper to keep code clean
function resetLetters() {
    currentWord = "";
    wordInput.value = "";
    document.querySelectorAll(".letter-btn").forEach(btn => {
        btn.disabled = false;
        btn.style.opacity = 1;
        btn.classList.remove("btn-active"); // If you add active states
    });
}

// =================
// SUBMIT WORD
// =================
submitBtn.onclick = submitWord;
wordInput.addEventListener("keydown", e => {
    if (e.key === "Enter") submitWord();
});

function submitWord() {
    if (!gameActive || !currentWord) return;

    socket.emit("submit-word", {
        code: gameCode,
        word: currentWord
    });
}

// =================
// CLEAR BUTTON
// =================
clearBtn.onclick = () => {
    currentWord = "";
    wordInput.value = "";
    document.querySelectorAll(".letter-btn").forEach(btn => {
        btn.disabled = false;
        btn.style.opacity = 1;
    });
};

// =================
// TIMER FUNCTION
// =================
function startTimer() {
    // We need to know the total duration to calculate the percentage
    const totalDuration = endTime - Date.now();

    timerInterval = setInterval(() => {
        const remaining = Math.max(0, endTime - Date.now());
        const seconds = Math.ceil(remaining / 1000);
        const percentage = (remaining / totalDuration) * 100;

        // Update Text and Progress Bar
        timerEl.textContent = seconds;
        const fill = document.getElementById("progressFill");
        const container = document.getElementById("timerContainer");
        
        fill.style.width = `${percentage}%`;

        // Logic for "Stimulation" levels
        if (seconds <= 10) {
            container.className = "timer-danger";
        } else if (seconds <= 30) {
            container.className = "timer-warning";
        } else {
            container.className = "";
        }

        if (remaining <= 0) {
            clearInterval(timerInterval);
            container.classList.remove("timer-danger");
            fill.style.width = "0%";
        }
    }, 250);
}

// =================
// FEEDBACK MESSAGES
// =================
function feedbackMessage(reason) {
    switch (reason) {
        case "too-short": return "Too short";
        case "duplicate": return "Already used";
        case "not-in-dictionary": return "Not a valid word";
        case "invalid-letters": return "Letters don’t fit";
        default: return "Invalid";
    }
}
