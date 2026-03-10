// ai.js - Chess AI with Negamax, Alpha-Beta Pruning, and Positional Evaluation
// =============================================================================


// ─── Difficulty Configuration ─────────────────────────────────────────────────
// Keyed by difficulty name → { search depth, blunder probability }

const DIFFICULTY_CONFIG = {
    easy:   { depth: 2, blunderChance: 0.30 },
    medium: { depth: 3, blunderChance: 0.10 },
    hard:   { depth: 4, blunderChance: 0.00 },
};


// ─── Piece Base Values ────────────────────────────────────────────────────────

const PIECE_VALUES = {
    p: 100,
    n: 320,
    b: 330,
    r: 500,
    q: 900,
    k: 20000
};


// ─── Piece-Square Tables (PSTs) ───────────────────────────────────────────────
// All tables are from White's perspective (row 0 = rank 8).
// For Black, the table is mirrored vertically: table[7 - r][c].

const PST_PAWN = [
    [  0,   0,   0,   0,   0,   0,   0,   0],
    [ 50,  50,  50,  50,  50,  50,  50,  50],
    [ 10,  10,  20,  30,  30,  20,  10,  10],
    [  5,   5,  10,  25,  25,  10,   5,   5],
    [  0,   0,   0,  20,  20,   0,   0,   0],
    [  5,  -5, -10,   0,   0, -10,  -5,   5],
    [  5,  10,  10, -20, -20,  10,  10,   5],
    [  0,   0,   0,   0,   0,   0,   0,   0]
];

const PST_KNIGHT = [
    [-50, -40, -30, -30, -30, -30, -40, -50],
    [-40, -20,   0,   0,   0,   0, -20, -40],
    [-30,   0,  10,  15,  15,  10,   0, -30],
    [-30,   5,  15,  20,  20,  15,   5, -30],
    [-30,   0,  15,  20,  20,  15,   0, -30],
    [-30,   5,  10,  15,  15,  10,   5, -30],
    [-40, -20,   0,   5,   5,   0, -20, -40],
    [-50, -40, -30, -30, -30, -30, -40, -50]
];

const PST_BISHOP = [
    [-20, -10, -10, -10, -10, -10, -10, -20],
    [-10,   0,   0,   0,   0,   0,   0, -10],
    [-10,   0,  10,  10,  10,  10,   0, -10],
    [-10,   5,   5,  10,  10,   5,   5, -10],
    [-10,   0,  10,  10,  10,  10,   0, -10],
    [-10,  10,  10,  10,  10,  10,  10, -10],
    [-10,   5,   0,   0,   0,   0,   5, -10],
    [-20, -10, -10, -10, -10, -10, -10, -20]
];

const PST_ROOK = [
    [  0,   0,   0,   0,   0,   0,   0,   0],
    [  5,  10,  10,  10,  10,  10,  10,   5],
    [ -5,   0,   0,   0,   0,   0,   0,  -5],
    [ -5,   0,   0,   0,   0,   0,   0,  -5],
    [ -5,   0,   0,   0,   0,   0,   0,  -5],
    [ -5,   0,   0,   0,   0,   0,   0,  -5],
    [ -5,   0,   0,   0,   0,   0,   0,  -5],
    [  0,   0,   0,   5,   5,   0,   0,   0]
];

const PST_QUEEN = [
    [-20, -10, -10,  -5,  -5, -10, -10, -20],
    [-10,   0,   0,   0,   0,   0,   0, -10],
    [-10,   0,   5,   5,   5,   5,   0, -10],
    [ -5,   0,   5,   5,   5,   5,   0,  -5],
    [  0,   0,   5,   5,   5,   5,   0,  -5],
    [-10,   5,   5,   5,   5,   5,   0, -10],
    [-10,   0,   5,   0,   0,   0,   0, -10],
    [-20, -10, -10,  -5,  -5, -10, -10, -20]
];

const PST_KING_MIDGAME = [
    [-30, -40, -40, -50, -50, -40, -40, -30],
    [-30, -40, -40, -50, -50, -40, -40, -30],
    [-30, -40, -40, -50, -50, -40, -40, -30],
    [-30, -40, -40, -50, -50, -40, -40, -30],
    [-20, -30, -30, -40, -40, -30, -30, -20],
    [-10, -20, -20, -20, -20, -20, -20, -10],
    [ 20,  20,   0,   0,   0,   0,  20,  20],
    [ 20,  30,  10,   0,   0,  10,  30,  20]
];

const PST_KING_ENDGAME = [
    [-50, -40, -30, -20, -20, -30, -40, -50],
    [-30, -20, -10,   0,   0, -10, -20, -30],
    [-30, -10,  20,  30,  30,  20, -10, -30],
    [-30, -10,  30,  40,  40,  30, -10, -30],
    [-30, -10,  30,  40,  40,  30, -10, -30],
    [-30, -10,  20,  30,  30,  20, -10, -30],
    [-30, -30,   0,   0,   0,   0, -30, -30],
    [-50, -30, -30, -30, -30, -30, -30, -50]
];

// Maps non-king piece types to their PST (only used in evaluation)
const PST_MAP = {
    p: PST_PAWN,
    n: PST_KNIGHT,
    b: PST_BISHOP,
    r: PST_ROOK,
    q: PST_QUEEN
};


// =============================================================================
// ChessAI — Negamax with alpha-beta pruning and positional evaluation
// =============================================================================

class ChessAI {
    /**
     * @param {ChessEngine} engine - The shared engine instance.
     */
    constructor(engine) {
        this.engine     = engine;
        this.difficulty = 'medium'; // 'easy' | 'medium' | 'hard'

        // Keep local references to the shared constants for convenience
        this.pieceValues = PIECE_VALUES;
        this.pstMap      = PST_MAP;
    }


    // ─── Make / Undo Helpers ──────────────────────────────────────────────────

    makeMove(move) {
        this.engine.move(move.from.r, move.from.c, move.to.r, move.to.c, true);
    }

    undoMove() {
        this.engine.undo();
    }


    // ─── Move Ordering ────────────────────────────────────────────────────────

    /**
     * Heuristic score for a move used to order moves before searching.
     * Higher scores are tried first (captures, promotions, safe squares).
     *
     * @param {{ from: {r,c}, to: {r,c} }} move
     * @returns {number}
     */
    scoreMove(move) {
        let score = 0;
        const movingPiece = this.engine.board[move.from.r][move.from.c];
        const targetPiece = this.engine.board[move.to.r][move.to.c];

        // MVV-LVA: favour capturing high-value pieces with low-value ones
        if (targetPiece) {
            score += 10 * this.pieceValues[targetPiece.type] - this.pieceValues[movingPiece.type];
        } else if (movingPiece?.type === 'p' && move.from.c !== move.to.c) {
            // En passant capture
            score += 10 * this.pieceValues['p'] - this.pieceValues['p'];
        }

        // Promotion bonus
        if (movingPiece?.type === 'p' && (move.to.r === 0 || move.to.r === 7)) {
            score += this.pieceValues['q'];
        }

        // Penalise moving to a square covered by an opponent pawn
        if (movingPiece) {
            const oppDir = movingPiece.color === 'w' ? 1 : -1;
            for (const dc of [-1, 1]) {
                const pawnR = move.to.r + oppDir;
                const pawnC = move.to.c + dc;
                if (pawnR >= 0 && pawnR < 8 && pawnC >= 0 && pawnC < 8) {
                    const pawn = this.engine.board[pawnR][pawnC];
                    if (pawn && pawn.type === 'p' && pawn.color !== movingPiece.color) {
                        score -= 50;
                    }
                }
            }
        }

        return score;
    }

    /** Sorts moves best-first using `scoreMove`. */
    orderMoves(moves) {
        return moves
            .map(move => ({ move, score: this.scoreMove(move) }))
            .sort((a, b) => b.score - a.score)
            .map(({ move }) => move);
    }


    // ─── Best Move Selection ──────────────────────────────────────────────────

    /**
     * Returns the best move for the current side, applying difficulty settings.
     *
     * @returns {{ from: {r,c}, to: {r,c} } | null}
     */
    getBestMove() {
        const moves = this.engine.getAllLegalMoves(this.engine.turn);
        if (moves.length === 0) return null;

        const { depth, blunderChance } = DIFFICULTY_CONFIG[this.difficulty] ?? DIFFICULTY_CONFIG.medium;

        // Occasionally play a random (blunder) move on lower difficulties
        if (Math.random() < blunderChance) {
            return moves[Math.floor(Math.random() * moves.length)];
        }

        const ordered   = this.orderMoves(moves);
        const colorSign = this.engine.turn === 'w' ? 1 : -1;

        let bestMove  = ordered[0];
        let bestValue = -Infinity;

        for (const move of ordered) {
            this.makeMove(move);
            const value = -this.negamax(depth - 1, -Infinity, Infinity, -colorSign);
            this.undoMove();

            if (value > bestValue) {
                bestValue = value;
                bestMove  = move;
            }
        }

        return bestMove;
    }


    // ─── Negamax with Alpha-Beta Pruning ──────────────────────────────────────

    /**
     * Recursively searches the game tree using negamax with alpha-beta pruning.
     *
     * @param {number} depth      - Remaining search depth.
     * @param {number} alpha      - Lower bound (best score for the current side so far).
     * @param {number} beta       - Upper bound (best score for the opponent so far).
     * @param {number} colorSign  - +1 for White, -1 for Black.
     * @returns {number} The best score achievable from this position.
     */
    negamax(depth, alpha, beta, colorSign) {
        const color = colorSign === 1 ? 'w' : 'b';

        if (depth === 0) return colorSign * this.evaluate();

        const moves = this.engine.getAllLegalMoves(color);

        if (moves.length === 0) {
            // Checkmate: prefer faster mates by adding depth to the penalty
            return this.engine.isInCheck(color) ? -10000 - depth : 0; // stalemate = 0
        }

        let best = -Infinity;
        for (const move of this.orderMoves(moves)) {
            this.makeMove(move);
            const value = -this.negamax(depth - 1, -beta, -alpha, -colorSign);
            this.undoMove();

            best  = Math.max(best, value);
            alpha = Math.max(alpha, value);
            if (alpha >= beta) break; // beta cut-off
        }

        return best;
    }


    // ─── Board Evaluation ─────────────────────────────────────────────────────

    /**
     * Statically evaluates the current position from White's perspective.
     * Positive = good for White, negative = good for Black.
     *
     * @returns {number}
     */
    evaluate() {
        let whiteScore    = 0,  blackScore    = 0;
        let whiteMaterial = 0,  blackMaterial = 0;
        let whiteBishops  = 0,  blackBishops  = 0;
        let whiteKingR = 0, whiteKingC = 0;
        let blackKingR = 0, blackKingC = 0;

        const whitePawnFiles = new Array(8).fill(0);
        const blackPawnFiles = new Array(8).fill(0);

        // ── Pass 1: Collect material totals and structural data ──────────────
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const piece = this.engine.board[r][c];
                if (!piece) continue;

                const value = this.pieceValues[piece.type];

                if (piece.color === 'w') {
                    whiteMaterial += value;
                    if (piece.type === 'b') whiteBishops++;
                    if (piece.type === 'p') whitePawnFiles[c]++;
                    if (piece.type === 'k') { whiteKingR = r; whiteKingC = c; }
                } else {
                    blackMaterial += value;
                    if (piece.type === 'b') blackBishops++;
                    if (piece.type === 'p') blackPawnFiles[c]++;
                    if (piece.type === 'k') { blackKingR = r; blackKingC = c; }
                }
            }
        }

        // Endgame threshold: material excluding kings is below 2600
        const isEndgame = (whiteMaterial + blackMaterial - 40000) < 2600;

        // ── Pass 2: Piece-square table positional bonuses ────────────────────
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const piece = this.engine.board[r][c];
                if (!piece) continue;

                let value = this.pieceValues[piece.type];

                if (piece.type === 'k') {
                    const table = isEndgame ? PST_KING_ENDGAME : PST_KING_MIDGAME;
                    value += piece.color === 'w' ? table[r][c] : table[7 - r][c];
                } else {
                    const table = this.pstMap[piece.type];
                    if (table) value += piece.color === 'w' ? table[r][c] : table[7 - r][c];
                }

                if (piece.color === 'w') whiteScore += value;
                else                     blackScore += value;
            }
        }

        // ── Bonuses: bishop pair ─────────────────────────────────────────────
        if (whiteBishops >= 2) whiteScore += 30;
        if (blackBishops >= 2) blackScore += 30;

        // ── Penalties: doubled pawns ─────────────────────────────────────────
        for (let c = 0; c < 8; c++) {
            if (whitePawnFiles[c] > 1) whiteScore -= 15 * (whitePawnFiles[c] - 1);
            if (blackPawnFiles[c] > 1) blackScore -= 15 * (blackPawnFiles[c] - 1);
        }

        // ── King safety (middlegame only) ────────────────────────────────────
        if (!isEndgame) {
            whiteScore += this.evaluateKingSafety('w', whiteKingR, whiteKingC, whitePawnFiles);
            blackScore += this.evaluateKingSafety('b', blackKingR, blackKingC, blackPawnFiles);
        }

        // ── Pseudo-mobility (cheaper than full legal-move count) ─────────────
        const whiteMobility = this.engine.getAllPseudoLegalMoves('w').length;
        const blackMobility = this.engine.getAllPseudoLegalMoves('b').length;

        return (whiteScore + whiteMobility * 2) - (blackScore + blackMobility * 2);
    }


    // ─── King Safety ──────────────────────────────────────────────────────────

    /**
     * Awards a safety bonus for pawn shields and penalises open files near the king.
     *
     * @param {'w'|'b'}  color
     * @param {number}   kingR
     * @param {number}   kingC
     * @param {number[]} friendlyPawnFiles - Count of friendly pawns per file.
     * @returns {number}
     */
    evaluateKingSafety(color, kingR, kingC, friendlyPawnFiles) {
        let safety = 0;
        const shieldDir = color === 'w' ? -1 : 1; // direction "in front of" the king

        for (let dc = -1; dc <= 1; dc++) {
            const fileC = kingC + dc;
            if (fileC < 0 || fileC > 7) continue;

            // Reward pawns directly in front of the king
            const shieldR = kingR + shieldDir;
            if (shieldR >= 0 && shieldR <= 7) {
                const shieldPiece = this.engine.board[shieldR][fileC];
                if (shieldPiece && shieldPiece.type === 'p' && shieldPiece.color === color) {
                    safety += 10;
                }
            }

            // Penalise open files adjacent to or on the king's file
            if (friendlyPawnFiles[fileC] === 0) {
                safety -= 15;
            }
        }

        return safety;
    }
}
