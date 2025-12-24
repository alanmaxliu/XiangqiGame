/**
 * Xiangqi Game Logic - Shared Module
 */

export const BOARD_ROWS = 10;
export const BOARD_COLS = 9;

export const PIECES = {
    RED: {
        KING: '帥', ADVISOR: '仕', ELEPHANT: '相', HORSE: '俥',
        ROOK: '車', CANNON: '炮', PAWN: '兵'
    },
    BLACK: {
        KING: '將', ADVISOR: '士', ELEPHANT: '象', HORSE: '馬',
        ROOK: '車', CANNON: '包', PAWN: '卒'
    }
};

// Piece Weights for Evaluation (Simple material + position implementation later)
const PIECE_VALUES = {
    'king': 10000,
    'rook': 90,
    'horse': 40,
    'cannon': 45,
    'elephant': 20,
    'advisor': 20,
    'pawn': 10
};

export class XiangqiLogic {
    constructor() {
        this.board = []; // 10x9 grid
        this.turn = 'red'; // red or black
        this.gameOver = false;
        this.initBoard();
    }

    initBoard() {
        // Initialize empty board
        this.board = Array(10).fill(null).map(() => Array(9).fill(null));

        // Black Pieces (Top, rows 0-4)
        const b = 'black';
        this.placePiece(0, 0, b, 'rook', '車');
        this.placePiece(0, 1, b, 'horse', '馬');
        this.placePiece(0, 2, b, 'elephant', '象');
        this.placePiece(0, 3, b, 'advisor', '士');
        this.placePiece(0, 4, b, 'king', '將');
        this.placePiece(0, 5, b, 'advisor', '士');
        this.placePiece(0, 6, b, 'elephant', '象');
        this.placePiece(0, 7, b, 'horse', '馬');
        this.placePiece(0, 8, b, 'rook', '車');

        this.placePiece(2, 1, b, 'cannon', '包');
        this.placePiece(2, 7, b, 'cannon', '包');

        this.placePiece(3, 0, b, 'pawn', '卒');
        this.placePiece(3, 2, b, 'pawn', '卒');
        this.placePiece(3, 4, b, 'pawn', '卒');
        this.placePiece(3, 6, b, 'pawn', '卒');
        this.placePiece(3, 8, b, 'pawn', '卒');

        // Red Pieces (Bottom, rows 5-9)
        const r = 'red';
        this.placePiece(9, 0, r, 'rook', '俥');
        this.placePiece(9, 1, r, 'horse', '馬');
        this.placePiece(9, 2, r, 'elephant', '相');
        this.placePiece(9, 3, r, 'advisor', '仕');
        this.placePiece(9, 4, r, 'king', '帥');
        this.placePiece(9, 5, r, 'advisor', '仕');
        this.placePiece(9, 6, r, 'elephant', '相');
        this.placePiece(9, 7, r, 'horse', '馬');
        this.placePiece(9, 8, r, 'rook', '俥');

        this.placePiece(7, 1, r, 'cannon', '炮');
        this.placePiece(7, 7, r, 'cannon', '炮');

        this.placePiece(6, 0, r, 'pawn', '兵');
        this.placePiece(6, 2, r, 'pawn', '兵');
        this.placePiece(6, 4, r, 'pawn', '兵');
        this.placePiece(6, 6, r, 'pawn', '兵');
        this.placePiece(6, 8, r, 'pawn', '兵');
    }

    placePiece(row, col, color, type, text) {
        this.board[row][col] = {
            color: color,
            type: type,
            text: text,
            row: row,
            col: col,
            key: `${color}_${type}_${row}_${col}`
        };
    }

    // Helper to deep clone board state (for AI simulation)
    // Or we provide make/undo within the class

    isValidMove(piece, targetR, targetC) {
        if (!piece) return false;
        // 1. Basic check: Cannot move to same spot
        if (piece.row === targetR && piece.col === targetC) return false;

        // 2. Basic check: Cannot capture own piece
        const target = this.board[targetR][targetC];
        if (target && target.color === piece.color) return false;

        // 3. Specific Piece Logic
        const dr = targetR - piece.row;
        const dc = targetC - piece.col;
        const absDr = Math.abs(dr);
        const absDc = Math.abs(dc);

        switch (piece.type) {
            case 'king': // 將/帥
                if (!((absDr === 1 && absDc === 0) || (absDr === 0 && absDc === 1))) return false;
                if (!this.isInPalace(targetR, targetC, piece.color)) return false;
                return true;

            case 'advisor': // 仕/士
                if (absDr !== 1 || absDc !== 1) return false;
                if (!this.isInPalace(targetR, targetC, piece.color)) return false;
                return true;

            case 'elephant': // 相/象
                if (absDr !== 2 || absDc !== 2) return false;
                if (piece.color === 'red' && targetR < 5) return false;
                if (piece.color === 'black' && targetR > 4) return false;
                // Blocked Eye
                const eyeR = piece.row + dr / 2;
                const eyeC = piece.col + dc / 2;
                if (this.board[eyeR][eyeC]) return false;
                return true;

            case 'horse': // 馬
                if (!((absDr === 2 && absDc === 1) || (absDr === 1 && absDc === 2))) return false;
                // Blocked Leg
                if (absDr === 2) {
                    const legR = piece.row + (dr > 0 ? 1 : -1);
                    if (this.board[legR][piece.col]) return false;
                } else {
                    const legC = piece.col + (dc > 0 ? 1 : -1);
                    if (this.board[piece.row][legC]) return false;
                }
                return true;

            case 'rook': // 車
                if (absDr > 0 && absDc > 0) return false;
                return this.countObstacles(piece.row, piece.col, targetR, targetC) === 0;

            case 'cannon': // 炮/包
                if (absDr > 0 && absDc > 0) return false;
                const obstacles = this.countObstacles(piece.row, piece.col, targetR, targetC);
                if (!target) {
                    return obstacles === 0;
                }
                return obstacles === 1;

            case 'pawn': // 兵/卒
                if (absDr + absDc !== 1) return false;
                if (piece.color === 'red') {
                    if (targetR > piece.row) return false;
                    if (piece.row >= 5 && piece.row === targetR) return false;
                } else {
                    if (targetR < piece.row) return false;
                    if (piece.row <= 4 && piece.row === targetR) return false;
                }
                return true;
        }
        return false;
    }

    isInPalace(r, c, color) {
        if (c < 3 || c > 5) return false;
        if (color === 'red') {
            return r >= 7 && r <= 9;
        } else {
            return r >= 0 && r <= 2;
        }
    }

    countObstacles(r1, c1, r2, c2) {
        let count = 0;
        if (r1 === r2) { // Horizontal
            const start = Math.min(c1, c2) + 1;
            const end = Math.max(c1, c2);
            for (let c = start; c < end; c++) {
                if (this.board[r1][c]) count++;
            }
        } else if (c1 === c2) { // Vertical
            const start = Math.min(r1, r2) + 1;
            const end = Math.max(r1, r2);
            for (let r = start; r < end; r++) {
                if (this.board[r][c1]) count++;
            }
        }
        return count;
    }

    kingsFacing() {
        let rK = null, bK = null;
        for (let r = 0; r < BOARD_ROWS; r++) {
            for (let c = 3; c <= 5; c++) {
                const p = this.board[r][c];
                if (p && p.type === 'king') {
                    if (p.color === 'red') rK = { r, c };
                    else bK = { r, c };
                }
            }
        }
        if (rK && bK && rK.c === bK.c) {
            const obstacles = this.countObstacles(rK.r, rK.c, bK.r, bK.c);
            if (obstacles === 0) return true;
        }
        return false;
    }

    // AI Helper: Generate all pseudo-legal moves (including checking flying general)
    generateLegalMoves(color) {
        const moves = [];
        for (let r = 0; r < BOARD_ROWS; r++) {
            for (let c = 0; c < BOARD_COLS; c++) {
                const p = this.board[r][c];
                if (p && p.color === color) {
                    // Try all possible destinations. Optimization: iterate only relevant squares?
                    // For simplicity, we verify isValidMove against entire board or logical targets.
                    // Better: define move offsets per piece type.
                    this.getPossibleDestinations(p).forEach(dest => {
                        const [tgtR, tgtC] = dest;
                        if (this.isValidMove(p, tgtR, tgtC)) {
                            // Simulation Check for Flying General
                            const captured = this.board[tgtR][tgtC];

                            // Mutate
                            this.board[p.row][p.col] = null;
                            this.board[tgtR][tgtC] = p;
                            const oldR = p.row, oldC = p.col;
                            p.row = tgtR; p.col = tgtC;

                            if (!this.kingsFacing()) {
                                moves.push({
                                    from: { r: oldR, c: oldC },
                                    to: { r: tgtR, c: tgtC },
                                    score: 0 // For ordering
                                });
                            }

                            // Revert
                            p.row = oldR; p.col = oldC;
                            this.board[oldR][oldC] = p;
                            this.board[tgtR][tgtC] = captured;
                        }
                    });
                }
            }
        }
        return moves;
    }

    // Helper to get potential targets to reduce iteration count
    getPossibleDestinations(piece) {
        const dests = [];
        const r = piece.row;
        const c = piece.col;

        switch (piece.type) {
            case 'king':
            case 'advisor':
                // 3x3 Palace area approx
                for (let i = r - 1; i <= r + 1; i++) {
                    for (let j = c - 1; j <= c + 1; j++) {
                        if (i >= 0 && i < BOARD_ROWS && j >= 0 && j < BOARD_COLS) dests.push([i, j]);
                    }
                }
                break;
            case 'elephant':
                [[r - 2, c - 2], [r - 2, c + 2], [r + 2, c - 2], [r + 2, c + 2]].forEach(d => {
                    if (d[0] >= 0 && d[0] < BOARD_ROWS && d[1] >= 0 && d[1] < BOARD_COLS) dests.push(d);
                });
                break;
            case 'horse':
                [[r - 2, c - 1], [r - 2, c + 1], [r + 2, c - 1], [r + 2, c + 1],
                [r - 1, c - 2], [r - 1, c + 2], [r + 1, c - 2], [r + 1, c + 2]].forEach(d => {
                    if (d[0] >= 0 && d[0] < BOARD_ROWS && d[1] >= 0 && d[1] < BOARD_COLS) dests.push(d);
                });
                break;
            case 'pawn':
                [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]].forEach(d => {
                    if (d[0] >= 0 && d[0] < BOARD_ROWS && d[1] >= 0 && d[1] < BOARD_COLS) dests.push(d);
                });
                break;
            case 'rook':
            case 'cannon':
                // Orthogonal lines
                for (let i = 0; i < BOARD_ROWS; i++) if (i !== r) dests.push([i, c]);
                for (let j = 0; j < BOARD_COLS; j++) if (j !== c) dests.push([r, j]);
                break;
        }
        return dests;
    }

    // Evaluation Function
    evaluateBoard(color) {
        let score = 0;
        for (let r = 0; r < BOARD_ROWS; r++) {
            for (let c = 0; c < BOARD_COLS; c++) {
                const p = this.board[r][c];
                if (p) {
                    let val = PIECE_VALUES[p.type] || 10;
                    // Position Bonus (Simplified)
                    // Pawn over river bonus
                    if (p.type === 'pawn') {
                        if (p.color === 'red' && r < 5) val += 10; // Red pawn crossed river
                        if (p.color === 'black' && r > 4) val += 10;
                        // Closer to general bonus?
                    }

                    if (p.color === color) score += val;
                    else score -= val;
                }
            }
        }
        return score;
    }
}
