// /var/www/html/js_gomoku/ai.js

function getBestGomokuMove(board, aiCamp) {
    let bestScore = -1;
    let bestMoves = [];
    const humanCamp = aiCamp === 'white' ? 'black' : 'white';

    // 评估某一个方向上的阵型得分
    function evaluateDirection(r, c, dr, dc, camp) {
        let count = 1;
        let openEnds = 0;
        
        // 往前探
        let i = 1;
        while (r + dr*i >= 0 && r + dr*i < 15 && c + dc*i >= 0 && c + dc*i < 15 && board[r + dr*i][c + dc*i] === camp) { count++; i++; }
        if (r + dr*i >= 0 && r + dr*i < 15 && c + dc*i >= 0 && c + dc*i < 15 && board[r + dr*i][c + dc*i] === null) openEnds++;
        
        // 往后探
        let i_back = 1;
        while (r - dr*i_back >= 0 && r - dr*i_back < 15 && c - dc*i_back >= 0 && c - dc*i_back < 15 && board[r - dr*i_back][c - dc*i_back] === camp) { count++; i_back++; }
        if (r - dr*i_back >= 0 && r - dr*i_back < 15 && c - dc*i_back >= 0 && c - dc*i_back < 15 && board[r - dr*i_back][c - dc*i_back] === null) openEnds++;

        // 评分权重
        if (count >= 5) return 100000;              // 连五（必胜）
        if (count === 4 && openEnds === 2) return 10000; // 活四（必胜）
        if (count === 4 && openEnds === 1) return 1000;  // 冲四
        if (count === 3 && openEnds === 2) return 1000;  // 活三
        if (count === 3 && openEnds === 1) return 100;   // 眠三
        if (count === 2 && openEnds === 2) return 100;   // 活二
        return count; 
    }

    // 遍历整个棋盘所有的空位
    for (let r = 0; r < 15; r++) {
        for (let c = 0; c < 15; c++) {
            if (board[r][c] !== null) continue;
            
            let score = 0;
            const dirs = [[1,0], [0,1], [1,1], [1,-1]];
            
            for (let [dr, dc] of dirs) {
                // 计算 AI 自己下在这里的进攻得分
                score += evaluateDirection(r, c, dr, dc, aiCamp);
                // 计算玩家下在这里的得分，并予以拦截（防守系数略低于进攻，AI 会优先自己赢）
                score += evaluateDirection(r, c, dr, dc, humanCamp) * 0.9;
            }
            
            // 附加一个中心位置权重，避免在空旷棋盘时乱下
            score += (7 - Math.abs(r - 7)) + (7 - Math.abs(c - 7)); 

            if (score > bestScore) {
                bestScore = score;
                bestMoves = [{r, c}];
            } else if (score === bestScore) {
                bestMoves.push({r, c});
            }
        }
    }
    
    if (bestMoves.length === 0) return {r: 7, c: 7};
    // 多个最高分位置随机选一个，增加变化
    return bestMoves[Math.floor(Math.random() * bestMoves.length)];
}
