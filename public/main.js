const socket = io();

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const statusEl = document.getElementById('status');
const nicknameEl = document.getElementById('nickname');
const roomIdEl = document.getElementById('roomId');

const keys = { up: false, down: false, left: false, right: false, shoot: false };
let myId = null;
let joinedRoomId = null;
let game = null;

function setStatus(text, isError = false) {
  statusEl.textContent = text;
  statusEl.style.color = isError ? '#fca5a5' : '#93c5fd';
}

function normalizedRoomId() {
  return (roomIdEl.value || '').trim().toUpperCase();
}

document.getElementById('createBtn').onclick = () => {
  const roomId = normalizedRoomId();
  socket.emit('create-room', { roomId, nickname: nicknameEl.value });
};

document.getElementById('joinBtn').onclick = () => {
  const roomId = normalizedRoomId();
  socket.emit('join-room', { roomId, nickname: nicknameEl.value });
};

document.getElementById('restartBtn').onclick = () => {
  socket.emit('restart');
};

socket.on('joined-room', ({ roomId, yourId }) => {
  myId = yourId;
  joinedRoomId = roomId;
  setStatus(`已加入房间 ${roomId}`);
});

socket.on('join-error', (msg) => setStatus(msg, true));
socket.on('room-update', (snapshot) => {
  game = snapshot;
  render();
});

function keyToInput(code, down) {
  if (code === 'KeyW') keys.up = down;
  if (code === 'KeyS') keys.down = down;
  if (code === 'KeyA') keys.left = down;
  if (code === 'KeyD') keys.right = down;
  if (code === 'KeyJ') keys.shoot = down;
  socket.emit('input', keys);
}

window.addEventListener('keydown', (e) => {
  if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyJ'].includes(e.code)) {
    e.preventDefault();
    keyToInput(e.code, true);
  }
});

window.addEventListener('keyup', (e) => {
  if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyJ'].includes(e.code)) {
    e.preventDefault();
    keyToInput(e.code, false);
  }
});

function drawTank(p, world, isMe) {
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(p.angle);

  ctx.fillStyle = isMe ? '#22c55e' : '#f97316';
  ctx.beginPath();
  ctx.arc(0, 0, world.tankRadius, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#111827';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(world.tankRadius + 12, 0);
  ctx.stroke();

  ctx.restore();

  const hpRatio = Math.max(0, p.hp) / world.maxHp;
  const barW = 54;
  const barH = 7;
  const x = p.x - barW / 2;
  const y = p.y - world.tankRadius - 16;

  ctx.fillStyle = '#334155';
  ctx.fillRect(x, y, barW, barH);
  ctx.fillStyle = hpRatio > 0.4 ? '#22c55e' : '#ef4444';
  ctx.fillRect(x, y, barW * hpRatio, barH);

  ctx.fillStyle = '#e2e8f0';
  ctx.font = '12px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(p.nickname, p.x, y - 4);
}

function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (!game) {
    ctx.fillStyle = '#94a3b8';
    ctx.font = '24px sans-serif';
    ctx.fillText('请先创建/加入房间', 350, 360);
    return;
  }

  const { world, players, bullets, room } = game;

  ctx.fillStyle = '#0b1020';
  ctx.fillRect(0, 0, world.width, world.height);

  ctx.fillStyle = '#334155';
  for (const o of world.obstacles) {
    ctx.fillRect(o.x, o.y, o.w, o.h);
  }

  for (const b of bullets) {
    ctx.fillStyle = '#facc15';
    ctx.beginPath();
    ctx.arc(b.x, b.y, world.bulletRadius, 0, Math.PI * 2);
    ctx.fill();
  }

  for (const p of players) {
    drawTank(p, world, p.socketId === myId);
  }

  const me = players.find((p) => p.socketId === myId);
  if (room.state === 'waiting') {
    setStatus(`房间 ${joinedRoomId || room.id}：等待另一位玩家加入...`);
  } else if (room.state === 'running') {
    setStatus(`房间 ${room.id}：战斗中${me ? ` | 你的血量 ${me.hp}` : ''}`);
  } else if (room.state === 'finished') {
    if (room.winner === null) {
      setStatus(`房间 ${room.id}：平局，点击“再来一局”重开`);
    } else {
      const winner = players.find((p) => p.index === room.winner);
      setStatus(`房间 ${room.id}：${winner?.nickname || '某位玩家'} 获胜，点击“再来一局”`);
    }
  }
}

render();
