// /var/www/html/js_chess/ai.js

// 设定各兵种的基础价值
const PIECE_VALUES = {
    'K': 10000, // 将帅，无价之宝
    'R': 1000,  // 车，战力最强
    'C': 500,   // 炮，极具威胁
    'N': 450,   // 马，灵活度高
    'S': 200,   // 相/象，防守核心
    'J': 200,   // 仕/士，贴身护卫
    'P': 100    // 兵/卒，过河前较弱
};

// 棋子价值动态评估（加入位置权重）
function getPieceValue(piece, r, c) {
    if (!piece) return 0;
    let val = PIECE_VALUES[piece[0]];
    
    // 兵/卒过河价值暴涨
    if (piece[0] === 'P') {
        if (piece[1] === 'r' && r <= 4) val += 150; // 红兵过河
        if (piece[1] === 'b' && r >= 5) val += 150; // 黑卒过河
    }
    
    // 马和炮越靠近中路越有价值（控制力更强）
    if (piece[0] === 'N' || piece[0] === 'C') {
        val += (4 - Math.abs(c - 4)) * 15;
    }
    
    return val;
}

// 评价当前整个棋盘局面的得分
function evaluateBoard(board, aiCamp) {
    let score = 0;
    let myKing = false;
    let oppKing = false;

    for (let r = 0; r < 10; r++) {
        for (let c = 0; c < 9; c++) {
            let p = board[r][c];
            if (p) {
                if (p[0] === 'K') {
                    if (p[1] === aiCamp) myKing = true;
                    else oppKing = true;
                }
                let val = getPieceValue(p, r, c);
                // 己方的棋子加分，对方的棋子扣分
                if (p[1] === aiCamp) {
                    score += val;
                } else {
                    score -= val;
                }
            }
        }
    }
    
    // 如果我方老将被吃，给一个极低的负分；敌方被吃，极高正分
    if (!myKing) return -100000;
    if (!oppKing) return 100000;
    
    return score;
}

// 获取某一特定阵营在当前局面的所有合法着法（伪合法，未过滤送将）
function getAllMoves(board, camp) {
    let moves = [];
    for (let fr = 0; fr < 10; fr++) {
        for (let fc = 0; fc < 9; fc++) {
            const p = board[fr][fc];
            if (p && p[1] === camp) {
                for (let tr = 0; tr < 10; tr++) {
                    for (let tc = 0; tc < 9; tc++) {
                        if (canMove(fr, fc, tr, tc, board)) {
                            moves.push({ from: { r: fr, c: fc }, to: { r: tr, c: tc } });
                        }
                    }
                }
            }
        }
    }
    // 启发式优化（Alpha-Beta 剪枝利器）：将吃子的动作排在前面，优先搜索
    moves.sort((a, b) => {
        let scoreA = board[a.to.r][a.to.c] ? getPieceValue(board[a.to.r][a.to.c], a.to.r, a.to.c) : 0;
        let scoreB = board[b.to.r][b.to.c] ? getPieceValue(board[b.to.r][b.to.c], b.to.r, b.to.c) : 0;
        return scoreB - scoreA;
    });
    return moves;
}

// Alpha-Beta 剪枝 Minimax 算法
function alphaBeta(board, depth, alpha, beta, isMaximizing, currentCamp, aiCamp) {
    // 达到搜索深度极限，直接返回静态评估分数
    if (depth === 0) {
        return evaluateBoard(board, aiCamp);
    }

    let moves = getAllMoves(board, currentCamp);
    // 如果无路可走（绝杀），直接认输
    if (moves.length === 0) {
        return isMaximizing ? -100000 : 100000;
    }

    if (isMaximizing) {
        let maxEval = -Infinity;
        for (let move of moves) {
            let target = board[move.to.r][move.to.c];
            
            // 如果能直接吃掉对方的将帅，不用深究，直接返回极值
            if (target && target[0] === 'K') return 100000;

            // 虚拟走子
            board[move.to.r][move.to.c] = board[move.from.r][move.from.c];
            board[move.from.r][move.from.c] = null;

            let evalScore = alphaBeta(board, depth - 1, alpha, beta, false, currentCamp === 'r' ? 'b' : 'r', aiCamp);

            // 撤销虚拟走子
            board[move.from.r][move.from.c] = board[move.to.r][move.to.c];
            board[move.to.r][move.to.c] = target;

            maxEval = Math.max(maxEval, evalScore);
            alpha = Math.max(alpha, evalScore);
            // 剪枝：如果已经找到了足够好的步，剩下更差的分支就不必看了
            if (beta <= alpha) break;
        }
        return maxEval;
    } else {
        let minEval = Infinity;
        for (let move of moves) {
            let target = board[move.to.r][move.to.c];
            
            if (target && target[0] === 'K') return -100000;

            board[move.to.r][move.to.c] = board[move.from.r][move.from.c];
            board[move.from.r][move.from.c] = null;

            let evalScore = alphaBeta(board, depth - 1, alpha, beta, true, currentCamp === 'r' ? 'b' : 'r', aiCamp);

            board[move.from.r][move.from.c] = board[move.to.r][move.to.c];
            board[move.to.r][move.to.c] = target;

            minEval = Math.min(minEval, evalScore);
            beta = Math.min(beta, evalScore);
            if (beta <= alpha) break;
        }
        return minEval;
    }
}

// ------------------------------------------------------------
// 🤖 对外暴露的 AI 核心入口函数
// ------------------------------------------------------------
function getBestAIMove(board, aiCamp) {
    // 搜索深度设为 3（前端浏览器计算能力的甜点位，既聪明又不会卡顿太久）
    const SEARCH_DEPTH = 3; 
    
    let bestMove = null;
    let bestValue = -Infinity;
    
    let moves = getAllMoves(board, aiCamp);
    
    for (let move of moves) {
        let target = board[move.to.r][move.to.c];
        
        // 特判：如果有一步能直接斩将，直接走，无需推演
        if (target && target[0] === 'K') {
            return move;
        }
        
        // 开始推演这步棋
        board[move.to.r][move.to.c] = board[move.from.r][move.from.c];
        board[move.from.r][move.from.c] = null;
        
        // 交给敌方走子，并求出敌方尽全力反抗后的最终得分
        let boardValue = alphaBeta(board, SEARCH_DEPTH - 1, -Infinity, Infinity, false, aiCamp === 'r' ? 'b' : 'r', aiCamp);
        
        board[move.from.r][move.from.c] = board[move.to.r][move.to.c];
        board[move.to.r][move.to.c] = target;

        // 关键防守：过滤掉“送将”的自杀棋
        let tempBoard = JSON.parse(JSON.stringify(board));
        tempBoard[move.to.r][move.to.c] = tempBoard[move.from.r][move.from.c];
        tempBoard[move.from.r][move.from.c] = null;
        
        // 只有不属于送将，且得分最高的，才是最终好棋
        if (typeof isCheck === 'function' && isCheck(tempBoard, aiCamp)) {
            continue; 
        }

        if (boardValue > bestValue) {
            bestValue = boardValue;
            bestMove = move;
        }
    }
    
    // 如果无路可逃，随便挣扎一下（防崩溃）
    if (!bestMove && moves.length > 0) {
        return moves[0];
    }

    return bestMove;
}
