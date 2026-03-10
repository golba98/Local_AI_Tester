// game.js - UI, Interaction, and Game Loop
// =============================================================================


// ─── DOM Element References ───────────────────────────────────────────────────

const boardElement    = document.getElementById('chess-board');
const statusElement   = document.getElementById('status');
const moveListElement = document.getElementById('move-list');
const resetBtn        = document.getElementById('reset-btn');
const aiControls      = document.getElementById('ai-controls');
const effectsLayer    = document.getElementById('effects-layer');

const timerElement      = document.getElementById('timer');
const scoreElement      = document.getElementById('score');
const multiplierElement = document.getElementById('multiplier');
const comboElement      = document.getElementById('combo');
const levelElement      = document.getElementById('level');
const themeSelect       = document.getElementById('theme-select');
const diffSelect        = document.getElementById('diff-select');
const aiToggleBtn       = document.getElementById('ai-toggle-btn');

// Theme-toggle icons
const themeToggle = document.getElementById('theme-toggle');
const lightIcon   = document.getElementById('light-icon');
const darkIcon    = document.getElementById('dark-icon');

// Sound / accessibility toggles
const soundToggle    = document.getElementById('sound-toggle');
const contrastToggle = document.getElementById('contrast-toggle');
const motionToggle   = document.getElementById('motion-toggle');


// ─── Theme Configuration ──────────────────────────────────────────────────────

const THEMES = [
    { id: 'studio', label: 'Studio', minLevel: 1, isDark: false },
    { id: 'dark',   label: 'Noir',   minLevel: 1, isDark: true  },
    { id: 'forest', label: 'Forest', minLevel: 3, isDark: false },
    { id: 'sunset', label: 'Sunset', minLevel: 5, isDark: true  },
    { id: 'mono',   label: 'Mono',   minLevel: 7, isDark: true  },
];

let currentTheme    = 'studio';
let unlockedThemes  = new Set(['studio', 'dark']);

function updateThemeOptions() {
    themeSelect.innerHTML = '';
    for (const theme of THEMES) {
        const opt = document.createElement('option');
        opt.value       = theme.id;
        opt.textContent = theme.label + (unlockedThemes.has(theme.id) ? '' : ' (Locked)');
        opt.disabled    = !unlockedThemes.has(theme.id);
        opt.selected    = theme.id === currentTheme;
        themeSelect.appendChild(opt);
    }
}

function setTheme(themeId) {
    const theme = THEMES.find(t => t.id === themeId);
    if (!theme || !unlockedThemes.has(themeId)) return;

    currentTheme = themeId;
    document.body.setAttribute('data-theme', themeId);
    lightIcon.classList.toggle('active', !theme.isDark);
    darkIcon.classList.toggle('active',  theme.isDark);
    updateThemeOptions();
}

function cycleTheme() {
    const available    = THEMES.filter(t => unlockedThemes.has(t.id));
    const currentIndex = available.findIndex(t => t.id === currentTheme);
    const next         = available[(currentIndex + 1) % available.length];
    setTheme(next.id);
}

function unlockThemes(currentLevel) {
    for (const theme of THEMES) {
        if (currentLevel >= theme.minLevel) unlockedThemes.add(theme.id);
    }
    updateThemeOptions();
}

themeToggle.addEventListener('click', cycleTheme);
themeToggle.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        cycleTheme();
    }
});
themeSelect.addEventListener('change', event => setTheme(event.target.value));


// ─── Game Engine & AI ─────────────────────────────────────────────────────────

const engine = new ChessEngine();
const ai     = new ChessAI(engine);


// ─── AI Controls ─────────────────────────────────────────────────────────────

let isAIEnabled = false;

diffSelect.addEventListener('change', event => {
    ai.difficulty = event.target.value;
});

aiToggleBtn.addEventListener('click', () => {
    isAIEnabled = !isAIEnabled;
    aiToggleBtn.textContent = isAIEnabled ? 'AI Opponent Active' : 'Enable AI Opponent';
    aiToggleBtn.classList.toggle('secondary', !isAIEnabled);

    if (isAIEnabled && engine.turn === 'b' && engine.gameState === 'playing') {
        setTimeout(makeAIMove, 600);
    }
});


// ─── Piece Scores (for UI scoring, separate from AI evaluation) ───────────────

const PIECE_SCORES = { p: 10, n: 30, b: 30, r: 50, q: 90, k: 200 };


// ─── Game State ───────────────────────────────────────────────────────────────

let selectedSquare = null;
let validMoves     = [];
let cursor         = { r: 7, c: 0 };

let score      = 0;
let combo      = 0;
let multiplier = 1;
let level      = 1;
let turnTime   = 20;
let timeLeft   = 20;
let timerInterval = null;

let isSoundOn     = true;
let highContrast  = false;
let reducedMotion = false;


// ─── Audio ────────────────────────────────────────────────────────────────────

let audioContext = null;

const SOUND_CONFIG = {
    success: { frequency: 720, duration: 0.18 },
    fail:    { frequency: 220, duration: 0.20 },
    click:   { frequency: 520, duration: 0.08 },
};

function ensureAudio() {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
}

function playSound(type) {
    if (!isSoundOn) return;
    ensureAudio();
    if (!audioContext) return;

    const { frequency, duration } = SOUND_CONFIG[type] ?? SOUND_CONFIG.click;

    const oscillator = audioContext.createOscillator();
    const gainNode   = audioContext.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    const now = audioContext.currentTime;
    oscillator.frequency.setValueAtTime(frequency, now);
    gainNode.gain.setValueAtTime(0.001, now);
    gainNode.gain.exponentialRampToValueAtTime(0.3,   now + 0.02);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + duration);
    oscillator.start(now);
    oscillator.stop(now + duration);
}


// ─── HUD & Scoring ────────────────────────────────────────────────────────────

function updateHUD() {
    timerElement.textContent      = `${timeLeft.toFixed(1)}s`;
    scoreElement.textContent      = score.toString();
    multiplierElement.textContent = `x${multiplier}`;
    comboElement.textContent      = combo.toString();
    levelElement.textContent      = level.toString();
}

function updateDifficulty() {
    const baseTime     = 20;
    const timeDecrease = Math.min(10, (level - 1) * 1.2);
    turnTime = Math.max(6, baseTime - timeDecrease);

    // Escalate AI difficulty as the player levels up
    const targetDifficulty = level >= 6 ? 'hard' : level >= 3 ? 'medium' : 'easy';
    const order = { easy: 0, medium: 1, hard: 2 };
    if (order[ai.difficulty] < order[targetDifficulty]) {
        ai.difficulty   = targetDifficulty;
        diffSelect.value = targetDifficulty;
    }
}

function updateLevel() {
    const nextLevel = Math.max(1, Math.floor(score / 200) + 1);
    if (nextLevel !== level) {
        level = nextLevel;
        updateDifficulty();
        unlockThemes(level);
    }
}

function addScore(isCapture, capturedPiece) {
    combo      = isCapture ? combo + 1 : 0;
    multiplier = 1 + Math.floor(combo / 3);
    const base = isCapture && capturedPiece ? (PIECE_SCORES[capturedPiece.type] ?? 10) : 1;
    score += Math.round(base * multiplier);
    updateLevel();
    updateHUD();
}


// ─── Timer ────────────────────────────────────────────────────────────────────

function startTurnTimer() {
    clearInterval(timerInterval);
    timeLeft = turnTime;
    updateHUD();

    timerInterval = setInterval(() => {
        timeLeft = Math.max(0, timeLeft - 0.1);
        updateHUD();
        if (timeLeft <= 0) {
            clearInterval(timerInterval);
            handleTimeout();
        }
    }, 100);
}

function handleTimeout() {
    combo      = 0;
    multiplier = 1;
    score      = Math.max(0, score - 15);
    updateLevel();
    playSound('fail');
    triggerShake();

    // Force the turn to pass
    engine.history.push('Time');
    engine.turn = engine.turn === 'w' ? 'b' : 'w';
    engine.updateGameState();
    render();

    if (isAIEnabled && engine.turn === 'b' && engine.gameState === 'playing') {
        setTimeout(makeAIMove, 600);
    }
    startTurnTimer();
}


// ─── Visual Effects ───────────────────────────────────────────────────────────

function triggerShake() {
    boardElement.classList.add('shake');
    setTimeout(() => boardElement.classList.remove('shake'), 220);
}

function spawnParticles(x, y, color) {
    if (reducedMotion) return;

    for (let i = 0; i < 12; i++) {
        const particle = document.createElement('div');
        particle.className    = 'particle';
        particle.style.background = color;
        particle.style.left   = `${x}px`;
        particle.style.top    = `${y}px`;

        const angle    = Math.random() * Math.PI * 2;
        const distance = 20 + Math.random() * 30;
        const dx = Math.cos(angle) * distance;
        const dy = Math.sin(angle) * distance;

        particle.animate(
            [{ transform: 'translate(-50%, -50%)' }, { transform: `translate(${dx}px, ${dy}px)` }],
            { duration: 600, easing: 'ease-out', fill: 'forwards' }
        );

        effectsLayer.appendChild(particle);
        setTimeout(() => particle.remove(), 600);
    }
}

function spawnCaptureParticles(r, c, color) {
    const square    = boardElement.querySelector(`[data-row="${r}"][data-col="${c}"]`);
    if (!square) return;

    const boardRect = boardElement.getBoundingClientRect();
    const rect      = square.getBoundingClientRect();
    const x = rect.left - boardRect.left + rect.width  / 2;
    const y = rect.top  - boardRect.top  + rect.height / 2;
    spawnParticles(x, y, color);
}


// ─── Rendering ────────────────────────────────────────────────────────────────

function renderBoard() {
    boardElement.innerHTML = '';

    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const square = document.createElement('div');
            square.className = `square ${(r + c) % 2 === 0 ? 'light' : 'dark'}`;
            square.dataset.row = r;
            square.dataset.col = c;

            if (cursor.r === r && cursor.c === c) square.classList.add('cursor');
            if (selectedSquare?.r === r && selectedSquare?.c === c) square.classList.add('selected');
            if (validMoves.some(m => m[0] === r && m[1] === c)) square.classList.add('highlight');

            const piece = engine.getPiece(r, c);
            if (piece) {
                const img = document.createElement('img');
                img.src       = PIECES[piece.color][piece.type];
                img.className = 'piece';
                square.appendChild(img);
            }

            square.addEventListener('pointerdown', () => handleSquareClick(r, c));
            boardElement.appendChild(square);
        }
    }
}

function renderMoveHistory() {
    moveListElement.innerHTML = '';

    for (let i = 0; i < engine.history.length; i += 2) {
        const li        = document.createElement('li');
        const moveNum   = Math.floor(i / 2) + 1;
        const whiteMove = engine.history[i];
        const blackMove = engine.history[i + 1] ?? '';

        li.innerHTML = `
            <span style="color: var(--text-secondary); width: 35px; font-weight: 600; font-size: 0.8rem;">${moveNum}</span>
            <span style="flex: 1; font-weight: 500; color: var(--text-primary);">${whiteMove}</span>
            <span style="flex: 1; font-weight: 500; color: var(--text-primary);">${blackMove}</span>
        `;
        moveListElement.appendChild(li);
    }

    moveListElement.scrollTop = moveListElement.scrollHeight;
}

function render() {
    renderBoard();
    renderMoveHistory();

    statusElement.textContent = getStatusText();
    updateHUD();

    if (engine.gameState !== 'playing') clearInterval(timerInterval);
}

function getStatusText() {
    if (engine.gameState === 'checkmate') {
        return `Checkmate! ${engine.turn === 'w' ? 'Black' : 'White'} Wins!`;
    }
    if (engine.gameState === 'stalemate') {
        return 'Stalemate! Game Over.';
    }
    const turnText = engine.turn === 'w' ? "White's Turn" : "Black's Turn";
    return engine.isInCheck() ? `${turnText} (Check!)` : turnText;
}


// ─── Input Handling ───────────────────────────────────────────────────────────

function handleSquareClick(r, c) {
    if (engine.gameState !== 'playing') return;
    if (isAIEnabled && engine.turn === 'b') return; // block input during AI turn

    const piece = engine.getPiece(r, c);

    // Attempt to execute a highlighted move
    if (validMoves.some(m => m[0] === r && m[1] === c)) {
        const movingPiece  = engine.getPiece(selectedSquare.r, selectedSquare.c);
        let   capturedPiece = engine.getPiece(r, c);

        // En passant: the captured pawn is on the same rank as the moving pawn
        if (movingPiece?.type === 'p' && !capturedPiece && selectedSquare.c !== c) {
            capturedPiece = engine.getPiece(selectedSquare.r, c);
        }

        const moved = engine.move(selectedSquare.r, selectedSquare.c, r, c);
        selectedSquare = null;
        validMoves     = [];

        if (moved) {
            if (capturedPiece) {
                spawnCaptureParticles(r, c, 'var(--highlight)');
                playSound('success');
            } else {
                playSound('click');
            }
            addScore(!!capturedPiece, capturedPiece);
            startTurnTimer();
            render();

            if (isAIEnabled && engine.gameState === 'playing') {
                setTimeout(makeAIMove, 500);
            }
        }
        return;
    }

    // Select a friendly piece
    if (piece && piece.color === engine.turn) {
        selectedSquare = { r, c };
        validMoves     = engine.getValidMoves(r, c);
        playSound('click');
    } else {
        selectedSquare = null;
        validMoves     = [];
    }

    render();
}

function handleKeyDown(event) {
    const { key } = event;
    const arrowKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];

    if (arrowKeys.includes(key)) {
        event.preventDefault();
        if (key === 'ArrowUp')    cursor.r = Math.max(0, cursor.r - 1);
        if (key === 'ArrowDown')  cursor.r = Math.min(7, cursor.r + 1);
        if (key === 'ArrowLeft')  cursor.c = Math.max(0, cursor.c - 1);
        if (key === 'ArrowRight') cursor.c = Math.min(7, cursor.c + 1);
        render();
    }

    if (key === 'Enter' || key === ' ') {
        event.preventDefault();
        handleSquareClick(cursor.r, cursor.c);
    }
}

boardElement.addEventListener('keydown', handleKeyDown);


// ─── AI Move ─────────────────────────────────────────────────────────────────

function makeAIMove() {
    if (engine.gameState !== 'playing') return;

    const move = ai.getBestMove();
    if (!move) return;

    const movingPiece  = engine.getPiece(move.from.r, move.from.c);
    let   capturedPiece = engine.getPiece(move.to.r, move.to.c);

    // En passant: the captured pawn is beside the moving pawn, not on the destination
    if (movingPiece?.type === 'p' && !capturedPiece && move.from.c !== move.to.c) {
        capturedPiece = engine.getPiece(move.from.r, move.to.c);
    }

    engine.move(move.from.r, move.from.c, move.to.r, move.to.c);

    if (capturedPiece) {
        spawnCaptureParticles(move.to.r, move.to.c, 'var(--highlight)');
        playSound('success');
    }

    addScore(!!capturedPiece, capturedPiece);
    startTurnTimer();
    render();
}


// ─── Accessibility / Settings Toggles ────────────────────────────────────────

soundToggle.addEventListener('click', () => {
    isSoundOn = !isSoundOn;
    soundToggle.textContent = isSoundOn ? 'Sound: On' : 'Sound: Off';
    if (isSoundOn) playSound('click');
});

contrastToggle.addEventListener('click', () => {
    highContrast = !highContrast;
    document.body.setAttribute('data-contrast', highContrast ? 'high' : 'normal');
    contrastToggle.textContent = highContrast ? 'High Contrast: On' : 'High Contrast: Off';
});

motionToggle.addEventListener('click', () => {
    reducedMotion = !reducedMotion;
    document.body.setAttribute('data-motion', reducedMotion ? 'reduced' : 'full');
    motionToggle.textContent = reducedMotion ? 'Reduced Motion: On' : 'Reduced Motion: Off';
});


// ─── Reset ────────────────────────────────────────────────────────────────────

function resetGame() {
    engine.reset();
    selectedSquare = null;
    validMoves     = [];
    cursor         = { r: 7, c: 0 };
    score          = 0;
    combo          = 0;
    multiplier     = 1;
    level          = 1;
    unlockedThemes = new Set(['studio', 'dark']);

    updateThemeOptions();
    updateDifficulty();
    startTurnTimer();
    render();
}

resetBtn.addEventListener('click', resetGame);


// ─── Initialisation ───────────────────────────────────────────────────────────

function initBoard() {
    document.body.setAttribute('data-theme', currentTheme);
    updateThemeOptions();
    updateDifficulty();
    updateHUD();
    startTurnTimer();
    render();
    boardElement.focus();
}

document.addEventListener('DOMContentLoaded', initBoard);
