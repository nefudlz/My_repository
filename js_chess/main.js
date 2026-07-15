// /var/www/html/js_chess/main.js
let socket;
let currentBoard = JSON.parse(JSON.stringify(INIT_BOARD));
let selectedPiece = null;
let myColor = null;
let currentTurn = 'red';
let roomId = null;
let isFlipped = false;
let historyStack = []; 

let isPvEMode = false;
let aiCamp = 'b'; 

// ================= 悔棋 UI 彈窗控制 =================
function showUndoPrompt() {
    let promptBox = document.getElementById('undoPromptBox');
    if (!promptBox) {
        promptBox = document.createElement('div');
        promptBox.id = 'undoPromptBox';
        Object.assign(promptBox.style, {
            position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
            background: 'rgba(253, 250, 242, 0.98)', border: '2px solid #8b4513',
            padding: '25px 40px', borderRadius: '10px', zIndex: '2000',
            textAlign: 'center', boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
            fontFamily: '"KaiTi", serif', color: '#5a3516'
        });
        promptBox.innerHTML = `
            <h3 style="margin-top:0; color:#8f2223; font-size:24px;">⚠️ 悔棋請求</h3>
            <p style="font-size:18px; margin-bottom: 25px;">對手請求悔棋，是否同意？</p>
            <div style="display:flex; justify-content:space-around; gap: 20px;">
                <button onclick="respondUndo(true)" style="flex:1; padding:10px 0; background:#4a6b5d; color:#fdfaf2; border:none; border-radius:4px; cursor:pointer; font-size:18px; font-family:'KaiTi',serif;">同意</button>
                <button onclick="respondUndo(false)" style="flex:1; padding:10px 0; background:#8f2223; color:#fdfaf2; border:none; border-radius:4px; cursor:pointer; font-size:18px; font-family:'KaiTi',serif;">拒絕</button>
            </div>
        `;
        document.body.appendChild(promptBox);
    }
    promptBox.style.display = 'block';
}

function closeUndoPrompt() {
    const promptBox = document.getElementById('undoPromptBox');
    if (promptBox) promptBox.style.display = 'none';
}

window.respondUndo = function(agreed) {
    closeUndoPrompt();
    if (socket && roomId) {
        socket.emit('undoResponse', { roomId, agreed });
    }
};
// ====================================================

async function handleAuth(type) {
    const user = document.getElementById('authUsername').value.trim();
    const pass = document.getElementById('authPassword').value.trim();
    const errDiv = document.getElementById('authError');
    errDiv.textContent = '';

    if(!user || !pass) return errDiv.textContent = '帳號密碼不能為空';

    const url = type === 'login' ? 'https://www.28strings.com/api/login' : 'https://www.28strings.com/api/register';
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: user, password: pass })
        });
        const data = await res.json();

        if(!data.success) {
            errDiv.textContent = data.message;
        } else {
            if(type === 'login') {
                localStorage.setItem('chessToken', data.token);
                localStorage.setItem('chessUser', data.user.username);
                document.getElementById('authModal').style.display = 'none';
                initSocketConnection();
                if (typeof updateGatewayBadge === 'function') updateGatewayBadge();
            } else {
                alert('🏮 註冊成功，請點擊進入棋局（登入）！');
            }
        }
    } catch(e) {
        errDiv.textContent = '無法連線到伺服器';
    }
}

function initSocketConnection() {
    const token = localStorage.getItem('chessToken');
    const username = localStorage.getItem('chessUser');
    if (!token) return;

    document.getElementById('userInfo').textContent = `【 棋客 】 ${username}`;
    document.getElementById('turnInfo').textContent = '已就緒，請落子開局...';

    socket = io({ auth: { token: token } });

    socket.on('roomCreated', (data) => {
        isPvEMode = false; 
        roomId = data.roomId;
        myColor = data.color;
        currentTurn = 'red';
        currentBoard = JSON.parse(JSON.stringify(INIT_BOARD));
        selectedPiece = null;
        historyStack = []; 
        document.getElementById('roomInfo').textContent = '〔 局號 〕 ' + data.roomId;
        document.getElementById('roomInput').value = data.roomId;
        
        if (myColor === 'black' && !isFlipped) toggleFlip();
        else if (myColor === 'red' && isFlipped) toggleFlip();

        drawAllPieces();
    });

    socket.on('roomJoined', (data) => {
        isPvEMode = false;
        roomId = data.roomId;
        myColor = data.color;
        currentTurn = 'red';
        currentBoard = JSON.parse(JSON.stringify(INIT_BOARD));
        selectedPiece = null;
        historyStack = []; 
        document.getElementById('roomInfo').textContent = '〔 局號 〕 ' + data.roomId;
        
        if (myColor === 'black' && !isFlipped) toggleFlip();
        else if (myColor === 'red' && isFlipped) toggleFlip();

        drawAllPieces();
    });

    socket.on('gameStart', (data) => {
        document.getElementById('roomInfo').textContent = '〔 對局中 〕 局號 ' + roomId;
        drawAllPieces();
    });

    socket.on('boardUpdate', (data) => {
        currentBoard = data.board;
        currentTurn = data.currentTurn;
        selectedPiece = null;
        drawAllPieces();
    });

    socket.on('opponentDisconnected', (data) => {
        document.getElementById('turnInfo').innerHTML = `<span style="color:#b30000;">〔 弈友暫離 〕 對手 [${data.name}] 斷開連線，靜候歸步...</span>`;
    });

    // --- 悔棋相關的 Socket 事件 ---
    socket.on('undoRequested', () => { showUndoPrompt(); });
    
    socket.on('undoTimeout', () => { 
        closeUndoPrompt(); 
        showToast("⏳ 悔棋請求已超時"); 
    });

    socket.on('undoAgreed', () => { executeUndo(); });

    socket.on('undoRejected', (msg) => { showToast(msg || "❌ 對手拒絕了你的悔棋請求。"); });

    socket.on('gameEnded', (msg) => { showToast(msg); });

    socket.on('error', (msg) => { showToast(msg); });
}

function logout() {
    localStorage.clear();
    window.location.reload();
}

function startPvE() {
    isPvEMode = true;
    roomId = null;
    myColor = 'red'; 
    aiCamp = 'b';
    currentTurn = 'red';
    currentBoard = JSON.parse(JSON.stringify(INIT_BOARD));
    selectedPiece = null;
    historyStack = [];
    document.getElementById('roomInfo').textContent = '〔 機關對弈 〕';
    document.getElementById('roomInput').value = '';
    if (isFlipped) toggleFlip(); 
    drawAllPieces();
    showToast("🤖 人機模式已啟動，請紅方先手。");
}

function buildClickGrid() {
    const cellsLayer = document.getElementById('cells-layer');
    cellsLayer.innerHTML = '';
    for (let r = 0; r < 10; r++) {
        for (let c = 0; c < 9; c++) {
            const cell = document.createElement('div');
            cell.className = 'click-cell';
            cell.id = `cell-${r}-${c}`;
            cell.style.left = `${45 + c * 50}px`;
            cell.style.top = `${50 + r * 50}px`;
            cell.onclick = () => onGridCellClick(r, c);
            cellsLayer.appendChild(cell);
        }
    }
}

function drawAllPieces() {
    const piecesLayer = document.getElementById('pieces-layer');
    piecesLayer.innerHTML = '';
    document.querySelectorAll('.click-cell').forEach(el => el.classList.remove('guide'));

    for (let r = 0; r < 10; r++) {
        for (let c = 0; c < 9; c++) {
            const token = currentBoard[r][c];
            if (!token) continue;
            const role = token[0], camp = token[1];
            const pDiv = document.createElement('div');
            pDiv.className = `piece ${camp === 'r' ? 'red' : 'black'}`;
            pDiv.innerText = CN[camp][role];
            pDiv.style.left = `${45 + c * 50}px`;
            pDiv.style.top = `${50 + r * 50}px`;
            
            if (selectedPiece && selectedPiece.row === r && selectedPiece.col === c) {
                pDiv.classList.add('selected');
                if (!roomId || (myColor && camp === (myColor === 'red' ? 'r' : 'b'))) {
                    activateMovementGuides();
                }
            }
            pDiv.onclick = (event) => {
                event.stopPropagation();
                onPieceElementClick(r, c);
            };
            piecesLayer.appendChild(pDiv);
        }
    }
    updateTurnInfo();
}

function activateMovementGuides() {
    if (!selectedPiece) return;
    for (let r = 0; r < 10; r++) {
        for (let c = 0; c < 9; c++) {
            if (canMove(selectedPiece.row, selectedPiece.col, r, c, currentBoard)) {
                const cellEl = document.getElementById(`cell-${r}-${c}`);
                if (cellEl) cellEl.classList.add('guide');
            }
        }
    }
}

function onPieceElementClick(r, c) {
    if (isPvEMode && currentTurn === (aiCamp === 'b' ? 'black' : 'red')) return;
    if (!isPvEMode && roomId && myColor && currentTurn !== myColor) return;

    const targetToken = currentBoard[r][c];
    if (selectedPiece) {
        const activeToken = currentBoard[selectedPiece.row][selectedPiece.col];
        if (activeToken && activeToken[1] !== targetToken[1]) {
            if (canMove(selectedPiece.row, selectedPiece.col, r, c, currentBoard)) {
                performMoveAction(selectedPiece.row, selectedPiece.col, r, c);
            }
            return;
        }
    }
    if (targetToken) {
        const camp = targetToken[1];
        if (!roomId || !myColor || camp === (myColor === 'red' ? 'r' : 'b')) {
            selectedPiece = { row: r, col: c };
            drawAllPieces();
            activateMovementGuides();
        }
    }
}

function onGridCellClick(r, c) {
    if (isPvEMode && currentTurn === (aiCamp === 'b' ? 'black' : 'red')) return;
    if (!isPvEMode && roomId && myColor && currentTurn !== myColor) return;

    if (selectedPiece && !currentBoard[r][c]) {
        if (canMove(selectedPiece.row, selectedPiece.col, r, c, currentBoard)) {
            performMoveAction(selectedPiece.row, selectedPiece.col, r, c);
        }
    }
}

function showToast(msg, duration = 3000) {
    let toast = document.getElementById('chessToast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'chessToast';
        Object.assign(toast.style, {
            position: 'fixed', top: '80px', left: '50%', transform: 'translateX(-50%)',
            background: 'rgba(90, 53, 22, 0.95)', color: '#fdfaf2', padding: '12px 30px',
            borderRadius: '6px', fontFamily: '"KaiTi", serif', fontSize: '20px',
            boxShadow: '0 5px 15px rgba(0,0,0,0.3)', border: '1px solid #c69c6d',
            opacity: '0', transition: 'opacity 0.4s', zIndex: '1000', pointerEvents: 'none'
        });
        document.body.appendChild(toast);
    }
    toast.innerHTML = msg;
    toast.style.opacity = '1';
    setTimeout(() => { toast.style.opacity = '0'; }, duration);
}

function performMoveAction(fromR, fromC, toR, toC) {
    const movingToken = currentBoard[fromR][fromC];
    const targetToken = currentBoard[toR][toC];
    const playingCamp = currentTurn === 'red' ? 'r' : 'b';

    const tempBoard = JSON.parse(JSON.stringify(currentBoard));
    tempBoard[toR][toC] = tempBoard[fromR][fromC];
    tempBoard[fromR][fromC] = null;
    
    if (isCheck(tempBoard, playingCamp)) {
        if (!isPvEMode || playingCamp !== aiCamp) {
            showToast("🚫 違規：不可送將或使將帥照面！");
        }
        selectedPiece = null;
        drawAllPieces();
        return; 
    }

    historyStack.push({
        board: JSON.parse(JSON.stringify(currentBoard)),
        turn: currentTurn
    });

    let captureMsg = "";
    if (targetToken) {
        const pieceName = CN[targetToken[1]][targetToken[0]];
        captureMsg = `⚔️ 吃子：${pieceName}！ `;
    }

    currentBoard = tempBoard;
    currentTurn = currentTurn === 'red' ? 'black' : 'red';
    selectedPiece = null;
    drawAllPieces();

    const nextCamp = currentTurn === 'red' ? 'r' : 'b';
    if (isCheckmate(currentBoard, nextCamp)) {
        showToast(captureMsg + "🏮 絕殺！無解！", 5000);
    } else if (isCheck(currentBoard, nextCamp)) {
        showToast(captureMsg + "⚠️ 將軍！");
    } else if (captureMsg) {
        showToast(captureMsg); 
    }

    if (!isPvEMode && socket && socket.connected && roomId) {
        socket.emit('move', { roomId: roomId, from: {r: fromR, c: fromC}, to: {r: toR, c: toC} });
    }

    if (isPvEMode && currentTurn === (aiCamp === 'b' ? 'black' : 'red') && !isCheckmate(currentBoard, nextCamp)) {
        document.getElementById('turnInfo').innerHTML = '<span style="color:#2b2b2b;">機關思考中...</span>';
        setTimeout(() => {
            const aiMove = getBestAIMove(currentBoard, aiCamp);
            if (aiMove) {
                performMoveAction(aiMove.from.r, aiMove.from.c, aiMove.to.r, aiMove.to.c);
            } else {
                showToast("🏆 機關已無子可走，恭喜少俠獲勝！");
            }
        }, 600); 
    }
}

function executeUndo() {
    if (historyStack.length === 0) {
        showToast("📜 已至開局，無棋可悔。");
        return;
    }
    
    if (isPvEMode) {
        if (historyStack.length >= 2) {
            historyStack.pop(); 
            const lastState = historyStack.pop(); 
            currentBoard = lastState.board;
            currentTurn = lastState.turn;
        } else {
            showToast("📜 無法悔棋。");
            return;
        }
    } else {
        const lastState = historyStack.pop();
        currentBoard = lastState.board;
        currentTurn = lastState.turn;
    }

    selectedPiece = null;
    drawAllPieces();
    showToast("↩️ 弦音迴響，悔棋成功。");
}

function triggerUndo() {
    if (!isPvEMode && socket && socket.connected && roomId) {
        showToast("⏳ 正在請求對手同意悔棋...");
        socket.emit('requestUndo', { roomId: roomId }); 
    } else {
        executeUndo();
    }
}

function sweepBoard() {
    roomId = null;
    isPvEMode = false;
    myColor = null;
    currentTurn = 'red';
    currentBoard = JSON.parse(JSON.stringify(INIT_BOARD));
    selectedPiece = null;
    historyStack = [];
    isFlipped = false;
    
    const boardEl = document.getElementById('board');
    if (boardEl) boardEl.classList.remove('flipped');
    
    document.getElementById('roomInfo').textContent = '未進入房間';
    document.getElementById('roomInput').value = '';
    
    drawAllPieces();
    showToast("✨ 拂拭枰台，棋局已重置。");
}

function updateTurnInfo() {
    const info = document.getElementById('turnInfo');
    if (isPvEMode) {
        info.innerHTML = currentTurn === 'red' ? '<span style="color:#a31d1d; font-weight:bold;">少俠，請落子</span>' : '<span style="color:#2b2b2b;">機關思考中...</span>';
    } else if (roomId && myColor) {
        const turnText = currentTurn === 'red' ? '<span style="color:#a31d1d; font-weight:bold;">【紅方持赤】</span>' : '<span style="color:#2b2b2b; font-weight:bold;">【黑方持墨】</span>';
        const statusText = currentTurn === myColor ? ' 執子對弈中' : ' 對手長考中';
        info.innerHTML = turnText + statusText;
    } else {
        const turnText = currentTurn === 'red' ? '<span style="color:#a31d1d; font-weight:bold;">【紅方持赤】</span>' : '<span style="color:#2b2b2b; font-weight:bold;">【黑方持墨】</span>';
        info.innerHTML = turnText + ' 待落子';
    }
}

function createRoom() {
    if (socket && socket.connected) { socket.emit('createRoom'); } 
    else { showToast('❌ 未建立連線'); }
}

function joinRoom() {
    const rid = document.getElementById('roomInput').value.trim().toUpperCase();
    if (!rid) return showToast('請輸入房間號');
    if (socket && socket.connected) { socket.emit('joinRoom', { roomId: rid }); } 
    else { showToast('❌ 未建立連線'); }
}

function toggleFlip() {
    const boardEl = document.getElementById('board');
    isFlipped = !isFlipped;
    if (isFlipped) {
        boardEl.classList.add('flipped');
    } else {
        boardEl.classList.remove('flipped');
    }
}
