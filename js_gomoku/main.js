// /var/www/html/js_gomoku/main.js
let currentBoard = Array(15).fill(null).map(() => Array(15).fill(null));
let currentTurn = 'black'; 
let isPvEMode = false;
let socket;
let roomId = null;
let myColor = null; 
let historyStack = [];
let isGameOver = false;

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

    socket = io({ auth: { token: token } });

    socket.on('move', (data) => {
        performMoveAction(data.r, data.c, true);
    });

    // --- 悔棋相關的 Socket 事件 ---
    socket.on('undoRequested', () => { showUndoPrompt(); });

    socket.on('undoTimeout', () => { 
        closeUndoPrompt(); 
        showToast("⏳ 悔棋請求已超時"); 
    });

    socket.on('undoAgreed', () => {
        if (historyStack.length < 2) return;
        historyStack.pop();
        const lastState = historyStack.pop();
        currentBoard = lastState.board;
        currentTurn = lastState.turn;
        isGameOver = false; 
        drawAllPieces();
        document.getElementById('turnInfo').innerText = "當前回合：" + (currentTurn === 'black' ? "黑方" : "白方");
    });

    socket.on('undoRejected', (msg) => { showToast(msg || "❌ 對手拒絕了你的悔棋請求。"); });

    socket.on('error', (msg) => { showToast("錯誤提示: " + msg); });

    startLocal(true);
}

function logout() {
    localStorage.clear();
    window.location.reload();
}

function drawGrid() {
    const gridLayer = document.getElementById('grid-layer');
    if (!gridLayer) return;
    let html = '';
    for (let i = 0; i < 15; i++) {
        let pos = 15 + i * 30;
        html += `<line x1="15" y1="${pos}" x2="435" y2="${pos}" />`;
        html += `<line x1="${pos}" y1="15" x2="${pos}" y2="435" />`;
    }
    gridLayer.innerHTML = html;
}

function drawAllPieces() {
    const layer = document.getElementById('pieces-layer');
    if (!layer) return;
    layer.innerHTML = '';
    currentBoard.forEach((row, r) => {
        row.forEach((cell, c) => {
            if (cell) {
                const p = document.createElement('div');
                p.className = 'piece ' + cell;
                p.style.left = (15 + c * 30) + 'px';
                p.style.top = (15 + r * 30) + 'px';
                layer.appendChild(p);
            }
        });
    });
}

function onGridCellClick(r, c) {
    if (isGameOver) {
        return showToast("📜 對局已結束，請重新開局！");
    }
    if (!isPvEMode && roomId && myColor && myColor !== currentTurn) {
        return showToast("⏳ 請等待對方落子");
    }
    if (isPvEMode && currentTurn === 'white') {
        return; 
    }
    if (currentBoard[r][c] !== null) return;
    
    performMoveAction(r, c);
}

function performMoveAction(r, c, isRemote = false) {
    historyStack.push({
        board: JSON.parse(JSON.stringify(currentBoard)),
        turn: currentTurn
    });
    
    currentBoard[r][c] = currentTurn;
    drawAllPieces();

    if (typeof checkGomokuWin === 'function' && checkGomokuWin(currentBoard, r, c, currentTurn)) {
        isGameOver = true;
        const winnerText = currentTurn === 'black' ? "黑方" : "白方";
        showToast(`🎉 絕殺！恭喜 ${winnerText} 獲勝！`, 5000);
        document.getElementById('turnInfo').innerHTML = `<span style="color:#a31d1d;">【 ${winnerText} 勝出 】</span>`;
        return; 
    }

    currentTurn = (currentTurn === 'black' ? 'white' : 'black');
    const turnText = currentTurn === 'black' ? "黑方" : "白方";
    document.getElementById('turnInfo').innerText = "當前回合：" + turnText;
    
    if (!isRemote && roomId && !isPvEMode) {
        socket.emit('move', { roomId, r, c });
    }
    
    if (isPvEMode && currentTurn === 'white' && !isGameOver) {
        document.getElementById('turnInfo').innerText = "機關思考中...";
        setTimeout(() => {
            if (typeof getBestGomokuMove === 'function') {
                const move = getBestGomokuMove(currentBoard, 'white');
                if (move) performMoveAction(move.r, move.c);
            }
        }, 500);
    }
}

function executeUndo() {
    if (isGameOver) {
        return showToast("📜 勝負已分，無法悔棋。");
    }
    if (!isPvEMode && roomId) {
        socket.emit('requestUndo', { roomId });
        showToast("⏳ 已發送悔棋請求，等待對方同意...");
        return;
    }
    if (isPvEMode) {
        if (historyStack.length < 2) return showToast("📜 已至開局，無棋可悔。");
        historyStack.pop(); 
        const lastState = historyStack.pop(); 
        currentBoard = lastState.board;
        currentTurn = lastState.turn;
    } else {
        if (historyStack.length < 1) return showToast("📜 已至開局，無棋可悔。");
        const lastState = historyStack.pop();
        currentBoard = lastState.board;
        currentTurn = lastState.turn;
    }
    drawAllPieces();
    document.getElementById('turnInfo').innerText = "當前回合：" + (currentTurn === 'black' ? "黑方" : "白方");
    showToast("↩️ 弦音迴響，悔棋成功。");
}

function startLocal(isInit = false) {
    isPvEMode = false;
    roomId = null;
    myColor = null; 
    currentTurn = 'black';
    isGameOver = false;
    currentBoard = Array(15).fill(null).map(() => Array(15).fill(null));
    historyStack = [];
    drawAllPieces();
    document.getElementById('roomStatus').innerText = "未進入房間";
    document.getElementById('turnInfo').innerText = "當前回合：黑方";
}

function sweepBoard() {
    startLocal(true);
    document.getElementById('roomInput').value = '';
    showToast("✨ 拂拭枰台，棋局已重置。");
}

function createRoom() {
    if (!socket) return showToast("❌ 未建立連線");
    roomId = Math.floor(Math.random() * 900000 + 100000).toString();
    socket.emit('createRoom', roomId);
    myColor = 'black'; 
    isPvEMode = false;
    isGameOver = false;
    currentBoard = Array(15).fill(null).map(() => Array(15).fill(null));
    historyStack = [];
    drawAllPieces();
    document.getElementById('roomStatus').innerText = "房間：" + roomId + " (執黑)";
    document.getElementById('roomInput').value = roomId;
    showToast("🏠 房間已創建，等待對手加入...");
}

function joinRoom() {
    if (!socket) return showToast("❌ 未建立連線");
    roomId = document.getElementById('roomInput').value;
    if (!roomId) return showToast("請輸入房間號");
    socket.emit('joinRoom', roomId);
    myColor = 'white';
    isPvEMode = false;
    isGameOver = false;
    currentBoard = Array(15).fill(null).map(() => Array(15).fill(null));
    historyStack = [];
    drawAllPieces();
    document.getElementById('roomStatus').innerText = "房間：" + roomId + " (執白)";
    showToast("🔗 已加入房間！");
}

function startPvE() { 
    isPvEMode = true; 
    roomId = null;
    myColor = 'black';
    currentTurn = 'black';
    isGameOver = false;
    currentBoard = Array(15).fill(null).map(() => Array(15).fill(null));
    historyStack = [];
    drawAllPieces();
    document.getElementById('roomStatus').innerText = "【 機關對弈模式 】";
    document.getElementById('turnInfo').innerText = "當前回合：黑方（少俠請）";
    showToast("🤖 人機模式已開啟，執黑先行！"); 
}
