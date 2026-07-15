// /var/www/html/js_gomoku/rules.js

function isValidPos(r, c) { 
    return r >= 0 && r < 15 && c >= 0 && c < 15; 
}

function checkGomokuWin(board, r, c, camp) {
    // 检查四个方向：水平、垂直、右斜(\)、左斜(/)
    const dirs = [[1, 0], [0, 1], [1, 1], [1, -1]];
    
    for (let [dr, dc] of dirs) {
        let count = 1; // 包含当前落子的这一颗
        
        // 正向检查
        for (let i = 1; i <= 4; i++) { 
            if (isValidPos(r + dr * i, c + dc * i) && board[r + dr * i][c + dc * i] === camp) {
                count++; 
            } else {
                break;
            }
        }
        
        // 反向检查
        for (let i = 1; i <= 4; i++) { 
            if (isValidPos(r - dr * i, c - dc * i) && board[r - dr * i][c - dc * i] === camp) {
                count++; 
            } else {
                break;
            }
        }
        
        if (count >= 5) return true;
    }
    return false;
}
