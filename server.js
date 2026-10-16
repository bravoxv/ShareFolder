const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const chokidar = require('chokidar');
const { spawn } = require('child_process');
const archiver = require('archiver');
const unzipper = require('unzipper');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
  maxHttpBufferSize: 1e8 // 100 MB para subida de archivos si es necesario
});

const PORT = process.env.PORT || 4000;
const WORKSPACE_DIR = path.resolve(__dirname, 'shared_workspace');

if (!fs.existsSync(WORKSPACE_DIR)) {
  fs.mkdirSync(WORKSPACE_DIR, { recursive: true });
}

// Configuración de Seguridad y Estado Global
let ROOM_PASSWORD = process.env.ROOM_PASSWORD || '1234';
let currentHostId = null;
let currentHostName = null;
const connectedUsers = new Map(); // socket.id -> { username, isHost, ip }
const fileLocks = new Map(); // relativeFilePath -> { username, socketId, reason, timestamp }
const runningProcesses = new Map(); // id -> { process, user, file }
let pendingTransfer = null; // { fromSocketId, toSocketId, requireReset, timeout }

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// API para descargar el snapshot completo en formato ZIP
app.get('/api/download-snapshot', (req, res) => {
  const archive = archiver('zip', { zlib: { level: 9 } });
  res.attachment('workspace-snapshot.zip');
  archive.pipe(res);
  archive.directory(WORKSPACE_DIR, false);
  archive.finalize();
});

// Función auxiliar para leer estructura de carpetas
function getFileTree(dir, rootDir = dir) {
  const items = fs.readdirSync(dir, { withFileTypes: true });
  return items.map(item => {
    const fullPath = path.join(dir, item.name);
    const relPath = path.relative(rootDir, fullPath).replace(/\\/g, '/');
    const isDir = item.isDirectory();
    return {
      name: item.name,
      path: relPath,
      isDir: isDir,
      size: isDir ? 0 : fs.statSync(fullPath).size,
      children: isDir ? getFileTree(fullPath, rootDir) : null,
      lock: fileLocks.get(relPath) || null
    };
  });
}

function broadcastFileTree() {
  try {
    const tree = getFileTree(WORKSPACE_DIR);
    io.emit('file-tree', tree);
  } catch (err) {
    console.error('Error al generar árbol:', err.message);
  }
}

function broadcastUsers() {
  const users = Array.from(connectedUsers.values()).map(u => ({
    username: u.username,
    isHost: u.isHost,
    socketId: u.socketId
  }));
  io.emit('users-update', {
    users,
    currentHostName,
    currentHostId
  });
}

// Watcher de cambios en disco para sincronización
const watcher = chokidar.watch(WORKSPACE_DIR, {
  ignored: /(^|[\/\\])\../,
  persistent: true,
  ignoreInitial: true
});

watcher.on('all', (event, filePath) => {
  const relPath = path.relative(WORKSPACE_DIR, filePath).replace(/\\/g, '/');
  io.emit('fs-event', { event, path: relPath });
  broadcastFileTree();
});

io.on('connection', (socket) => {
  console.log('Cliente conectado:', socket.id);

  // 1. Autenticación con contraseña
  socket.on('auth', ({ username, password }) => {
    if (password !== ROOM_PASSWORD) {
      return socket.emit('auth-error', 'Contraseña incorrecta');
    }

    const isFirstUser = connectedUsers.size === 0;
    const isHost = isFirstUser;

    if (isHost) {
      currentHostId = socket.id;
      currentHostName = username;
    }

    connectedUsers.set(socket.id, {
      socketId: socket.id,
      username,
      isHost
    });

    socket.emit('auth-success', {
      isHost,
      currentHostName,
      username
    });

    broadcastUsers();
    broadcastFileTree();
    socket.emit('locks-update', Array.from(fileLocks.entries()));

    io.emit('system-message', `${username} se ha conectado.`);
  });

  // 2. Solicitud de Bloqueo / Liberación de archivo
  socket.on('request-lock', ({ filePath, reason }) => {
    const user = connectedUsers.get(socket.id);
    if (!user) return;

    const existingLock = fileLocks.get(filePath);
    if (existingLock && existingLock.socketId !== socket.id) {
      return socket.emit('lock-error', {
        filePath,
        message: `El archivo ya está siendo ocupado por ${existingLock.username} (${existingLock.reason || 'en uso'}).`
      });
    }

    fileLocks.set(filePath, {
      username: user.username,
      socketId: socket.id,
      reason: reason || 'Modificando/Ejecutando',
      timestamp: Date.now()
    });

    io.emit('locks-update', Array.from(fileLocks.entries()));
    broadcastFileTree();
    socket.emit('lock-granted', { filePath });
  });

  socket.on('release-lock', ({ filePath }) => {
    const existingLock = fileLocks.get(filePath);
    if (existingLock && existingLock.socketId === socket.id) {
      fileLocks.delete(filePath);
      io.emit('locks-update', Array.from(fileLocks.entries()));
      broadcastFileTree();
    }
  });

  // 3. Ejecución de Terminal / Comando (.bat, .cmd, .exe, etc.)
  socket.on('run-command', ({ filePath, args }) => {
    const user = connectedUsers.get(socket.id);
    if (!user) return;

    // Verificar si el archivo está bloqueado por otro usuario
    const lock = fileLocks.get(filePath);
    if (lock && lock.socketId !== socket.id) {
      return socket.emit('terminal-output', {
        error: true,
        text: `[ERROR] Este archivo está siendo ocupado por ${lock.username} (${lock.reason}).`
      });
    }

    // Auto-bloquear durante la ejecución
    fileLocks.set(filePath, {
      username: user.username,
      socketId: socket.id,
      reason: 'Ejecutando en Terminal',
      timestamp: Date.now()
    });
    io.emit('locks-update', Array.from(fileLocks.entries()));
    broadcastFileTree();

    const fullPath = path.join(WORKSPACE_DIR, filePath);
    const proc = spawn(fullPath, args || [], {
      cwd: path.dirname(fullPath),
      shell: true
    });

    const procId = `${socket.id}_${Date.now()}`;
    runningProcesses.set(procId, { proc, user: user.username, filePath });

    io.emit('terminal-output', {
      text: `[SISTEMA] ${user.username} inició la ejecución de: ${filePath}\n`
    });

    proc.stdout.on('data', (data) => {
      io.emit('terminal-output', { text: data.toString() });
    });

    proc.stderr.on('data', (data) => {
      io.emit('terminal-output', { text: data.toString(), isErr: true });
    });

    proc.on('close', (code) => {
      io.emit('terminal-output', {
        text: `\n[SISTEMA] El proceso ${filePath} finalizó con código ${code}\n`
      });
      runningProcesses.delete(procId);

      // Si nadie más lo retiene, liberar el lock
      if (fileLocks.get(filePath)?.socketId === socket.id) {
        fileLocks.delete(filePath);
        io.emit('locks-update', Array.from(fileLocks.entries()));
        broadcastFileTree();
      }
    });
  });

  // 4. Transferencia de Autoridad de Host
  socket.on('transfer-host-request', ({ targetSocketId, requireReset }) => {
    const sender = connectedUsers.get(socket.id);
    const target = connectedUsers.get(targetSocketId);

    if (!sender || !sender.isHost) {
      return socket.emit('system-message', 'No tienes permisos de host para transferir autoridad.');
    }
    if (!target) {
      return socket.emit('system-message', 'El usuario seleccionado ya no está disponible.');
    }

    pendingTransfer = {
      fromSocketId: socket.id,
      fromUsername: sender.username,
      toSocketId: targetSocketId,
      toUsername: target.username,
      requireReset: !!requireReset
    };

    io.to(targetSocketId).emit('host-transfer-proposal', {
      fromUsername: sender.username,
      requireReset: !!requireReset
    });

    socket.emit('system-message', `Solicitud de transferencia enviada a ${target.username}. Esperando confirmación...`);
  });

  socket.on('transfer-host-respond', ({ accept }) => {
    if (!pendingTransfer || pendingTransfer.toSocketId !== socket.id) return;

    const fromUser = connectedUsers.get(pendingTransfer.fromSocketId);
    const toUser = connectedUsers.get(pendingTransfer.toSocketId);

    if (!accept) {
      if (fromUser) {
        io.to(fromUser.socketId).emit('system-message', `${toUser ? toUser.username : 'El usuario'} rechazó la transferencia de host.`);
      }
      pendingTransfer = null;
      return;
    }

    // Aceptó la transferencia
    if (fromUser) fromUser.isHost = false;
    if (toUser) toUser.isHost = true;

    currentHostId = toUser.socketId;
    currentHostName = toUser.username;

    const shouldReset = pendingTransfer.requireReset;
    pendingTransfer = null;

    if (shouldReset) {
      io.emit('system-message', `[ALERTA] ${toUser.username} es el nuevo Host y se ha solicitado REINICIAR los archivos del workspace.`);
      // En una arquitectura completa se puede reinstanciar la carpeta base o limpiar temporales
    } else {
      io.emit('system-message', `[MANDO TRANSFERIDO] ${toUser.username} es ahora el nuevo Host oficial del servidor.`);
    }

    broadcastUsers();
  });

  // 5. Crear archivo o carpeta
  socket.on('create-file', ({ relPath, isDir, content }) => {
    const fullPath = path.join(WORKSPACE_DIR, relPath);
    try {
      if (isDir) {
        fs.mkdirSync(fullPath, { recursive: true });
      } else {
        fs.writeFileSync(fullPath, content || '', 'utf8');
      }
      broadcastFileTree();
    } catch (err) {
      socket.emit('system-message', `Error al crear: ${err.message}`);
    }
  });

  // 6. Desconexión y Failover automático de Host
  socket.on('disconnect', () => {
    const user = connectedUsers.get(socket.id);
    if (!user) return;

    // Liberar locks que pertenecían al usuario desconectado
    for (const [fPath, lInfo] of fileLocks.entries()) {
      if (lInfo.socketId === socket.id) {
        fileLocks.delete(fPath);
      }
    }

    connectedUsers.delete(socket.id);
    io.emit('system-message', `${user.username} se ha desconectado.`);

    // Si el usuario era el HOST, elegir un nuevo host automáticamente si quedan usuarios
    if (user.isHost) {
      if (connectedUsers.size > 0) {
        const nextUser = connectedUsers.values().next().value;
        nextUser.isHost = true;
        currentHostId = nextUser.socketId;
        currentHostName = nextUser.username;
        io.emit('system-message', `[FAILOVER] El host se desconectó. Se transfirió el mando automáticamente a ${nextUser.username}.`);
      } else {
        currentHostId = null;
        currentHostName = null;
      }
    }

    broadcastUsers();
    broadcastFileTree();
    io.emit('locks-update', Array.from(fileLocks.entries()));
  });
});

server.listen(PORT, () => {
  console.log(`===============================================`);
  console.log(` Servidor Sharefolder iniciado en http://localhost:${PORT}`);
  console.log(` Directorio compartido: ${WORKSPACE_DIR}`);
  console.log(` Contraseña de acceso por defecto: ${ROOM_PASSWORD}`);
  console.log(`===============================================`);
});
