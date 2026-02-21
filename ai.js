// ai.js - Simple Chess AI

class ChessAI {
    constructor(engine) {
        this.engine = engine;
        this.difficulty = 'medium'; // easy, medium, hard
        this.pieceValues = {
            p: 10,
            n: 30,
            b: 30,
            r: 50,
            q: 90,
            k: 900
        };
        // Simple position tables to encourage center control
        this.pawnTable = [
            [0, 0, 0, 0, 0, 0, 0, 0],
            [5, 5, 5, 5, 5, 5, 5, 5],
            [1, 1, 2, 3, 3, 2, 1, 1],
            [0.5, 0.5, 1, 2.5, 2.5, 1, 0.5, 0.5],
            [0, 0, 0, 2, 2, 0, 0, 0],
            [0.5, -0.5, -1, 0, 0, -1, -0.5, 0.5],
            [0.5, 1, 1, -2, -2, 1, 1, 0.5],
            [0, 0, 0, 0, 0, 0, 0, 0]
        ];
        this.knightTable = [
            [-5, -4, -3, -3, -3, -3, -4, -5],
            [-4, -2, 0, 0, 0, 0, -2, -4],
            [-3, 0, 1, 1.5, 1.5, 1, 0, -3],
            [-3, 0.5, 1.5, 2, 2, 1.5, 0.5, -3],
            [-3, 0, 1.5, 2, 2, 1.5, 0, -3],
            [-3, 0.5, 1, 1.5, 1.5, 1, 0.5, -3],
            [-4, -2, 0, 0.5, 0.5, 0, -2, -4],
            [-5, -4, -3, -3, -3, -3, -4, -5]
        ];
    }

    getBestMove() {
        const moves = this.engine.getAllLegalMoves(this.engine.turn);

        if (moves.length === 0) return null;

        // Difficulty Settings
        let depth = 2;
        let blunderChance = 0;

        if (this.difficulty === 'easy') {
            depth = 1;
            blunderChance = 0.3;
        } else if (this.difficulty === 'medium') {
            depth = 2;
            blunderChance = 0.1;
        } else if (this.difficulty === 'hard') {
            depth = 3;
            blunderChance = 0;
        }

        // Random move for difficulty
        if (Math.random() < blunderChance) {
            return moves[Math.floor(Math.random() * moves.length)];
        }

        let bestMove = null;
        let bestValue = -Infinity;

        const color = this.engine.turn;

        moves.sort(() => Math.random() - 0.5);

        for (const move of moves) {
            // Execute Move
            const piece = this.engine.board[move.from.r][move.from.c];
            const captured = this.engine.board[move.to.r][move.to.c];

            this.engine.board[move.to.r][move.to.c] = piece;
            this.engine.board[move.from.r][move.from.c] = null;

            // Handle simple promotion for evaluation (assume Queen)
            const wasPawn = piece.type === 'p';
            const promoted = wasPawn && (move.to.r === 0 || move.to.r === 7);

            if (promoted) piece.type = 'q';

            const boardValue = -this.minimax(depth - 1, -Infinity, Infinity, false, color);

            // Undo Move
            if (promoted) piece.type = 'p';

            this.engine.board[move.from.r][move.from.c] = piece;
            this.engine.board[move.to.r][move.to.c] = captured;

            if (boardValue > bestValue) {
                bestValue = boardValue;
                bestMove = move;
            }
        }
        return bestMove;
    }

    minimax(depth, alpha, beta, isMaximizing, playerColor) {
        if (depth === 0) {
            return this.evaluateBoard(playerColor);
        }

        const moves = this.engine.getAllLegalMoves(isMaximizing ? playerColor : (playerColor === 'w' ? 'b' : 'w'));

        if (moves.length === 0) {
            return this.evaluateBoard(playerColor); // Should handle checkmate/stalemate here ideally
        }

        if (isMaximizing) {
            let maxEval = -Infinity;
            for (const move of moves) {

                const piece = this.engine.board[move.from.r][move.from.c];
                const captured = this.engine.board[move.to.r][move.to.c];

                this.engine.board[move.to.r][move.to.c] = piece;
                this.engine.board[move.from.r][move.from.c] = null;

                const wasPawn = piece.type === 'p';
                const promoted = wasPawn && (move.to.r === 0 || move.to.r === 7);

                if (promoted) piece.type = 'q';

                const evalVal = this.minimax(depth - 1, alpha, beta, false, playerColor);

                if (promoted) piece.type = 'p';

                this.engine.board[move.from.r][move.from.c] = piece;
                this.engine.board[move.to.r][move.to.c] = captured;

                maxEval = Math.max(maxEval, evalVal);
                alpha = Math.max(alpha, evalVal);
                if (beta <= alpha) break;
            }
            return maxEval;
        } else {
            let minEval = Infinity;
            const oppColor = playerColor === 'w' ? 'b' : 'w';
            for (const move of moves) {
                const piece = this.engine.board[move.from.r][move.from.c];
                const captured = this.engine.board[move.to.r][move.to.c];
                this.engine.board[move.to.r][move.to.c] = piece;
                this.engine.board[move.from.r][move.from.c] = null;
                const wasPawn = piece.type === 'p';
                const promoted = wasPawn && (move.to.r === 0 || move.to.r === 7);
                if (promoted) piece.type = 'q';

                const evalVal = this.minimax(depth - 1, alpha, beta, true, playerColor);

                if (promoted) piece.type = 'p';
                this.engine.board[move.from.r][move.from.c] = piece;
                this.engine.board[move.to.r][move.to.c] = captured;

                minEval = Math.min(minEval, evalVal);
                beta = Math.min(beta, evalVal);
                if (beta <= alpha) break;
            }
            return minEval;
        }
    }

    evaluateBoard(color) {
        let score = 0;
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const piece = this.engine.board[r][c];
                if (piece) {
                    let value = this.pieceValues[piece.type];

                    // Add position bonus
                    if (piece.type === 'p') {
                        value += (piece.color === 'w' ? this.pawnTable[r][c] : this.pawnTable[7 - r][c]);
                    } else if (piece.type === 'n') {
                        value += (piece.color === 'w' ? this.knightTable[r][c] : this.knightTable[7 - r][c]);
                    }

                    if (piece.color === color) {
                        score += value;
                    } else {
                        score -= value;
                    }
                }
            }
        }
        return score;
    }
}
