// /var/www/html/js/rules.js
const CN = {
    r: {K:'帥', J:'仕', S:'相', R:'車', N:'馬', P:'兵', C:'炮'},
    b: {K:'將', J:'士', S:'象', R:'車', N:'馬', P:'卒', C:'砲'}
};
const INIT_BOARD = [
    ['Rb','Nb','Sb','Jb','Kb','Jb','Sb','Nb','Rb'],
    [null,null,null,null,null,null,null,null,null],
    [null,'Cb',null,null,null,null,null,'Cb',null],
    ['Pb',null,'Pb',null,'Pb',null,'Pb',null,'Pb'],
    [null,null,null,null,null,null,null,null,null],
    [null,null,null,null,null,null,null,null,null],
    ['Pr',null,'Pr',null,'Pr',null,'Pr',null,'Pr'],
    [null,'Cr',null,null,null,null,null,'Cr',null],
    [null,null,null,null,null,null,null,null,null],
    ['Rr','Nr','Sr','Jr','Kr','Jr','Sr','Nr','Rr']
];

function canMove(fr, fc, tr, tc, currentBoard) {
    if (tr < 0 || tr > 9 || tc < 0 || tc > 8) return false;
    if (fr === tr && fc === tc) return false;
    const p = currentBoard[fr][fc];
    if (!p) return false;
    const de = currentBoard[tr][tc];
    if (de && de[1] === p[1]) return false;
    const dr = Math.abs(tr - fr), dc = Math.abs(tc - fc);

    switch(p[0]) {
        case 'K':
            if (dr + dc !== 1) return false;
            if (p[1] === 'r' && !(tr >= 7 && tr <= 9 && tc >= 3 && tc <= 5)) return false;
            if (p[1] === 'b' && !(tr >= 0 && tr <= 2 && tc >= 3 && tc <= 5)) return false;
            return true;
        case 'J':
            if (!(dr === 1 && dc === 1)) return false;
            if (p[1] === 'r' && !(tr >= 7 && tr <= 9 && tc >= 3 && tc <= 5)) return false;
            if (p[1] === 'b' && !(tr >= 0 && tr <= 2 && tc >= 3 && tc <= 5)) return false;
            return true;
        case 'S':
            if (!(dr === 2 && dc === 2)) return false;
            if (p[1] === 'r' && tr < 5) return false;
            if (p[1] === 'b' && tr > 4) return false;
            if (currentBoard[fr + Math.sign(tr - fr)][fc + Math.sign(tc - fc)]) return false;
            return true;
        case 'N':
            if (!((dr === 2 && dc === 1) || (dr === 1 && dc === 2))) return false;
            if (dr === 2 && currentBoard[fr + Math.sign(tr - fr)][fc]) return false;
            if (dc === 2 && currentBoard[fr][fc + Math.sign(tc - fc)]) return false;
            return true;
        case 'R':
            return straightClear(fr, fc, tr, tc, currentBoard);
        case 'C':
            if (fr !== tr && fc !== tc) return false;
            const j = jumpCount(fr, fc, tr, tc, currentBoard);
            if (de) return j === 1;
            return j === 0;
        case 'P':
            if (p[1] === 'r') {
                if (tr > fr) return false;
                if (fr >= 5) return dr === 1 && dc === 0;
                return (dr === 1 && dc === 0) || (dr === 0 && dc === 1);
            } else {
                if (tr < fr) return false;
                if (fr <= 4) return dr === 1 && dc === 0;
                return (dr === 1 && dc === 0) || (dr === 0 && dc === 1);
            }
        default:
            return false;
    }
}

function straightClear(fr, fc, tr, tc, currentBoard) {
    if (fr !== tr && fc !== tc) return false;
    if (fr === tr) {
        if (fc < tc) { for (let c = fc + 1; c < tc; c++) if (currentBoard[fr][c]) return false; }
        else { for (let c = fc - 1; c > tc; c--) if (currentBoard[fr][c]) return false; }
    } else {
        if (fr < tr) { for (let r = fr + 1; r < tr; r++) if (currentBoard[r][fc]) return false; }
        else { for (let r = fr - 1; r > tr; r--) if (currentBoard[r][fc]) return false; }
    }
    return true;
}

function jumpCount(fr, fc, tr, tc, currentBoard) {
    let cnt = 0;
    if (fr === tr) {
        if (fc < tc) { for (let c = fc + 1; c < tc; c++) if (currentBoard[fr][c]) cnt++; }
        else { for (let c = fc - 1; c > tc; c--) if (currentBoard[fr][c]) cnt++; }
    } else if (fc === tc) {
        if (fr < tr) { for (let r = fr + 1; r < tr; r++) if (currentBoard[r][fc]) cnt++; }
        else { for (let r = fr - 1; r > tr; r--) if (currentBoard[r][fc]) cnt++; }
    }
    return cnt;
}

function findKing(board, camp) {
    for (let r = 0; r < 10; r++) {
        for (let c = 0; c < 9; c++) {
            if (board[r][c] === 'K' + camp) return { r, c };
        }
    }
    return null;
}

function isCheck(board, camp) {
    const kingPos = findKing(board, camp);
    if (!kingPos) return false;
    const oppCamp = camp === 'r' ? 'b' : 'r';

    for (let r = 0; r < 10; r++) {
        for (let c = 0; c < 9; c++) {
            const piece = board[r][c];
            if (piece && piece[1] === oppCamp) {
                if (canMove(r, c, kingPos.r, kingPos.c, board)) return true;
            }
        }
    }

    const redK = findKing(board, 'r');
    const blkK = findKing(board, 'b');
    if (redK && blkK && redK.c === blkK.c) {
        let hasBlock = false;
        for (let r = blkK.r + 1; r < redK.r; r++) {
            if (board[r][redK.c]) { hasBlock = true; break; }
        }
        if (!hasBlock) return true; 
    }

    return false;
}

function isCheckmate(board, camp) {
    if (!isCheck(board, camp)) return false; 

    for (let r = 0; r < 10; r++) {
        for (let c = 0; c < 9; c++) {
            const piece = board[r][c];
            if (piece && piece[1] === camp) {
                for (let tr = 0; tr < 10; tr++) {
                    for (let tc = 0; tc < 9; tc++) {
                        if (canMove(r, c, tr, tc, board)) {
                            // 优化：使用原地的虚拟走子替代极度消耗性能的 JSON 深拷贝
                            const tempPiece = board[tr][tc];
                            board[tr][tc] = board[r][c];
                            board[r][c] = null;
                            
                            const stillCheck = isCheck(board, camp);
                            
                            // 撤销虚拟走子
                            board[r][c] = board[tr][tc];
                            board[tr][tc] = tempPiece;

                            // 只要有一步能解将，就不算绝杀
                            if (!stillCheck) return false;
                        }
                    }
                }
            }
        }
    }
    return true; 
}
