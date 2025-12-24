/**
 * 象棋遊戲主程式 (Xiangqi Game - Final Version)
 * 包含：遊戲邏輯 (Logic)、AI 運算 (Worker)、音效管理 (Sound)、UI 控制 (App)
 * 作者：劉建良 @ 2025
 */

// ==========================================
// 第一部分：音效引擎 (Audio Engine)
// ==========================================
// 使用 Web Audio API 合成音效，無需外部檔案，保持單檔執行優勢。
class SoundManager {
    constructor() {
        this.enabled = true; // 靜音開關
        this.ctx = null;
    }

    // 初始化音訊環境 (需在使用者互動後呼叫)
    init() {
        if (!this.ctx) {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            this.ctx = new AudioContext();
        }
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    // 播放單一音頻
    playTone(freq, type, duration, vol = 0.5) {
        if (!this.enabled || !this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
        gain.gain.setValueAtTime(vol, this.ctx.currentTime);
        // 音量漸弱，模擬敲擊感
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(this.ctx.currentTime + duration);
    }

    // 落子音效 (清脆短促)
    playMove() {
        if (!this.enabled) return;
        this.init();
        this.playTone(800, 'square', 0.1, 0.2);
    }

    // 吃子音效 (沉重打擊)
    playCapture() {
        if (!this.enabled) return;
        this.init();
        this.playTone(150, 'sawtooth', 0.2, 0.4);
        setTimeout(() => this.playTone(100, 'sine', 0.3, 0.4), 50);
    }

    // 將軍音效 (警示音)
    playCheck() {
        if (!this.enabled) return;
        this.init();
        this.playTone(600, 'sine', 0.3, 0.3);
        setTimeout(() => this.playTone(500, 'sine', 0.3, 0.3), 150);
    }

    // 獲勝音效 (勝利號角)
    playWin() {
        if (!this.enabled) return;
        this.init();
        [440, 554, 659, 880].forEach((f, i) => setTimeout(() => this.playTone(f, 'square', 0.3, 0.3), i * 150));
    }
}

const soundManager = new SoundManager();

// ==========================================
// 第二部分：遊戲邏輯與 AI 數據 (Game Logic & AI Data)
// ==========================================

const BOARD_ROWS = 10;
const BOARD_COLS = 9;

// 棋子基礎價值 (Base Piece Values)
const PIECE_VALUES = {
    'king': 10000,
    'rook': 900,
    'horse': 400,
    'cannon': 450,
    'elephant': 200,
    'advisor': 200,
    'pawn': 100
};

// 位置價值表 (Position Strategic Tables, PST)
// 定義紅方 (下方) 的最佳位置。黑方 (上方) 讀取時會自動鏡像翻轉。
// 陣列對應：PST[piece][row][col]，其中 row 0 是棋盤最上方 (黑方底線), row 9 是最下方 (紅方底線)
const PST = {
    // 兵 (Pawn): 過河後價值提高，靠近九宮格價值提高
    'pawn': [
        [0, 0, 0, 0, 0, 0, 0, 0, 0],         // Row 0 (未過河無法到達) -> 修正：其實是到底線了
        [0, 3, 6, 9, 6, 9, 6, 3, 0],         // Row 0 (黑底線)
        [18, 36, 54, 72, 81, 72, 54, 36, 18],
        [14, 26, 42, 60, 80, 60, 42, 26, 14],
        [10, 20, 30, 40, 50, 40, 30, 20, 10], // Row 3 (黑宮頂)
        [6, 12, 18, 18, 20, 18, 18, 12, 6],   // Row 4 (河界)
        [0, 0, 0, 0, 0, 0, 0, 0, 0],          // Row 5 (紅河界 - 未過河)
        [0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0]           // Row 9 (紅底線)
    ],
    // 車 (Rook): 佔領肋道、巡河、底線
    'rook': [
        [10, 10, 10, 10, 10, 10, 10, 10, 10],
        [10, 20, 20, 20, 20, 20, 20, 20, 10],
        [5, 10, 20, 30, 30, 30, 20, 10, 5],
        [5, 10, 15, 20, 20, 20, 15, 10, 5],
        [5, 10, 15, 20, 20, 20, 15, 10, 5],
        [5, 10, 15, 20, 20, 20, 15, 10, 5],
        [5, 10, 20, 30, 30, 30, 20, 10, 5], // 巡河
        [10, 20, 20, 20, 20, 20, 20, 20, 10],
        [0, 15, 10, 10, 10, 10, 10, 15, 0],
        [5, 15, 10, 10, 10, 10, 10, 15, 5]  // 底線
    ],
    // 馬 (Horse): 盤頭馬、臥槽馬價值高，邊馬價值低
    'horse': [
        [0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 20, 40, 30, 20, 30, 40, 20, 0],
        [5, 20, 30, 40, 50, 40, 30, 20, 5], // 臥槽
        [5, 10, 15, 30, 20, 30, 15, 10, 5],
        [5, 10, 15, 20, 20, 20, 15, 10, 5],
        [5, 10, 15, 20, 20, 20, 15, 10, 5],
        [5, 20, 10, 40, 10, 40, 10, 20, 5],
        [5, 20, 10, 20, 10, 20, 10, 20, 5],
        [0, 5, 5, 5, 5, 5, 5, 5, 0],
        [0, -5, 0, 0, 0, 0, 0, -5, 0]
    ],
    // 炮 (Cannon): 巡河炮、當頭炮
    'cannon': [
        [0, 0, 5, 10, 10, 10, 5, 0, 0],
        [0, 5, 10, 15, 20, 15, 10, 5, 0], // 沉底
        [0, 5, 10, 20, 40, 20, 10, 5, 0], // 
        [0, 0, 5, 10, 20, 10, 5, 0, 0],
        [0, 5, 5, 10, 20, 10, 5, 5, 0],
        [-2, 5, 20, 5, 10, 5, 20, 5, -2], // 巡河
        [0, 0, 5, 10, 15, 10, 5, 0, 0],
        [0, 0, 10, 20, 30, 20, 10, 0, 0], // 當頭
        [0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0]
    ],
    // 士象將 (簡化): 給予少量移動獎勵或維持陣型建議
    'king': [], 'advisor': [], 'elephant': []
};

class XiangqiLogic {
    constructor() {
        this.board = [];
        this.turn = 'red';
        this.gameOver = false;
        this.initBoard();
    }

    // 初始化棋盤
    initBoard() {
        this.board = Array(10).fill(null).map(() => Array(9).fill(null));
        const b = 'black';
        this.placePiece(0, 0, b, 'rook', '車'); this.placePiece(0, 1, b, 'horse', '馬');
        this.placePiece(0, 2, b, 'elephant', '象'); this.placePiece(0, 3, b, 'advisor', '士');
        this.placePiece(0, 4, b, 'king', '將'); this.placePiece(0, 5, b, 'advisor', '士');
        this.placePiece(0, 6, b, 'elephant', '象'); this.placePiece(0, 7, b, 'horse', '馬');
        this.placePiece(0, 8, b, 'rook', '車');
        this.placePiece(2, 1, b, 'cannon', '包'); this.placePiece(2, 7, b, 'cannon', '包');
        [0, 2, 4, 6, 8].forEach(c => this.placePiece(3, c, b, 'pawn', '卒'));

        const r = 'red';
        this.placePiece(9, 0, r, 'rook', '俥'); this.placePiece(9, 1, r, 'horse', '馬');
        this.placePiece(9, 2, r, 'elephant', '相'); this.placePiece(9, 3, r, 'advisor', '仕');
        this.placePiece(9, 4, r, 'king', '帥'); this.placePiece(9, 5, r, 'advisor', '仕');
        this.placePiece(9, 6, r, 'elephant', '相'); this.placePiece(9, 7, r, 'horse', '馬');
        this.placePiece(9, 8, r, 'rook', '俥');
        this.placePiece(7, 1, r, 'cannon', '炮'); this.placePiece(7, 7, r, 'cannon', '炮');
        [0, 2, 4, 6, 8].forEach(c => this.placePiece(6, c, r, 'pawn', '兵'));
    }

    placePiece(row, col, color, type, text) {
        this.board[row][col] = { color, type, text, row, col, key: `${color}_${type}_${row}_${col}` };
    }

    cloneBoard() {
        return this.board.map(row => row.map(p => p ? { ...p } : null));
    }

    // 驗證移動是否合法
    isValidMove(piece, targetR, targetC) {
        if (!piece) return false;
        if (piece.row === targetR && piece.col === targetC) return false;
        const target = this.board[targetR][targetC];
        if (target && target.color === piece.color) return false; // 不能吃自己人

        const dr = targetR - piece.row;
        const dc = targetC - piece.col;
        const absDr = Math.abs(dr);
        const absDc = Math.abs(dc);

        switch (piece.type) {
            case 'king': // 將/帥: 走直線，不出九宮
                if (!((absDr === 1 && absDc === 0) || (absDr === 0 && absDc === 1))) return false;
                if (!this.isInPalace(targetR, targetC, piece.color)) return false;
                return true;
            case 'advisor': // 士/仕: 走斜線，不出九宮
                if (absDr !== 1 || absDc !== 1) return false;
                if (!this.isInPalace(targetR, targetC, piece.color)) return false;
                return true;
            case 'elephant': // 象/相: 走田字，不過河，塞象眼
                if (absDr !== 2 || absDc !== 2) return false;
                if (piece.color === 'red' && targetR < 5) return false;
                if (piece.color === 'black' && targetR > 4) return false;
                const eyeR = piece.row + dr / 2;
                const eyeC = piece.col + dc / 2;
                if (this.board[eyeR][eyeC]) return false; // 塞象眼
                return true;
            case 'horse': // 馬: 走日字，拐馬腳
                if (!((absDr === 2 && absDc === 1) || (absDr === 1 && absDc === 2))) return false;
                if (absDr === 2) {
                    if (this.board[piece.row + (dr > 0 ? 1 : -1)][piece.col]) return false; // 拐馬腳 (縱向)
                } else {
                    if (this.board[piece.row][piece.col + (dc > 0 ? 1 : -1)]) return false; // 拐馬腳 (橫向)
                }
                return true;
            case 'rook': // 車: 走直線，無阻礙
                if (absDr > 0 && absDc > 0) return false;
                return this.countObstacles(piece.row, piece.col, targetR, targetC) === 0;
            case 'cannon': // 炮: 走直線，吃子需架炮 (隔一子)
                if (absDr > 0 && absDc > 0) return false;
                const obstacles = this.countObstacles(piece.row, piece.col, targetR, targetC);
                if (!target) return obstacles === 0; // 移動
                return obstacles === 1; // 吃子
            case 'pawn': // 兵/卒: 過河前只能直走，過河後可橫走，不可後退
                if (absDr + absDc !== 1) return false;
                if (piece.color === 'red') {
                    if (targetR > piece.row) return false; // 不可後退
                    if (piece.row >= 5 && piece.row === targetR) return false; // 未過河不可橫走
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
        if (color === 'red') return r >= 7 && r <= 9;
        return r >= 0 && r <= 2;
    }

    countObstacles(r1, c1, r2, c2) {
        let count = 0;
        if (r1 === r2) {
            const start = Math.min(c1, c2) + 1;
            const end = Math.max(c1, c2);
            for (let c = start; c < end; c++) if (this.board[r1][c]) count++;
        } else if (c1 === c2) {
            const start = Math.min(r1, r2) + 1;
            const end = Math.max(r1, r2);
            for (let r = start; r < end; r++) if (this.board[r][c1]) count++;
        }
        return count;
    }

    // 飛將規則 (Kings Facing)
    kingsFacing() {
        let rK = null, bK = null;
        for (let r = 0; r < 10; r++) {
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
            if (obstacles === 0) return true; // 中間無阻礙 -> 飛將
        }
        return false;
    }

    // 產生合法走法 (Generate Legal Moves)
    generateLegalMoves(color) {
        const moves = [];
        for (let r = 0; r < 10; r++) for (let c = 0; c < 9; c++) {
            const p = this.board[r][c];
            if (p && p.color === color) {
                this.getPossibleDestinations(p).forEach(dest => {
                    const [tgtR, tgtC] = dest;
                    if (this.isValidMove(p, tgtR, tgtC)) {
                        const captured = this.board[tgtR][tgtC];
                        // 模擬移動
                        this.board[p.row][p.col] = null;
                        this.board[tgtR][tgtC] = p;
                        const oldR = p.row, oldC = p.col;
                        p.row = tgtR; p.col = tgtC;

                        // 檢查是否違反「飛將」
                        // 注意：此處尚未檢查是否「被將軍」，完整規則通常需要，但在簡易 AI 中，
                        // 我們依賴 Minimax 的評分 (被吃將 = 負無限大) 來避免送將。
                        if (!this.kingsFacing()) {
                            // 簡易排序分數 (MVV/LVA): 優先吃高價值棋
                            let score = captured ? (PIECE_VALUES[captured.type] || 0) : 0;
                            moves.push({
                                from: { r: oldR, c: oldC },
                                to: { r: tgtR, c: tgtC },
                                score: score
                            });
                        }

                        // 還原
                        p.row = oldR; p.col = oldC;
                        this.board[oldR][oldC] = p;
                        this.board[tgtR][tgtC] = captured;
                    }
                });
            }
        }
        // 排序：高分走法在前 (提升 Alpha-Beta 剪枝效率)
        moves.sort((a, b) => b.score - a.score);
        return moves;
    }

    getPossibleDestinations(piece) {
        const dests = []; const r = piece.row, c = piece.col;
        switch (piece.type) {
            case 'king': case 'advisor':
                for (let i = r - 1; i <= r + 1; i++) for (let j = c - 1; j <= c + 1; j++) if (i >= 0 && i < 10 && j >= 0 && j < 9) dests.push([i, j]);
                break;
            case 'elephant':
                [[r - 2, c - 2], [r - 2, c + 2], [r + 2, c - 2], [r + 2, c + 2]].forEach(d => { if (d[0] >= 0 && d[0] < 10 && d[1] >= 0 && d[1] < 9) dests.push(d); });
                break;
            case 'horse':
                [[r - 2, c - 1], [r - 2, c + 1], [r + 2, c - 1], [r + 2, c + 1], [r - 1, c - 2], [r - 1, c + 2], [r + 1, c - 2], [r + 1, c + 2]]
                    .forEach(d => { if (d[0] >= 0 && d[0] < 10 && d[1] >= 0 && d[1] < 9) dests.push(d); });
                break;
            case 'pawn':
                [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]].forEach(d => { if (d[0] >= 0 && d[0] < 10 && d[1] >= 0 && d[1] < 9) dests.push(d); });
                break;
            case 'rook': case 'cannon':
                for (let i = 0; i < 10; i++) if (i !== r) dests.push([i, c]);
                for (let j = 0; j < 9; j++) if (j !== c) dests.push([r, j]);
                break;
        }
        return dests;
    }

    // 局面評估函數 (Evaluation Function)
    evaluateBoard(color) {
        let score = 0;
        for (let r = 0; r < 10; r++) for (let c = 0; c < 9; c++) {
            const p = this.board[r][c];
            if (p) {
                let val = PIECE_VALUES[p.type] || 100;

                // 加入 PST 位置價值
                if (PST[p.type] && PST[p.type].length > 0) {
                    // PST 讀取邏輯：
                    // 紅方在下方 (Row 9 是底線)，PST 定義也是 [0..9]，Row 9 對應底線，直接查表。
                    // 黑方在上方 (Row 0 是底線)，黑方 Row 0 對應紅方 Row 9 的價值 (鏡像)，故查表 [9-r]。
                    let lookupR = r;
                    if (p.color === 'black') lookupR = 9 - r;

                    const rowVals = PST[p.type][lookupR];
                    if (rowVals) {
                        // 假設左右對稱性高，目前簡化處理。若 PST 不完善需小心 index。
                        val += (rowVals[c] || 0);
                    }
                }

                if (p.color === color) score += val; else score -= val;
            }
        }
        return score;
    }
}

// ==========================================
// 第三部分：AI Worker 程式碼產生 (Worker Generation)
// ==========================================
const logicSource = XiangqiLogic.toString();
const workerScriptContent = `
    const BOARD_ROWS = 10;
    const BOARD_COLS = 9;
    const PIECE_VALUES = ${JSON.stringify(PIECE_VALUES)};
    const PST = ${JSON.stringify(PST)};
    ${logicSource}
    const game = new XiangqiLogic();

    self.onmessage = function(e) {
        const { board, depth, turn } = e.data;
        game.board = board; game.turn = turn;
        
        // 迭代加深搜尋 (IDDFS): 從淺層搜到深層，確保時間內有結果，且利於排序。
        let bestMove = null;
        const maxDepth = depth;
        
        for (let d = 1; d <= maxDepth; d++) {
             // 傳入 true (maximizing player)
             const move = minimax(game, d, -Infinity, Infinity, true, turn);
             if (move && move.from) bestMove = move; 
        }
        
        self.postMessage(bestMove || {}); 
    };

    function minimax(game, depth, alpha, beta, isMaximizing, myColor) {
        if (depth === 0) {
            // 到達葉節點：評估分數
            return { score: game.evaluateBoard(myColor) }; 
        }

        const possibleMoves = game.generateLegalMoves(isMaximizing ? myColor : (myColor === 'red' ? 'black' : 'red'));
        
        // 若無路可走 (被將死或困斃)
        if (possibleMoves.length === 0) return { score: isMaximizing ? -100000 : 100000 };

        let bestMove = null;
        if (isMaximizing) {
            let maxEval = -Infinity;
            for (const move of possibleMoves) {
                // 執行移動
                const piece = game.board[move.from.r][move.from.c];
                const captured = game.board[move.to.r][move.to.c];
                game.board[move.from.r][move.from.c] = null;
                game.board[move.to.r][move.to.c] = piece;
                piece.row = move.to.r; piece.col = move.to.c;

                const eval = minimax(game, depth - 1, alpha, beta, false, myColor).score;

                // 復原
                piece.row = move.from.r; piece.col = move.from.c;
                game.board[move.from.r][move.from.c] = piece;
                game.board[move.to.r][move.to.c] = captured;

                if (eval > maxEval) { maxEval = eval; bestMove = move; bestMove.score = maxEval; }
                alpha = Math.max(alpha, eval); if (beta <= alpha) break;
            }
            return bestMove || { score: maxEval };
        } else {
            let minEval = Infinity;
            for (const move of possibleMoves) {
                const piece = game.board[move.from.r][move.from.c];
                const captured = game.board[move.to.r][move.to.c];
                game.board[move.from.r][move.from.c] = null;
                game.board[move.to.r][move.to.c] = piece;
                piece.row = move.to.r; piece.col = move.to.c;

                const eval = minimax(game, depth - 1, alpha, beta, true, myColor).score;

                piece.row = move.from.r; piece.col = move.from.c;
                game.board[move.from.r][move.from.c] = piece;
                game.board[move.to.r][move.to.c] = captured;

                if (eval < minEval) { minEval = eval; bestMove = move; bestMove.score = minEval; }
                beta = Math.min(beta, eval); if (beta <= alpha) break;
            }
            return bestMove || { score: minEval };
        }
    }
`;
const workerBlob = new Blob([workerScriptContent], { type: 'application/javascript' });
const workerUrl = URL.createObjectURL(workerBlob);


// ==========================================
// 第四部分：UI 控制器 (UI Controller)
// ==========================================

class XiangqiApp {
    constructor() {
        this.game = new XiangqiLogic();
        this.selectedPiece = null;
        this.aiWorker = new Worker(workerUrl);

        this.gameMode = 'pve';
        this.playerColor = 'red';
        this.aiColor = 'black';
        this.difficulty = 3;
        this.isAiThinking = false;

        this.lastMove = null; // 記錄最後一步 {from, to}

        this.history = [];
        this.saveHistory();

        this.initUI();
        this.reloadBoard();
        this.updateStatus();

        this.aiWorker.onmessage = (e) => this.handleAiMove(e.data);
    }

    // 儲存歷史紀錄 (用於悔棋)
    saveHistory() {
        this.history.push({
            board: this.game.cloneBoard(),
            turn: this.game.turn,
            selectedId: this.selectedPiece ? this.selectedPiece.key : null,
            lastMove: this.lastMove ? { ...this.lastMove } : null
        });
    }

    // 悔棋功能
    undo() {
        if (this.isAiThinking) return;
        if (this.history.length <= 1) return;

        if (this.gameMode === 'pve') {
            this.history.pop(); // 回復 AI
            if (this.history.length > 1) this.history.pop(); // 回復玩家
        } else {
            this.history.pop();
        }

        const state = this.history[this.history.length - 1];
        if (state) {
            this.game.board = state.board;
            this.game.turn = state.turn;
            this.game.gameOver = false;
            this.selectedPiece = null;
            this.lastMove = state.lastMove;

            this.reloadBoard();
            this.updateStatus();
        }
    }

    initUI() {
        document.getElementById('restart-btn').addEventListener('click', () => this.restart());
        document.getElementById('undo-btn').addEventListener('click', () => this.undo());

        this.setupStaticBoard();

        const settingsPanel = document.querySelector('.settings-panel');
        if (settingsPanel) {
            settingsPanel.innerHTML = `
                <div>
                   <label>難度</label>
                   <select id="difficulty">
                        <option value="2">初級</option>
                        <option value="3" selected>中級</option>
                        <option value="4">高級</option>
                   </select>
                </div>
                <div>
                    <label>AI 模型</label>
                    <select id="ai-model">
                        <option value="native" selected>內建核心 (Minimax)</option>
                        <option value="gemini" disabled>Gemini (需要 API)</option>
                        <option value="gpt" disabled>ChatGPT (需要 API)</option>
                    </select>
                </div>
                <div class="audio-setting">
                    <label>音效</label>
                    <div class="toggle-row">
                        <span>開啟</span>
                        <label class="toggle-switch">
                            <input type="checkbox" id="sound-toggle" checked>
                            <span class="slider"></span>
                        </label>
                    </div>
                </div>
            `;

            document.getElementById('difficulty').addEventListener('change', (e) => this.difficulty = parseInt(e.target.value));
            document.getElementById('sound-toggle').addEventListener('change', (e) => soundManager.enabled = e.target.checked);
            soundManager.enabled = document.getElementById('sound-toggle').checked;
        }
    }

    // 繪製靜態棋盤 (網格與河界)
    setupStaticBoard() {
        const container = document.getElementById('chessboard');
        container.innerHTML = `<div id="board-overlay" class="board-overlay"></div>`;
        const overlay = document.getElementById('board-overlay');
        overlay.onclick = (e) => this.handleBoardClick(e);

        const fragment = document.createDocumentFragment();
        // 畫橫線
        for (let i = 0; i < 10; i++) {
            const line = document.createElement('div'); line.className = 'row-line';
            line.style.top = `calc(${i + 0.5} * var(--cell-size))`; fragment.appendChild(line);
        }
        // 畫直線
        for (let i = 0; i < 9; i++) {
            const line = document.createElement('div'); line.className = 'col-line';
            line.style.left = `calc(${i + 0.5} * var(--cell-size))`; fragment.appendChild(line);
        }
        const river = document.createElement('div'); river.className = 'river-clear';
        river.innerHTML = '<span>楚 河</span><span>漢 界</span>'; fragment.appendChild(river);

        // 畫九宮
        const p1 = document.createElement('div'); p1.className = 'palace-top'; fragment.appendChild(p1);
        const p2 = document.createElement('div'); p2.className = 'palace-bottom'; fragment.appendChild(p2);

        container.insertBefore(fragment, overlay);

        const pc = document.createElement('div'); pc.id = 'pieces-container'; container.appendChild(pc);
        const hl = document.createElement('div'); hl.id = 'highlights-container'; container.appendChild(hl);
    }

    // 重繪棋盤 (棋子與高亮)
    reloadBoard() {
        const container = document.getElementById('pieces-container');
        container.innerHTML = '';

        this.renderHighlights();

        let inCheck = this.isCheck(this.game.turn);

        for (let r = 0; r < 10; r++) for (let c = 0; c < 9; c++) {
            const piece = this.game.board[r][c];
            if (piece) {
                const el = document.createElement('div');
                el.className = `piece ${piece.color}`;
                el.innerText = piece.text;
                el.style.top = `calc(${r + 0.5} * var(--cell-size))`;
                el.style.left = `calc(${c + 0.5} * var(--cell-size))`;
                el.onclick = (e) => this.handlePieceClick(r, c, e);

                if (this.selectedPiece && this.selectedPiece.row === r && this.selectedPiece.col === c) {
                    el.classList.add('selected');
                }

                // 被將軍特效
                if (inCheck && piece.type === 'king' && piece.color === this.game.turn) {
                    el.classList.add('in-check');
                }

                container.appendChild(el);
            }
        }
    }

    renderHighlights() {
        const container = document.getElementById('highlights-container');
        container.innerHTML = '';

        if (this.lastMove) {
            const { from, to } = this.lastMove;
            const srcEl = document.createElement('div');
            srcEl.className = 'highlight-source';
            srcEl.style.top = `calc(${from.r + 0.5} * var(--cell-size))`;
            srcEl.style.left = `calc(${from.c + 0.5} * var(--cell-size))`;

            const destEl = document.createElement('div');
            destEl.className = 'highlight-dest';
            destEl.style.top = `calc(${to.r + 0.5} * var(--cell-size))`;
            destEl.style.left = `calc(${to.c + 0.5} * var(--cell-size))`;

            container.appendChild(srcEl);
            container.appendChild(destEl);
        }
    }

    restart() {
        this.game = new XiangqiLogic();
        this.selectedPiece = null;
        this.lastMove = null;
        this.isAiThinking = false;
        this.history = [];
        this.saveHistory();
        this.reloadBoard();
        this.updateStatus();
    }

    handlePieceClick(r, c, e) {
        if (this.game.gameOver || this.isAiThinking) return;
        e.stopPropagation();

        const clickedPiece = this.game.board[r][c];
        // PVE 模式下，若是玩家選到 AI 的棋，不允許 (除非想看?)，通常只選己方
        if (this.gameMode === 'pve' && this.game.turn !== this.playerColor) return;

        // 選擇己方棋子
        if (clickedPiece && clickedPiece.color === this.game.turn) {
            this.selectedPiece = clickedPiece;
            this.reloadBoard();
            // 播放選擇音 (輕微)
            soundManager.playTone(300, 'sine', 0.05, 0.1);
            return;
        }

        // 點擊空位或敵方 (嘗試移動)
        if (this.selectedPiece) {
            this.attemptMove(this.selectedPiece, r, c);
        }
    }

    handleBoardClick(e) {
        if (this.game.gameOver || !this.selectedPiece || this.isAiThinking) return;
        if (this.gameMode === 'pve' && this.game.turn !== this.playerColor) return;

        const rect = document.getElementById('chessboard').getBoundingClientRect();
        const clientX = e.clientX;
        const clientY = e.clientY;
        const boardWidth = rect.width;
        const cellSizePx = boardWidth / 9;

        const x = clientX - rect.left;
        const y = clientY - rect.top;
        const c = Math.floor(x / cellSizePx);
        const r = Math.floor(y / cellSizePx);

        if (r >= 0 && r < 10 && c >= 0 && c < 9) {
            this.attemptMove(this.selectedPiece, r, c);
        }
    }

    attemptMove(piece, targetR, targetC) {
        if (this.game.isValidMove(piece, targetR, targetC)) {
            const originalPiece = this.game.board[piece.row][piece.col];
            const targetContent = this.game.board[targetR][targetC];

            // 執行移動
            this.game.board[piece.row][piece.col] = null;
            this.game.board[targetR][targetC] = piece;
            const oldR = piece.row, oldC = piece.col;
            piece.row = targetR; piece.col = targetC;

            // 檢查飛將
            if (this.game.kingsFacing()) {
                // 還原
                piece.row = oldR; piece.col = oldC;
                this.game.board[oldR][oldC] = originalPiece;
                this.game.board[targetR][targetC] = targetContent;
                alert("不可飛將！");
                return;
            }

            // 移動成功
            if (targetContent) soundManager.playCapture();
            else soundManager.playMove();

            this.selectedPiece = null;
            this.lastMove = { from: { r: oldR, c: oldC }, to: { r: targetR, c: targetC } };

            // 檢查勝負 (吃將)
            if (targetContent && targetContent.type === 'king') {
                this.endGame(this.game.turn);
                return;
            }

            // 換手
            this.game.turn = this.game.turn === 'red' ? 'black' : 'red';

            if (this.isCheck(this.game.turn)) soundManager.playCheck();

            this.saveHistory();
            this.reloadBoard();
            this.updateStatus();

            // 觸發 AI
            if (this.gameMode === 'pve' && this.game.turn === this.aiColor && !this.game.gameOver) {
                this.triggerAi();
            }
        }
    }

    triggerAi() {
        this.isAiThinking = true;
        this.updateStatus();
        this.aiWorker.postMessage({
            board: this.game.board,
            turn: this.game.turn,
            depth: this.difficulty
        });
    }

    handleAiMove(bestMove) {
        this.isAiThinking = false;
        if (!bestMove || !bestMove.from) {
            console.warn("AI didn't return a move");
            return;
        }

        const { from, to } = bestMove;
        const piece = this.game.board[from.r][from.c];
        const target = this.game.board[to.r][to.c];

        if (piece) {
            this.game.board[from.r][from.c] = null;
            this.game.board[to.r][to.c] = piece;
            piece.row = to.r; piece.col = to.c;

            this.lastMove = { from, to };

            if (target) soundManager.playCapture();
            else soundManager.playMove();

            if (target && target.type === 'king') {
                this.endGame(this.aiColor);
                return;
            }

            this.game.turn = this.playerColor;
            if (this.isCheck(this.game.turn)) soundManager.playCheck();

            this.saveHistory();
            this.reloadBoard();
            this.updateStatus();
        }
    }

    endGame(winnerColor) {
        this.game.gameOver = true;
        this.updateStatus();
        this.reloadBoard();
        soundManager.playWin();
        setTimeout(() => {
            alert(winnerColor === 'red' ? '紅方獲勝!' : '黑方獲勝!');
        }, 300);
    }

    updateStatus() {
        const statusEl = document.getElementById('status');
        const turnTextEl = document.getElementById('turn-text');

        if (this.game.gameOver) {
            statusEl.innerText = "遊戲結束";
            return;
        }

        let text = '';
        if (this.isAiThinking) {
            text = '電腦思考中...';
        } else {
            text = this.game.turn === 'red' ? '紅方回合' : '黑方回合';
            if (this.isCheck(this.game.turn)) {
                text += ' (將軍!)';
            }
        }

        statusEl.innerText = text;
        if (turnTextEl) turnTextEl.innerText = `當前：${text}`;
    }

    isCheck(color) {
        let kR, kC;
        // 找將軍
        for (let r = 0; r < 10; r++) for (let c = 0; c < 9; c++) {
            const p = this.game.board[r][c];
            if (p && p.color === color && p.type === 'king') { kR = r; kC = c; break; }
        }
        // 檢查敵方能否攻擊
        const enemy = color === 'red' ? 'black' : 'red';
        for (let r = 0; r < 10; r++) for (let c = 0; c < 9; c++) {
            const p = this.game.board[r][c];
            if (p && p.color === enemy) {
                if (this.game.isValidMove(p, kR, kC)) return true;
            }
        }
        return false;
    }
}

window.onload = () => {
    // 啟動遊戲
    new XiangqiApp();
};
