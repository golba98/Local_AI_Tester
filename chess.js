// chess.js - Core Engine Logic
// =============================================================================

// ─── Piece Image URLs ────────────────────────────────────────────────────────

const PIECES = {
    w: {
        p: 'https://upload.wikimedia.org/wikipedia/commons/4/45/Chess_plt45.svg',
        r: 'https://upload.wikimedia.org/wikipedia/commons/7/72/Chess_rlt45.svg',
        n: 'https://upload.wikimedia.org/wikipedia/commons/7/70/Chess_nlt45.svg',
        b: 'https://upload.wikimedia.org/wikipedia/commons/b/b1/Chess_blt45.svg',
        q: 'https://upload.wikimedia.org/wikipedia/commons/1/15/Chess_qlt45.svg',
        k: 'https://upload.wikimedia.org/wikipedia/commons/4/42/Chess_klt45.svg'
    },
    b: {
        p: 'https://upload.wikimedia.org/wikipedia/commons/c/c7/Chess_pdt45.svg',
        r: 'https://upload.wikimedia.org/wikipedia/commons/f/ff/Chess_rdt45.svg',
        n: 'https://upload.wikimedia.org/wikipedia/commons/e/ef/Chess_ndt45.svg',
        b: 'https://upload.wikimedia.org/wikipedia/commons/9/98/Chess_bdt45.svg',
        q: 'https://upload.wikimedia.org/wikipedia/commons/4/47/Chess_qdt45.svg',
        k: 'https://upload.wikimedia.org/wikipedia/commons/f/f0/Chess_kdt45.svg'
    }
};

// ─── Movement Direction Constants ────────────────────────────────────────────

const ROOK_DIRS   = [[0, 1], [0, -1], [1, 0], [-1, 0]];
const BISHOP_DIRS = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const QUEEN_DIRS  = [...ROOK_DIRS, ...BISHOP_DIRS];

const KNIGHT_OFFSETS = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
const KING_OFFSETS   = QUEEN_DIRS; // King steps one square in every direction


// =============================================================================
// ChessEngine — board state, move generation, make/undo, game-state detection
// =============================================================================

class ChessEngine {
    constructor() {
        this.reset();
    }

    /** Resets the board and all state to a fresh game. */
    reset() {
        this.board = this.createInitialBoard();
        this.turn = 'w';
        this.history = [];        // algebraic notation strings shown in the UI
        this.moveHistory = [];    // full move records used for undo
        this.selectedSquare = null;
        this.validMoves = [];
        this.gameState = 'playing';
        this.enPassantTarget = null;
        this.castlingRights = {
            w: { k: true, q: true },
            b: { k: true, q: true }
        };
    }

    /** Returns an 8×8 array populated with pieces in their starting positions. */
    createInitialBoard() {
        const board = Array(8).fill(null).map(() => Array(8).fill(null));
        const backRank = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];

        for (let col = 0; col < 8; col++) {
            board[1][col] = { type: 'p', color: 'b' }; // Black pawns
            board[6][col] = { type: 'p', color: 'w' }; // White pawns
            board[0][col] = { type: backRank[col], color: 'b' }; // Black back rank
            board[7][col] = { type: backRank[col], color: 'w' }; // White back rank
        }

        return board;
    }

    /**
     * Returns the piece at (row, col), or null if out of bounds or empty.
     * @param {number} row
     * @param {number} col
     * @returns {{ type: string, color: string } | null}
     */
    getPiece(row, col) {
        if (row < 0 || row > 7 || col < 0 || col > 7) return null;
        return this.board[row][col];
    }

    /**
     * Returns pseudo-legal moves for the piece at (row, col).
     * Pseudo-legal moves may leave the king in check and
     * must be filtered by `getValidMoves` before use.
     *
     * @param {number}  row
     * @param {number}  col
     * @param {boolean} [ignoreTurn=false] - Skip the turn colour check (used internally).
     * @returns {[number, number][]}
     */
    getPseudoLegalMoves(row, col, ignoreTurn = false) {
        const piece = this.getPiece(row, col);
        if (!piece || (!ignoreTurn && piece.color !== this.turn)) return [];

        switch (piece.type) {
            case 'p': return this.getPawnMoves(row, col, piece.color);
            case 'r': return this.getSlidingMoves(row, col, ROOK_DIRS);
            case 'n': return this.getSteppingMoves(row, col, KNIGHT_OFFSETS);
            case 'b': return this.getSlidingMoves(row, col, BISHOP_DIRS);
            case 'q': return this.getSlidingMoves(row, col, QUEEN_DIRS);
            case 'k': {
                const moves = this.getSteppingMoves(row, col, KING_OFFSETS);
                if (!ignoreTurn) moves.push(...this.getCastlingMoves(row, col, piece.color));
                return moves;
            }
            default: return [];
        }
    }

    /**
     * Returns fully legal moves for the piece at (row, col),
     * filtered so none leave the friendly king in check.
     *
     * @param {number} row
     * @param {number} col
     * @returns {[number, number][]}
     */
    getValidMoves(row, col) {
        const piece = this.getPiece(row, col);
        if (!piece || piece.color !== this.turn) return [];

        const pseudoMoves = this.getPseudoLegalMoves(row, col);
        const legalMoves = [];

        for (const [toR, toC] of pseudoMoves) {
            this.move(row, col, toR, toC, true);
            if (!this.isInCheck(piece.color)) {
                legalMoves.push([toR, toC]);
            }
            this.undo();
        }

        return legalMoves;
    }

    /**
     * Returns all pseudo-legal moves for the given colour as `{from, to}` objects.
     * Used for attack detection and mobility scoring.
     *
     * @param {'w'|'b'} color
     * @returns {{ from: {r:number,c:number}, to: {r:number,c:number} }[]}
     */
    getAllPseudoLegalMoves(color) {
        const moves = [];
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const piece = this.getPiece(r, c);
                if (!piece || piece.color !== color) continue;
                for (const [toR, toC] of this.getPseudoLegalMoves(r, c, true)) {
                    moves.push({ from: { r, c }, to: { r: toR, c: toC } });
                }
            }
        }
        return moves;
    }

    /**
     * Returns all fully legal moves for the given colour as `{from, to}` objects.
     *
     * @param {'w'|'b'} color
     * @returns {{ from: {r:number,c:number}, to: {r:number,c:number} }[]}
     */
    getAllLegalMoves(color) {
        const moves = [];
        const originalTurn = this.turn;
        this.turn = color; // temporarily override so getValidMoves works for this colour

        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const piece = this.getPiece(r, c);
                if (!piece || piece.color !== color) continue;
                for (const [toR, toC] of this.getValidMoves(r, c)) {
                    moves.push({ from: { r, c }, to: { r: toR, c: toC } });
                }
            }
        }

        this.turn = originalTurn;
        return moves;
    }

    /**
     * Returns true if the given colour's king is currently in check.
     *
     * @param {'w'|'b'} [color=this.turn]
     * @returns {boolean}
     */
    isInCheck(color = this.turn) {
        let kingPos = null;
        outer: for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const piece = this.getPiece(r, c);
                if (piece && piece.type === 'k' && piece.color === color) {
                    kingPos = { r, c };
                    break outer;
                }
            }
        }
        if (!kingPos) return false;

        const enemyColor = color === 'w' ? 'b' : 'w';
        return this.getAllPseudoLegalMoves(enemyColor)
            .some(move => move.to.r === kingPos.r && move.to.c === kingPos.c);
    }

    /**
     * Returns true if the square at (r, c) is attacked by `attackerColor`.
     *
     * @param {number} r
     * @param {number} c
     * @param {'w'|'b'} attackerColor
     * @returns {boolean}
     */
    isSquareAttacked(r, c, attackerColor) {
        return this.getAllPseudoLegalMoves(attackerColor)
            .some(m => m.to.r === r && m.to.c === c);
    }

    /**
     * Updates `this.gameState` to 'checkmate', 'stalemate', or 'playing'
     * based on whether the current side has any legal moves.
     */
    updateGameState() {
        const legalMoves = this.getAllLegalMoves(this.turn);
        if (legalMoves.length === 0) {
            this.gameState = this.isInCheck(this.turn) ? 'checkmate' : 'stalemate';
        } else {
            this.gameState = 'playing';
        }
    }


    // ─── Move Generators ─────────────────────────────────────────────────────

    getPawnMoves(row, col, color) {
        const moves = [];
        const dir = color === 'w' ? -1 : 1;
        const startRow = color === 'w' ? 6 : 1;

        // Single step forward
        if (!this.getPiece(row + dir, col)) {
            moves.push([row + dir, col]);
            // Double step from starting rank
            if (row === startRow && !this.getPiece(row + 2 * dir, col)) {
                moves.push([row + 2 * dir, col]);
            }
        }

        // Diagonal captures (normal and en passant)
        for (const dc of [-1, 1]) {
            const targetC = col + dc;
            if (targetC < 0 || targetC > 7) continue;

            const targetR = row + dir;
            const target = this.getPiece(targetR, targetC);

            const isNormalCapture  = target && target.color !== color;
            const isEnPassant      = this.enPassantTarget &&
                                     this.enPassantTarget.r === targetR &&
                                     this.enPassantTarget.c === targetC;

            if (isNormalCapture || isEnPassant) {
                moves.push([targetR, targetC]);
            }
        }

        return moves;
    }

    getCastlingMoves(row, col, color) {
        const moves = [];
        if (this.isInCheck(color)) return moves;

        const rights    = this.castlingRights[color];
        const oppColor  = color === 'w' ? 'b' : 'w';

        // Kingside: squares between king and rook must be empty and unattacked
        if (rights.k) {
            const pathClear     = !this.getPiece(row, col + 1) && !this.getPiece(row, col + 2);
            const pathSafe      = !this.isSquareAttacked(row, col + 1, oppColor) &&
                                  !this.isSquareAttacked(row, col + 2, oppColor);
            if (pathClear && pathSafe) moves.push([row, col + 2]);
        }

        // Queenside: three squares between king and rook must be empty; transit squares unattacked
        if (rights.q) {
            const pathClear     = !this.getPiece(row, col - 1) &&
                                  !this.getPiece(row, col - 2) &&
                                  !this.getPiece(row, col - 3);
            const pathSafe      = !this.isSquareAttacked(row, col - 1, oppColor) &&
                                  !this.isSquareAttacked(row, col - 2, oppColor);
            if (pathClear && pathSafe) moves.push([row, col - 2]);
        }

        return moves;
    }

    getSlidingMoves(row, col, directions) {
        const moves = [];
        const piece = this.getPiece(row, col);

        for (const [dr, dc] of directions) {
            let r = row + dr;
            let c = col + dc;
            while (r >= 0 && r < 8 && c >= 0 && c < 8) {
                const target = this.getPiece(r, c);
                if (!target) {
                    moves.push([r, c]);
                } else {
                    if (target.color !== piece.color) moves.push([r, c]); // capture
                    break; // blocked regardless
                }
                r += dr;
                c += dc;
            }
        }

        return moves;
    }

    getSteppingMoves(row, col, offsets) {
        const moves = [];
        const piece = this.getPiece(row, col);

        for (const [dr, dc] of offsets) {
            const r = row + dr;
            const c = col + dc;
            if (r >= 0 && r < 8 && c >= 0 && c < 8) {
                const target = this.getPiece(r, c);
                if (!target || target.color !== piece.color) {
                    moves.push([r, c]);
                }
            }
        }

        return moves;
    }


    // ─── Make / Undo ─────────────────────────────────────────────────────────

    /**
     * Executes a move on the board, updating all engine state.
     *
     * @param {number}  fromR
     * @param {number}  fromC
     * @param {number}  toR
     * @param {number}  toC
     * @param {boolean} [isTest=false] - When true, skips notation and game-state updates.
     * @returns {true}
     */
    move(fromR, fromC, toR, toC, isTest = false) {
        const piece  = this.board[fromR][fromC];
        const target = this.board[toR][toC];

        const record = {
            from:                   { r: fromR, c: fromC },
            to:                     { r: toR,   c: toC   },
            piece:                  { ...piece },
            target:                 target ? { ...target } : null,
            enPassantTargetBefore:  this.enPassantTarget ? { ...this.enPassantTarget } : null,
            castlingRightsBefore:   JSON.parse(JSON.stringify(this.castlingRights)),
            isEnPassantCapture:     false,
            isCastling:             false,
            promoted:               false,
            notation:               ''
        };

        // ── En Passant capture ───────────────────────────────────────────────
        if (piece.type === 'p' && target === null && fromC !== toC) {
            record.isEnPassantCapture = true;
            record.target = { ...this.board[fromR][toC] };
            this.board[fromR][toC] = null; // remove the captured pawn
        }

        // ── Castling — move the rook ─────────────────────────────────────────
        if (piece.type === 'k' && Math.abs(fromC - toC) === 2) {
            record.isCastling = true;
            if (toC > fromC) { // Kingside
                this.board[fromR][toC - 1] = this.board[fromR][7];
                this.board[fromR][7] = null;
            } else {           // Queenside
                this.board[fromR][toC + 1] = this.board[fromR][0];
                this.board[fromR][0] = null;
            }
        }

        // ── Standard piece placement ─────────────────────────────────────────
        this.board[toR][toC]     = piece;
        this.board[fromR][fromC] = null;

        // ── Promotion ────────────────────────────────────────────────────────
        if (piece.type === 'p' && (toR === 0 || toR === 7)) {
            piece.type = 'q';
            record.promoted = true;
        }

        // ── Update en passant target ─────────────────────────────────────────
        this.enPassantTarget = (piece.type === 'p' && Math.abs(fromR - toR) === 2)
            ? { r: (fromR + toR) / 2, c: fromC }
            : null;

        // ── Update castling rights ───────────────────────────────────────────
        if (piece.type === 'k') {
            this.castlingRights[piece.color].k = false;
            this.castlingRights[piece.color].q = false;
        } else if (piece.type === 'r') {
            if (fromC === 0) this.castlingRights[piece.color].q = false;
            if (fromC === 7) this.castlingRights[piece.color].k = false;
        }
        // Capturing an opponent's rook also removes their castling right
        if (target && target.type === 'r') {
            if (toC === 0) this.castlingRights[target.color].q = false;
            if (toC === 7) this.castlingRights[target.color].k = false;
        }

        // ── Notation + history (skipped during AI search) ───────────────────
        if (!isTest) {
            let notation = this.getNotation(fromR, fromC) +
                           (target || record.isEnPassantCapture ? 'x' : '-') +
                           this.getNotation(toR, toC);
            if (record.promoted)  notation += '=Q';
            if (record.isCastling) notation = toC > fromC ? 'O-O' : 'O-O-O';
            record.notation = notation;
            this.history.push(notation);
        }

        this.moveHistory.push(record);
        this.turn = this.turn === 'w' ? 'b' : 'w';

        if (!isTest) this.updateGameState();

        return true;
    }

    /**
     * Reverts the most recent move, restoring the full board state.
     *
     * @returns {boolean} false if there is nothing to undo.
     */
    undo() {
        if (this.moveHistory.length === 0) return false;

        const record = this.moveHistory.pop();
        if (record.notation !== '') this.history.pop();

        this.turn = this.turn === 'w' ? 'b' : 'w';

        const piece = this.board[record.to.r][record.to.c];
        if (record.promoted) piece.type = 'p'; // unpromote

        // Restore the moving piece to its origin square
        this.board[record.from.r][record.from.c] = piece;
        this.board[record.to.r][record.to.c]     = null;

        // Restore captured piece
        if (record.isEnPassantCapture) {
            this.board[record.from.r][record.to.c] = record.target;
        } else if (record.target) {
            this.board[record.to.r][record.to.c] = record.target;
        }

        // Restore castling rook
        if (record.isCastling) {
            if (record.to.c > record.from.c) { // Kingside
                this.board[record.from.r][7]                    = this.board[record.from.r][record.to.c - 1];
                this.board[record.from.r][record.to.c - 1]      = null;
            } else {                           // Queenside
                this.board[record.from.r][0]                    = this.board[record.from.r][record.to.c + 1];
                this.board[record.from.r][record.to.c + 1]      = null;
            }
        }

        this.enPassantTarget = record.enPassantTargetBefore;
        this.castlingRights  = record.castlingRightsBefore;

        return true;
    }


    // ─── Helpers ─────────────────────────────────────────────────────────────

    /**
     * Converts (row, col) to algebraic notation, e.g. (7, 0) → 'a1'.
     *
     * @param {number} row
     * @param {number} col
     * @returns {string}
     */
    getNotation(row, col) {
        return 'abcdefgh'[col] + (8 - row);
    }
}