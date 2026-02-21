// chess.js - Core Engine Logic

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

class ChessEngine {
    constructor() {
        this.reset();
    }

    reset() {
        this.board = this.createInitialBoard();
        this.turn = 'w';
        this.history = [];
        this.selectedSquare = null;
        this.validMoves = [];
        this.gameState = 'playing';
        
    }

    createInitialBoard() {
        const board = Array(8).fill(null).map(() => Array(8).fill(null));
        const layout = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];

        // Pawns
        for (let i = 0; i < 8; i++) {
            board[1][i] = { type: 'p', color: 'b' };
            board[6][i] = { type: 'p', color: 'w' };
        }

        // Main pieces
        for (let i = 0; i < 8; i++) {
            board[0][i] = { type: layout[i], color: 'b' };
            board[7][i] = { type: layout[i], color: 'w' };
        }

        return board;
    }

    getPiece(row, col) {
        if (row < 0 || row > 7 || col < 0 || col > 7) return null;
        return this.board[row][col];
    }

    getValidMoves(row, col, ignoreTurn = false) {
        const piece = this.getPiece(row, col);
        if (!piece || (!ignoreTurn && piece.color !== this.turn)) return [];

        let moves = [];
        switch (piece.type) {
            case 'p': moves = this.getPawnMoves(row, col, piece.color); break;
            case 'r': moves = this.getSlidingMoves(row, col, [[0, 1], [0, -1], [1, 0], [-1, 0]]); break;
            case 'n': moves = this.getSteppingMoves(row, col, [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]]); break;
            case 'b': moves = this.getSlidingMoves(row, col, [[1, 1], [1, -1], [-1, 1], [-1, -1]]); break;
            case 'q': moves = this.getSlidingMoves(row, col, [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]]); break;
            case 'k': moves = this.getSteppingMoves(row, col, [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]]); break;
        }

        // Filter moves that put king in check (simplified for now)
        return moves;
    }

    getAllLegalMoves(color) {
        const moves = [];
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const piece = this.getPiece(r, c);
                if (!piece || piece.color !== color) continue;
                const pieceMoves = this.getValidMoves(r, c, true);
                for (const [toR, toC] of pieceMoves) {
                    moves.push({ from: { r, c }, to: { r: toR, c: toC } });
                }
            }
        }
        return moves;
    }

    isInCheck(color = this.turn) {
        let kingPos = null;
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const piece = this.getPiece(r, c);
                if (piece && piece.type === 'k' && piece.color === color) {
                    kingPos = { r, c };
                    break;
                }
            }
            if (kingPos) break;
        }
        if (!kingPos) return false;

        const enemyColor = color === 'w' ? 'b' : 'w';
        const enemyMoves = this.getAllLegalMoves(enemyColor);
        return enemyMoves.some(move => move.to.r === kingPos.r && move.to.c === kingPos.c);
    }

    updateGameState() {
        const legalMoves = this.getAllLegalMoves(this.turn);
        if (legalMoves.length === 0) {
            this.gameState = this.isInCheck(this.turn) ? 'checkmate' : 'stalemate';
            return;
        }
        this.gameState = 'playing';
    }

    getPawnMoves(row, col, color) {
        const moves = [];
        const dir = color === 'w' ? -1 : 1;
        const startRow = color === 'w' ? 6 : 1;

        // Forward
        if (!this.getPiece(row + dir, col)) {
            moves.push([row + dir, col]);
            if (row === startRow && !this.getPiece(row + 2 * dir, col)) {
                moves.push([row + 2 * dir, col]);
            }
        }

        // Captures
        for (let dc of [-1, 1]) {
            const target = this.getPiece(row + dir, col + dc);
            if (target && target.color !== color) {
                moves.push([row + dir, col + dc]);
            }
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
                    if (target.color !== piece.color) moves.push([r, c]);
                    break;
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

    move(fromR, fromC, toR, toC) {
        const piece = this.board[fromR][fromC];
        const target = this.board[toR][toC];
        
        this.board[toR][toC] = piece;
        this.board[fromR][fromC] = null;
        
        const moveStr = `${this.getNotation(fromR, fromC)} → ${this.getNotation(toR, toC)}`;
        this.history.push(moveStr);
        
        this.turn = this.turn === 'w' ? 'b' : 'w';
        this.updateGameState();
        return true;
    }

    getNotation(row, col) {
        const files = 'abcdefgh';
        return files[col] + (8 - row);
    }
}