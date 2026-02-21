// ai.js - Chess AI with Negamax, Alpha-Beta Pruning, and Positional Evaluation
// =============================================================================

class ChessAI {
    constructor(engine) {
        this.engine = engine;
        this.difficulty = 'medium'; // easy, medium, hard

        // ─── Piece Base Values ──────────────────────────────────────────
        this.pieceValues = {
            p: 100,
            n: 320,
            b: 330,
            r: 500,
            q: 900,
            k: 20000
        };

        // ─── Piece-Square Tables (from White's perspective, row 0 = rank 8)
        // Mirrored vertically for Black.

        this.pawnTable = [
            [  0,   0,   0,   0,   0,   0,   0,   0],
            [ 50,  50,  50,  50,  50,  50,  50,  50],
            [ 10,  10,  20,  30,  30,  20,  10,  10],
            [  5,   5,  10,  25,  25,  10,   5,   5],
            [  0,   0,   0,  20,  20,   0,   0,   0],
            [  5,  -5, -10,   0,   0, -10,  -5,   5],
            [  5,  10,  10, -20, -20,  10,  10,   5],
            [  0,   0,   0,   0,   0,   0,   0,   0]
        ];

        this.knightTable = [
            [-50, -40, -30, -30, -30, -30, -40, -50],
            [-40, -20,   0,   0,   0,   0, -20, -40],
            [-30,   0,  10,  15,  15,  10,   0, -30],
            [-30,   5,  15,  20,  20,  15,   5, -30],
            [-30,   0,  15,  20,  20,  15,   0, -30],
            [-30,   5,  10,  15,  15,  10,   5, -30],
            [-40, -20,   0,   5,   5,   0, -20, -40],
            [-50, -40, -30, -30, -30, -30, -40, -50]
        ];

        this.bishopTable = [
            [-20, -10, -10, -10, -10, -10, -10, -20],
            [-10,   0,   0,   0,   0,   0,   0, -10],
            [-10,   0,  10,  10,  10,  10,   0, -10],
            [-10,   5,   5,  10,  10,   5,   5, -10],
            [-10,   0,  10,  10,  10,  10,   0, -10],
            [-10,  10,  10,  10,  10,  10,  10, -10],
            [-10,   5,   0,   0,   0,   0,   5, -10],
            [-20, -10, -10, -10, -10, -10, -10, -20]
        ];

        this.rookTable = [
            [  0,   0,   0,   0,   0,   0,   0,   0],
            [  5,  10,  10,  10,  10,  10,  10,   5],
            [ -5,   0,   0,   0,   0,   0,   0,  -5],
            [ -5,   0,   0,   0,   0,   0,   0,  -5],
            [ -5,   0,   0,   0,   0,   0,   0,  -5],
            [ -5,   0,   0,   0,   0,   0,   0,  -5],
            [ -5,   0,   0,   0,   0,   0,   0,  -5],
            [  0,   0,   0,   5,   5,   0,   0,   0]
        ];

        this.queenTable = [
            [-20, -10, -10,  -5,  -5, -10, -10, -20],
            [-10,   0,   0,   0,   0,   0,   0, -10],
            [-10,   0,   5,   5,   5,   5,   0, -10],
            [ -5,   0,   5,   5,   5,   5,   0,  -5],
            [  0,   0,   5,   5,   5,   5,   0,  -5],
            [-10,   5,   5,   5,   5,   5,   0, -10],
            [-10,   0,   5,   0,   0,   0,   0, -10],
            [-20, -10, -10,  -5,  -5, -10, -10, -20]
        ];

        this.kingMiddleGameTable = [
            [-30, -40, -40, -50, -50, -40, -40, -30],
            [-30, -40, -40, -50, -50, -40, -40, -30],
            [-30, -40, -40, -50, -50, -40, -40, -30],
            [-30, -40, -40, -50, -50, -40, -40, -30],
            [-20, -30, -30, -40, -40, -30, -30, -20],
            [-10, -20, -20, -20, -20, -20, -20, -10],
            [ 20,  20,   0,   0,   0,   0,  20,  20],
            [ 20,  30,  10,   0,   0,  10,  30,  20]
        ];

        this.kingEndGameTable = [
            [-50, -40, -30, -20, -20, -30, -40, -50],
            [-30, -20, -10,   0,   0, -10, -20, -30],
            [-30, -10,  20,  30,  30,  20, -10, -30],
            [-30, -10,  30,  40,  40,  30, -10, -30],
            [-30, -10,  30,  40,  40,  30, -10, -30],
            [-30, -10,  20,  30,  30,  20, -10, -30],
            [-30, -30,   0,   0,   0,   0, -30, -30],
            [-50, -30, -30, -30, -30, -30, -30, -50]
        ];

        // Map piece types to their PST
        this.pstMap = {
            p: this.pawnTable,
            n: this.knightTable,
            b: this.bishopTable,
            r: this.rookTable,
            q: this.queenTable
        };
    }


    // ─── MAKE / UNDO HELPERS ────────────────────────────────────────────────

    makeMove(move) {
        const piece = this.engine.board[move.from.r][move.from.c];
        const captured = this.engine.board[move.to.r][move.to.c];

        this.engine.board[move.to.r][move.to.c] = piece;
        this.engine.board[move.from.r][move.from.c] = null;

        const promoted = piece.type === 'p' && (move.to.r === 0 || move.to.r === 7);
        if (promoted) piece.type = 'q';

        return { piece, captured, promoted };
    }

    undoMove(move, state) {
        if (state.promoted) state.piece.type = 'p';
        this.engine.board[move.from.r][move.from.c] = state.piece;
        this.engine.board[move.to.r][move.to.c] = state.captured;
    }


    // ─── MOVE ORDERING ──────────────────────────────────────────────────────

    scoreMove(move) {
        let score = 0;
        const movingPiece = this.engine.board[move.from.r][move.from.c];
        const targetPiece = this.engine.board[move.to.r][move.to.c];

        // MVV-LVA: prioritize capturing high-value pieces with low-value pieces
        if (targetPiece) {
            score += 10 * this.pieceValues[targetPiece.type] - this.pieceValues[movingPiece.type];
        }

        // Promotion bonus
        if (movingPiece.type === 'p' && (move.to.r === 0 || move.to.r === 7)) {
            score += this.pieceValues['q'];
        }

        // Penalize moving piece to a square attacked by opponent pawn
        const oppDir = movingPiece.color === 'w' ? 1 : -1;
        for (const dc of [-1, 1]) {
            const pr = move.to.r + oppDir;
            const pc = move.to.c + dc;
            if (pr >= 0 && pr < 8 && pc >= 0 && pc < 8) {
                const p = this.engine.board[pr][pc];
                if (p && p.type === 'p' && p.color !== movingPiece.color) {
                    score -= 50;
                }
            }
        }

        return score;
    }

    orderMoves(moves) {
        const scored = moves.map(m => ({ move: m, score: this.scoreMove(m) }));
        scored.sort((a, b) => b.score - a.score);
        return scored.map(s => s.move);
    }


    // ─── BEST MOVE SELECTION ────────────────────────────────────────────────

    getBestMove() {
        const moves = this.engine.getAllLegalMoves(this.engine.turn);
        if (moves.length === 0) return null;

        // Difficulty settings
        let depth, blunderChance;
        switch (this.difficulty) {
            case 'easy':   depth = 2; blunderChance = 0.3;  break;
            case 'medium': depth = 3; blunderChance = 0.10; break;
            case 'hard':   depth = 4; blunderChance = 0;    break;
            default:       depth = 3; blunderChance = 0.10; break;
        }

        // Random blunder for lower difficulties
        if (Math.random() < blunderChance) {
            return moves[Math.floor(Math.random() * moves.length)];
        }

        const ordered = this.orderMoves(moves);
        const color = this.engine.turn;
        const colorSign = color === 'w' ? 1 : -1;

        let bestMove = ordered[0];
        let bestValue = -Infinity;

        for (const move of ordered) {
            const state = this.makeMove(move);
            const value = -this.negamax(depth - 1, -Infinity, Infinity, -colorSign);
            this.undoMove(move, state);

            if (value > bestValue) {
                bestValue = value;
                bestMove = move;
            }
        }

        return bestMove;
    }


    // ─── NEGAMAX WITH ALPHA-BETA PRUNING ────────────────────────────────────

    negamax(depth, alpha, beta, colorSign) {
        const color = colorSign === 1 ? 'w' : 'b';

        if (depth === 0) {
            return colorSign * this.evaluate();
        }

        const moves = this.engine.getAllLegalMoves(color);

        // No legal moves → checkmate or stalemate
        if (moves.length === 0) {
            if (this.engine.isInCheck(color)) {
                // Checkmate — worse the deeper we are = faster mate preferred
                return -10000 - depth;
            }
            return 0; // Stalemate = draw
        }

        const ordered = this.orderMoves(moves);
        let best = -Infinity;

        for (const move of ordered) {
            const state = this.makeMove(move);
            const value = -this.negamax(depth - 1, -beta, -alpha, -colorSign);
            this.undoMove(move, state);

            best = Math.max(best, value);
            alpha = Math.max(alpha, value);
            if (alpha >= beta) break; // Pruning
        }

        return best;
    }


    // ─── EVALUATION FUNCTION ────────────────────────────────────────────────

    evaluate() {
        let whiteScore = 0;
        let blackScore = 0;
        let whiteMaterial = 0;
        let blackMaterial = 0;
        let whiteBishops = 0;
        let blackBishops = 0;

        const whitePawnFiles = new Array(8).fill(0);
        const blackPawnFiles = new Array(8).fill(0);

        let whiteKingR = 0, whiteKingC = 0;
        let blackKingR = 0, blackKingC = 0;

        // ── Pass 1: Material + PST + Pawn structure ──

        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const piece = this.engine.board[r][c];
                if (!piece) continue;

                const baseValue = this.pieceValues[piece.type];

                if (piece.color === 'w') {
                    whiteMaterial += baseValue;
                    if (piece.type === 'b') whiteBishops++;
                    if (piece.type === 'p') whitePawnFiles[c]++;
                    if (piece.type === 'k') { whiteKingR = r; whiteKingC = c; }
                } else {
                    blackMaterial += baseValue;
                    if (piece.type === 'b') blackBishops++;
                    if (piece.type === 'p') blackPawnFiles[c]++;
                    if (piece.type === 'k') { blackKingR = r; blackKingC = c; }
                }
            }
        }

        const totalMaterial = whiteMaterial + blackMaterial - 40000; // subtract king values
        const isEndgame = totalMaterial < 2600;

        // ── Pass 2: Compute scores ──

        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const piece = this.engine.board[r][c];
                if (!piece) continue;

                let value = this.pieceValues[piece.type];

                // Add piece-square table bonus
                if (piece.type === 'k') {
                    const table = isEndgame ? this.kingEndGameTable : this.kingMiddleGameTable;
                    value += (piece.color === 'w') ? table[r][c] : table[7 - r][c];
                } else {
                    const table = this.pstMap[piece.type];
                    if (table) {
                        value += (piece.color === 'w') ? table[r][c] : table[7 - r][c];
                    }
                }

                if (piece.color === 'w') {
                    whiteScore += value;
                } else {
                    blackScore += value;
                }
            }
        }

        // ── Bishop pair bonus ──
        if (whiteBishops >= 2) whiteScore += 30;
        if (blackBishops >= 2) blackScore += 30;

        // ── Pawn structure penalties ──
        for (let c = 0; c < 8; c++) {
            // Doubled pawns
            if (whitePawnFiles[c] > 1) whiteScore -= 15 * (whitePawnFiles[c] - 1);
            if (blackPawnFiles[c] > 1) blackScore -= 15 * (blackPawnFiles[c] - 1);

            // Isolated pawns (no friendly pawn on adjacent files)
            const whiteLeft = c > 0 ? whitePawnFiles[c - 1] : 0;
            const whiteRight = c < 7 ? whitePawnFiles[c + 1] : 0;
            if (whitePawnFiles[c] > 0 && whiteLeft === 0 && whiteRight === 0) {
                whiteScore -= 12;
            }

            const blackLeft = c > 0 ? blackPawnFiles[c - 1] : 0;
            const blackRight = c < 7 ? blackPawnFiles[c + 1] : 0;
            if (blackPawnFiles[c] > 0 && blackLeft === 0 && blackRight === 0) {
                blackScore -= 12;
            }
        }

        // ── King safety (middle game only) ──
        if (!isEndgame) {
            whiteScore += this.evaluateKingSafety('w', whiteKingR, whiteKingC, whitePawnFiles);
            blackScore += this.evaluateKingSafety('b', blackKingR, blackKingC, blackPawnFiles);
        }

        // ── Mobility bonus (lightweight) ──
        const whiteMobility = this.engine.getAllLegalMoves('w').length;
        const blackMobility = this.engine.getAllLegalMoves('b').length;
        whiteScore += whiteMobility * 3;
        blackScore += blackMobility * 3;

        return whiteScore - blackScore;
    }


    // ─── KING SAFETY ────────────────────────────────────────────────────────

    evaluateKingSafety(color, kingR, kingC, friendlyPawnFiles) {
        let safety = 0;

        // Reward pawn shield in front of the king
        const dir = color === 'w' ? -1 : 1;
        for (let dc = -1; dc <= 1; dc++) {
            const shieldC = kingC + dc;
            if (shieldC < 0 || shieldC > 7) continue;

            const shieldR = kingR + dir;
            if (shieldR < 0 || shieldR > 7) continue;

            const shieldPiece = this.engine.board[shieldR][shieldC];
            if (shieldPiece && shieldPiece.type === 'p' && shieldPiece.color === color) {
                safety += 10;
            }
        }

        // Penalize open files near the king
        for (let dc = -1; dc <= 1; dc++) {
            const fileC = kingC + dc;
            if (fileC < 0 || fileC > 7) continue;
            if (friendlyPawnFiles[fileC] === 0) {
                safety -= 15;
            }
        }

        return safety;
    }
}
