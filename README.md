# tank-battle-online

一个可运行的**浏览器双人在线坦克大战 MVP**：Node.js + Socket.IO + Canvas。

## 功能清单（MVP）

- 房间机制：创建房间 / 加入房间（最多 2 人）
- 双人实时对战：
  - `W/S` 前后移动
  - `A/D` 旋转坦克
  - `J` 开火
- 子弹碰撞：
  - 命中玩家扣血（每发 `-20 HP`）
  - 碰到障碍物或边界消失
- 生命值与胜负判定：血量归零即失败
- 简易障碍地图（Canvas 渲染）
- 再来一局（重置状态）

---

## 运行环境

- Node.js 18+（当前机器 Node 22 可直接运行）

## 一键启动

在项目目录执行：

```bash
cd /Users/shirley/.openclaw/workspace/tank-battle-online && npm install && npm start
```

启动后默认监听：`0.0.0.0:3000`

---

## 使用方式

1. 打开页面后输入房间号（如 `ROOM1`）
2. 玩家 A 点击“创建房间”
3. 玩家 B 在另一浏览器/设备输入同房间号点击“加入房间”
4. 两人进入后自动开始对战

---

## 本机访问

同一台电脑：

- <http://localhost:3000>
- 或 <http://127.0.0.1:3000>

## 局域网访问

先查看本机局域网 IP（macOS 示例）：

```bash
ipconfig getifaddr en0
```

假设输出 `192.168.31.25`，则局域网内其他设备访问：

- <http://192.168.31.25:3000>

> 注意：需保证电脑与手机/另一台电脑在同一局域网，且系统防火墙允许 3000 端口访问。

---

## 项目结构

```text
tank-battle-online/
├── package.json
├── server.js
└── public/
    ├── index.html
    ├── style.css
    └── main.js
```
