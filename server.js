const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const PORT = process.env.PORT || 3000;
const TICK_RATE = 60;
const DT = 1 / TICK_RATE;

const WORLD = {
  width: 1000,
  height: 700,
  tankRadius: 18,
  tankSpeed: 220,
  rotateSpeed: 3.2,
  bulletSpeed: 520,
  bulletRadius: 4,
  bulletLife: 1.6,
  shootCooldown: 0.45,
  maxHp: 100,
  hitDamage: 20,
  obstacles: [
    { x: 300, y: 120, w: 120, h: 260 },
    { x: 580, y: 320, w: 110, h: 260 },
    { x: 440, y: 230, w: 120, h: 60 },
    { x: 140, y: 500, w: 220, h: 80 },
    { x: 700, y: 80, w: 180, h: 90 }
  ]
};

/** @type {Map<string, {id:string, players:any[], bullets:any[], state:string, winner:null|number, createdAt:number}>} */
const rooms = new Map();

function createRoom(roomId) {
  return {
    id: roomId,
    players: [],
    bullets: [],
    state: 'waiting',
    winner: null,
    createdAt: Date.now()
  };
}

function spawnForIndex(index) {
  if (index === 0) return { x: 120, y: WORLD.height / 2, angle: 0 };
  return { x: WORLD.width - 120, y: WORLD.height / 2, angle: Math.PI };
}

function makePlayer(socketId, nickname, index) {
  const spawn = spawnForIndex(index);
  return {
    socketId,
    nickname: nickname?.trim() || `Player ${index + 1}`,
    index,
    x: spawn.x,
    y: spawn.y,
    angle: spawn.angle,
    hp: WORLD.maxHp,
    inputs: { up: false, down: false, left: false, right: false },
    wantShoot: false,
    shootCd: 0
  };
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function circleRectHit(cx, cy, r, rect) {
  const nearestX = clamp(cx, rect.x, rect.x + rect.w);
  const nearestY = clamp(cy, rect.y, rect.y + rect.h);
  const dx = cx - nearestX;
  const dy = cy - nearestY;
  return dx * dx + dy * dy < r * r;
}

function collidesObstacle(x, y, radius) {
  return WORLD.obstacles.some((o) => circleRectHit(x, y, radius, o));
}

function resolveTankMove(player, nx, ny) {
  const r = WORLD.tankRadius;
  const x = clamp(nx, r, WORLD.width - r);
  const y = clamp(ny, r, WORLD.height - r);

  if (!collidesObstacle(x, player.y, r)) {
    player.x = x;
  }
  if (!collidesObstacle(player.x, y, r)) {
    player.y = y;
  }
}

function makeBullet(player) {
  const dirX = Math.cos(player.angle);
  const dirY = Math.sin(player.angle);
  const offset = WORLD.tankRadius + 6;
  return {
    ownerSocketId: player.socketId,
    x: player.x + dirX * offset,
    y: player.y + dirY * offset,
    vx: dirX * WORLD.bulletSpeed,
    vy: dirY * WORLD.bulletSpeed,
    life: WORLD.bulletLife
  };
}

function playersAlive(room) {
  return room.players.filter((p) => p.hp > 0);
}

function snapshot(room) {
  return {
    world: {
      width: WORLD.width,
      height: WORLD.height,
      tankRadius: WORLD.tankRadius,
      bulletRadius: WORLD.bulletRadius,
      maxHp: WORLD.maxHp,
      obstacles: WORLD.obstacles
    },
    room: {
      id: room.id,
      state: room.state,
      winner: room.winner
    },
    players: room.players.map((p) => ({
      socketId: p.socketId,
      nickname: p.nickname,
      index: p.index,
      x: p.x,
      y: p.y,
      angle: p.angle,
      hp: p.hp
    })),
    bullets: room.bullets.map((b) => ({ x: b.x, y: b.y }))
  };
}

function removePlayer(socketId) {
  for (const [roomId, room] of rooms) {
    const idx = room.players.findIndex((p) => p.socketId === socketId);
    if (idx === -1) continue;

    room.players.splice(idx, 1);
    room.bullets = room.bullets.filter((b) => b.ownerSocketId !== socketId);

    if (room.players.length === 0) {
      rooms.delete(roomId);
      continue;
    }

    // re-index and respawn remaining players for clean state
    room.players.forEach((p, i) => {
      p.index = i;
      const spawn = spawnForIndex(i);
      p.x = spawn.x;
      p.y = spawn.y;
      p.angle = spawn.angle;
      p.hp = WORLD.maxHp;
    });

    room.state = room.players.length === 2 ? 'running' : 'waiting';
    room.winner = null;

    io.to(roomId).emit('room-update', snapshot(room));
    break;
  }
}

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

io.on('connection', (socket) => {
  socket.on('create-room', ({ roomId, nickname }) => {
    const id = (roomId || '').trim().toUpperCase();
    if (!id) {
      socket.emit('join-error', '房间号不能为空');
      return;
    }
    if (rooms.has(id)) {
      socket.emit('join-error', '房间已存在，请换一个房间号');
      return;
    }

    const room = createRoom(id);
    room.players.push(makePlayer(socket.id, nickname, 0));
    rooms.set(id, room);

    socket.join(id);
    socket.emit('joined-room', { roomId: id, yourId: socket.id });
    io.to(id).emit('room-update', snapshot(room));
  });

  socket.on('join-room', ({ roomId, nickname }) => {
    const id = (roomId || '').trim().toUpperCase();
    const room = rooms.get(id);
    if (!room) {
      socket.emit('join-error', '房间不存在');
      return;
    }
    if (room.players.length >= 2) {
      socket.emit('join-error', '房间已满（最多 2 人）');
      return;
    }

    room.players.push(makePlayer(socket.id, nickname, room.players.length));
    room.state = room.players.length === 2 ? 'running' : 'waiting';
    room.winner = null;

    socket.join(id);
    socket.emit('joined-room', { roomId: id, yourId: socket.id });
    io.to(id).emit('room-update', snapshot(room));
  });

  socket.on('input', ({ up, down, left, right, shoot }) => {
    for (const room of rooms.values()) {
      const p = room.players.find((pl) => pl.socketId === socket.id);
      if (!p) continue;
      p.inputs.up = !!up;
      p.inputs.down = !!down;
      p.inputs.left = !!left;
      p.inputs.right = !!right;
      p.wantShoot = !!shoot;
      break;
    }
  });

  socket.on('restart', () => {
    for (const room of rooms.values()) {
      const exists = room.players.some((pl) => pl.socketId === socket.id);
      if (!exists) continue;
      if (room.players.length < 2) return;

      room.players.forEach((p) => {
        const spawn = spawnForIndex(p.index);
        p.x = spawn.x;
        p.y = spawn.y;
        p.angle = spawn.angle;
        p.hp = WORLD.maxHp;
        p.shootCd = 0;
      });
      room.bullets = [];
      room.state = 'running';
      room.winner = null;
      io.to(room.id).emit('room-update', snapshot(room));
      break;
    }
  });

  socket.on('disconnect', () => removePlayer(socket.id));
});

setInterval(() => {
  for (const room of rooms.values()) {
    if (room.players.length < 1) continue;

    if (room.state === 'running') {
      for (const p of room.players) {
        if (p.hp <= 0) continue;

        const turn = (p.inputs.right ? 1 : 0) - (p.inputs.left ? 1 : 0);
        p.angle += turn * WORLD.rotateSpeed * DT;

        const move = (p.inputs.up ? 1 : 0) - (p.inputs.down ? 1 : 0);
        if (move !== 0) {
          const speed = move * WORLD.tankSpeed;
          const nx = p.x + Math.cos(p.angle) * speed * DT;
          const ny = p.y + Math.sin(p.angle) * speed * DT;
          resolveTankMove(p, nx, ny);
        }

        p.shootCd -= DT;
        if (p.wantShoot && p.shootCd <= 0) {
          room.bullets.push(makeBullet(p));
          p.shootCd = WORLD.shootCooldown;
        }
      }

      const alivePlayers = room.players.filter((p) => p.hp > 0);
      for (const b of room.bullets) {
        b.life -= DT;
        b.x += b.vx * DT;
        b.y += b.vy * DT;

        const out =
          b.x < 0 || b.x > WORLD.width || b.y < 0 || b.y > WORLD.height || b.life <= 0;
        if (out) {
          b.dead = true;
          continue;
        }

        if (collidesObstacle(b.x, b.y, WORLD.bulletRadius)) {
          b.dead = true;
          continue;
        }

        for (const p of alivePlayers) {
          if (p.socketId === b.ownerSocketId) continue;
          const dx = b.x - p.x;
          const dy = b.y - p.y;
          const rr = WORLD.tankRadius + WORLD.bulletRadius;
          if (dx * dx + dy * dy <= rr * rr) {
            p.hp = Math.max(0, p.hp - WORLD.hitDamage);
            b.dead = true;
            break;
          }
        }
      }

      room.bullets = room.bullets.filter((b) => !b.dead);

      const alive = playersAlive(room);
      if (alive.length <= 1 && room.players.length === 2) {
        room.state = 'finished';
        room.winner = alive.length === 1 ? alive[0].index : null;
      }
    }

    io.to(room.id).emit('room-update', snapshot(room));
  }
}, 1000 / TICK_RATE);

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Tank Battle server running on http://localhost:${PORT}`);
});
