import { XiangqiLogic } from './game-logic.js';

// Recreate logic instance for the worker to use
// We need to sync state from main thread
const game = new XiangqiLogic();

self.onmessage = function (e) {
    const { board, depth, turn } = e.data;

    // Sync Worker Board State
    // We need to reconstruct the objects because JSON stringify/parse 
    // loses class methods if we had any on Piece, but we use plain objects for pieces in Logic.
    // However, XiangqiLogic functions expect `this.board` to be populated.
    game.board = board;
    game.turn = turn;

    // Run Minimax
    const bestMove = minimax(game, depth, -Infinity, Infinity, true, turn);

    // Return result
    self.postMessage(bestMove);
};

function minimax(game, depth, alpha, beta, isMaximizing, myColor) {
    if (depth === 0) {
        return { score: game.evaluateBoard(myColor) };
    }

    const possibleMoves = game.generateLegalMoves(isMaximizing ? myColor : (myColor === 'red' ? 'black' : 'red'));

    if (possibleMoves.length === 0) {
        return { score: isMaximizing ? -100000 : 100000 }; // No moves = lose
    }

    // Sort moves for better pruning (capture moves first?)
    // Basic sorting to prioritize captures
    possibleMoves.sort((a, b) => {
        const destA = game.board[a.to.r][a.to.c];
        const destB = game.board[b.to.r][b.to.c];
        const scoreA = destA ? 10 : 0;
        const scoreB = destB ? 10 : 0;
        return scoreB - scoreA;
    });

    let bestMove = null;

    if (isMaximizing) {
        let maxEval = -Infinity;
        for (const move of possibleMoves) {
            // Make Move
            const piece = game.board[move.from.r][move.from.c];
            const captured = game.board[move.to.r][move.to.c];

            game.board[move.from.r][move.from.c] = null;
            game.board[move.to.r][move.to.c] = piece;
            piece.row = move.to.r;
            piece.col = move.to.c;

            // Recurse
            const evalObj = minimax(game, depth - 1, alpha, beta, false, myColor);
            const evaluation = evalObj.score;

            // Undo Move
            piece.row = move.from.r;
            piece.col = move.from.c;
            game.board[move.from.r][move.from.c] = piece;
            game.board[move.to.r][move.to.c] = captured;

            if (evaluation > maxEval) {
                maxEval = evaluation;
                bestMove = move;
                bestMove.score = maxEval;
            }
            alpha = Math.max(alpha, evaluation);
            if (beta <= alpha) break;
        }
        return bestMove || { score: maxEval };
    } else {
        let minEval = Infinity;
        for (const move of possibleMoves) {
            // Make Move
            const piece = game.board[move.from.r][move.from.c];
            const captured = game.board[move.to.r][move.to.c];

            game.board[move.from.r][move.from.c] = null;
            game.board[move.to.r][move.to.c] = piece;
            piece.row = move.to.r;
            piece.col = move.to.c;

            // Recurse
            const evalObj = minimax(game, depth - 1, alpha, beta, true, myColor);
            const evaluation = evalObj.score;

            // Undo Move
            piece.row = move.from.r;
            piece.col = move.from.c;
            game.board[move.from.r][move.from.c] = piece;
            game.board[move.to.r][move.to.c] = captured;

            if (evaluation < minEval) {
                minEval = evaluation;
                bestMove = move;
                bestMove.score = minEval;
            }
            beta = Math.min(beta, evaluation);
            if (beta <= alpha) break;
        }
        return bestMove || { score: minEval };
    }
}
