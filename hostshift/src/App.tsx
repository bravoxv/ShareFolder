import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { 
  Users, 
  Power, 
  ShieldAlert, 
  Copy, 
  Check, 
  Folder, 
  FolderOpen, 
  FileText, 
  Save, 
  ArrowLeft, 
  ShieldCheck, 
  Search, 
  RefreshCw,
  Terminal,
  Activity,
  Send,
  SquareTerminal,
  Globe,
  ChevronLeft,
  ChevronRight,
  Share2
} from 'lucide-react';
import { Role } from './types/models';
import { UserDocument } from './types/schema';
import { AuthGoogleModal } from './components/AuthGoogleModal';
import { ShareFilesModal } from './components/ShareFilesModal';

export function App() {
  const [role, setRole] = useState<Role>('owner');
  const [currentUser, setCurrentUser] = useState<UserDocument | null>(() => {
    const saved = localStorage.getItem('hostshift_user');
    return saved ? JSON.parse(saved) : null;
  });
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [serverStatus, setServerStatus] = useState<'offline' | 'starting' | 'online' | 'saving'>('offline');
  const [epoch, setEpoch] = useState<number>(1);
  const [tunnelAddress] = useState<string>('play.hostshift.gg:25565');
  const [currentHostName, setCurrentHostName] = useState<string | null>(null);

  // Navegación animada entre pestañas centrales en la MISMA ventana: 'folder' vs 'console' vs 'roles' vs 'playit'
  const [activeMainTab, setActiveMainTab] = useState<'folder' | 'console' | 'roles' | 'playit'>('folder');

  // Terminal / Consola del servidor
  const [serverTerminalLogs, setServerTerminalLogs] = useState<string[]>([
    "HostShift Console - Salida estándar en vivo del juego."
  ]);
  const [terminalInput, setTerminalInput] = useState<string>('');

  // SEGUNDA TERMINAL: TÚNEL PLAYIT.GG (Opcional con panel desplegable)
  const [showPlayitPanel, setShowPlayitPanel] = useState<boolean>(false);
  const [playitExePath, setPlayitExePath] = useState<string>(() => {
    return localStorage.getItem('hostshift_playit_exe') || '';
  });
  const [playitStatus, setPlayitStatus] = useState<'stopped' | 'running'>('stopped');
  const [playitTerminalLogs, setPlayitTerminalLogs] = useState<string[]>([
    "HostShift Playit.gg Console - Listo para iniciar el túnel."
  ]);
  const [playitTerminalInput, setPlayitTerminalInput] = useState<string>('');

  // Datos del grupo
  const [groupName, setGroupName] = useState<string>('Los Pibes Gaming');
  const inviteCode = 'hs-invite-9482-xy';
  const [copiedInvite, setCopiedInvite] = useState<boolean>(false);

  // Carpeta de servidor y archivo iniciador seleccionable
  const [serverFolder, setServerFolder] = useState<string>(() => {
    return localStorage.getItem('hostshift_server_folder') || '';
  });
  const [launcherFile, setLauncherFile] = useState<string>(() => {
    return localStorage.getItem('hostshift_launcher_file') || '';
  });
  const [currentSubDir, setCurrentSubDir] = useState<string>('');
  const [selectedFile, setSelectedFile] = useState<{ name: string; path: string; size: number; content: string } | null>(null);
  const [fileContent, setFileContent] = useState<string>('');
  const [isSaved, setIsSaved] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');

  const [mockFiles, setMockFiles] = useState([
    { name: 'server_config.json', is_dir: false, size: 840, content: '{\n  "server_name": "HostShift Dedicado",\n  "max_players": 12,\n  "autosave_interval": 300\n}' },
    { name: 'settings.ini', is_dir: false, size: 1250, content: '[Network]\nport=25565\nmax_tick_rate=60\npvp=true\nwhitelist=true' },
    { name: 'whitelist.txt', is_dir: false, size: 48, content: 'Matias\nLucas_Gamer\nAgustin99' },
    { name: 'saved_worlds', is_dir: true, size: 0, content: '' },
    { name: 'mods', is_dir: true, size: 0, content: '' },
    { name: 'logs', is_dir: true, size: 0, content: '' }
  ]);

  const [logs, setLogs] = useState<string[]>([
    "[Sistema] HostShift v0.1.0 inicializado.",
    "[P2P] Carpeta de servidor vinculada a C:\\Servidores\\MiServidor."
  ]);

  const copyInvite = () => {
    navigator.clipboard.writeText(`https://hostshift.gg/join/${inviteCode}`);
    setCopiedInvite(true);
    setTimeout(() => setCopiedInvite(false), 2000);
  };

  // Cargar directorio real desde el disco de Windows mediante Tauri
  const loadRealDirectory = async (folderPath: string, sub: string = '') => {
    if (!folderPath.trim()) {
      setMockFiles([]);
      return;
    }

    try {
      const items = await invoke<any[]>('list_directory_contents', {
        basePath: folderPath,
        subDir: sub
      });
      setMockFiles(items.map(item => ({
        name: item.name,
        is_dir: item.is_dir,
        size: item.size_bytes,
        content: ''
      })));
      setCurrentSubDir(sub);
      setLogs(prev => [...prev, `[Folder] Carpeta leída con éxito: ${folderPath}${sub ? ' / ' + sub : ''} (${items.length} elementos)`]);
    } catch (err: any) {
      console.warn("Error al leer directorio real:", err);
      setLogs(prev => [...prev, `[Aviso] ${typeof err === 'string' ? err : 'No se pudo leer la carpeta física.'}`]);
    }
  };

  useEffect(() => {
    if (serverFolder) {
      loadRealDirectory(serverFolder, '');
    }

    // Escuchar la salida estándar (stdout/stderr) del servidor en vivo
    const unlistenServer = listen<string>('server-log', (event) => {
      const clean = event.payload
        .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
        .replace(/\[m$/g, '')
        .replace(/\[\d+m/g, '');
      setServerTerminalLogs((prev) => [...prev, clean]);
    });

    // Escuchar la consola del túnel playit.gg en vivo
    const unlistenPlayit = listen<string>('playit-log', (event) => {
      const clean = event.payload
        .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
        .replace(/\[m$/g, '')
        .replace(/\[\d+m/g, '');
      setPlayitTerminalLogs((prev) => [...prev, clean]);
    });

    // Verificar si el servidor o playit ya estaban corriendo al abrir/reiniciar la app
    (async () => {
      try {
        const isServerRunning = await invoke<boolean>('check_server_status');
        if (isServerRunning) {
          setServerStatus('online');
          setCurrentHostName('Matias (Mi PC)');
          setLogs(prev => [...prev, '[Sistema] Servidor detectado en ejecución. Reconectado a la sesión activa.']);
        }

        const isPlayitRunning = await invoke<boolean>('check_playit_status');
        if (isPlayitRunning) {
          setPlayitStatus('running');
          setPlayitTerminalLogs(prev => [...prev, '[Sistema] Túnel Playit.gg detectado en ejecución.']);
        }
      } catch (err) {
        console.warn('Error verificando estado de procesos activos:', err);
      }
    })();

    return () => {
      unlistenServer.then((unlisten) => unlisten());
      unlistenPlayit.then((unlisten) => unlisten());
    };
  }, []);

  const handleStartPlayit = async () => {
    let targetExe = playitExePath.trim();
    if (!targetExe) {
      targetExe = 'C:\\Program Files\\playit_gg\\bin\\playit.exe';
      setPlayitExePath(targetExe);
    } else if (!targetExe.toLowerCase().endsWith('.exe')) {
      // Si el usuario puso la carpeta (ej: C:\Program Files\playit_gg\bin), anexar playit.exe
      targetExe = `${targetExe.replace(/[\\/]+$/, '')}\\playit.exe`;
      setPlayitExePath(targetExe);
      localStorage.setItem('hostshift_playit_exe', targetExe);
    }

    setPlayitStatus('running');
    setPlayitTerminalLogs((prev) => [...prev, `[Playit] Arrancando túnel desde ejecutable: ${targetExe}`]);
    try {
      await invoke('start_playit_tunnel', { executablePath: targetExe });
    } catch (err: any) {
      setPlayitStatus('stopped');
      setPlayitTerminalLogs((prev) => [...prev, `[Error Playit] ${err}`]);
      alert(`Error al iniciar playit.gg: ${err}`);
    }
  };

  const handleStopPlayit = async () => {
    setPlayitStatus('stopped');
    setPlayitTerminalLogs((prev) => [...prev, "[Playit] Túnel detenido."]);
    try {
      await invoke('stop_playit_tunnel');
    } catch (e) {
      console.warn("Stop playit error:", e);
    }
  };

  const handleSendPlayitCommand = async () => {
    if (!playitTerminalInput.trim()) return;
    const cmd = playitTerminalInput.trim();
    setPlayitTerminalInput('');
    setPlayitTerminalLogs((prev) => [...prev, `> ${cmd}`]);

    try {
      await invoke('send_command_to_playit', { command: cmd });
    } catch (err: any) {
      setPlayitTerminalLogs((prev) => [...prev, `[Error Playit] ${err}`]);
    }
  };

  const handleSendTerminalCommand = async () => {
    if (!terminalInput.trim()) return;
    const cmd = terminalInput.trim();
    setTerminalInput('');
    setServerTerminalLogs((prev) => [...prev, `> ${cmd}`]);

    try {
      await invoke('send_command_to_server', { command: cmd });
    } catch (err: any) {
      setServerTerminalLogs((prev) => [...prev, `[Error Consola] ${err}`]);
    }
  };

  const handleStartServer = async () => {
    if (!launcherFile) {
      alert("Por favor selecciona primero qué archivo/programa iniciará el servidor (en la lista de archivos presiona 'Establecer como Iniciador').");
      return;
    }

    setServerStatus('starting');
    setLogs(prev => [...prev, `[Turno] Solicitando turno atómico al coordinador...`]);

    try {
      // Iniciar el ejecutable real mediante el proceso Win32 de Tauri
      await invoke('start_game_server', {
        executablePath: `${serverFolder}\\${launcherFile}`,
        workingDir: serverFolder
      });
      setServerStatus('online');
      setCurrentHostName('Matias (Mi PC)');
      setEpoch(prev => prev + 1);
      setLogs(prev => [
        ...prev, 
        `[Servidor] Proceso iniciado desde '${launcherFile}' (Win32 CREATE_NO_WINDOW).`,
        `[Turno] ¡Turno concedido (Época #${epoch + 1})! Túnel activo en: ${tunnelAddress}`
      ]);
    } catch (err: any) {
      setServerStatus('offline');
      setLogs(prev => [...prev, `[Error Arranque] ${typeof err === 'string' ? err : 'No se pudo iniciar el ejecutable.'}`]);
      alert(`Error al iniciar el servidor desde ${launcherFile}: ${err}`);
    }
  };

  const handleStopServer = async () => {
    setServerStatus('saving');
    setLogs(prev => [
      ...prev,
      "[Apagado] Deteniendo proceso y guardando datos en disco...",
      "[P2P] Generando snapshot SHA-256 y replicando a candidatos...",
      "[Turno] Servidor apagado y turno liberado limpiamente."
    ]);
    try {
      await invoke('stop_game_server');
    } catch (e) {
      console.warn("Stop error:", e);
    }
    setTimeout(() => {
      setServerStatus('offline');
      setCurrentHostName(null);
    }, 1500);
  };

  // Guardar archivo real en el disco de Windows
  const handleSaveFile = async () => {
    if (!selectedFile || !serverFolder) return;
    try {
      await invoke('save_file_content', {
        basePath: serverFolder,
        relativePath: selectedFile.name,
        content: fileContent
      });
      setIsSaved(true);
      setLogs(prev => [...prev, `[Disco] Archivo guardado físicamente: ${selectedFile.name}`]);
      setTimeout(() => setIsSaved(false), 2000);
    } catch (err: any) {
      alert(`Error al guardar en disco: ${err}`);
    }
  };

  const isOwnerOrAdmin = role === 'owner' || role === 'admin';

  return (
    <div className="flex h-screen w-screen bg-slate-950 text-slate-100 font-sans overflow-hidden">
      
      {/* 1. SECCIÓN APARTADA DEL SCROLL: BARRA LATERAL IZQUIERDA FIJA (Grupo e Invitación) */}
      <aside className="w-80 flex-shrink-0 bg-slate-900 border-r border-slate-800 p-5 flex flex-col justify-between z-20 shadow-2xl">
        <div className="space-y-6">
          {/* Logo & Marca */}
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl font-black bg-gradient-to-r from-indigo-400 to-cyan-400 bg-clip-text text-transparent">
                HostShift
              </span>
              <span className="text-[10px] bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-2 py-0.5 rounded-full font-mono">
                v0.1.0
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">Servidores P2P bajo demanda</p>
          </div>

          {/* Autenticación con Google */}
          <div className="mb-2">
            <AuthGoogleModal
              currentUser={currentUser}
              onUserChanged={(user) => {
                setCurrentUser(user);
                if (user) {
                  setLogs(prev => [...prev, `[Auth] Sesión iniciada con Google: ${user.displayName}`]);
                } else {
                  setLogs(prev => [...prev, `[Auth] Sesión cerrada.`]);
                }
              }}
            />
          </div>

          {/* Nombre del Grupo */}
          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-1.5">
              <span className="flex items-center gap-1.5 font-medium">
                <Users className="w-3.5 h-3.5 text-indigo-400" /> Mi Grupo Privado
              </span>
              <span className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded font-mono">grp-01</span>
            </div>
            <input
              type="text"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              disabled={role !== 'owner'}
              className="w-full bg-slate-900 border border-slate-700 font-bold text-sm text-slate-100 px-3 py-1.5 rounded-lg focus:border-indigo-500 outline-none"
            />
            <div className="mt-2 text-[11px] text-slate-500 flex items-center justify-between">
              <span>Propietario:</span>
              <span className="text-amber-300 font-semibold flex items-center gap-1">
                <ShieldCheck className="w-3 h-3" /> {currentUser ? currentUser.displayName : 'Matias (Tú)'}
              </span>
            </div>
          </div>

          {/* Compartir Servidor y Archivos (P2P Link) */}
          <button
            onClick={() => setIsShareOpen(true)}
            className="w-full py-2.5 px-3 bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-300 border border-cyan-500/30 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2"
          >
            <Share2 className="w-4 h-4" />
            Compartir Archivos y Servidor
          </button>

          {/* Invitación Privada */}
          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
            <span className="text-xs text-slate-300 font-semibold block mb-1">Invitar Amigos al Grupo</span>
            <p className="text-[11px] text-slate-400 mb-3">Enlace privado con caducidad:</p>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={`https://hostshift.gg/join/${inviteCode}`}
                className="w-full bg-slate-900 border border-slate-700 text-[11px] font-mono text-emerald-400 px-2.5 py-1.5 rounded-lg outline-none truncate"
              />
              <button
                onClick={copyInvite}
                title="Copiar enlace"
                className="bg-slate-800 hover:bg-slate-700 text-slate-200 p-2 rounded-lg border border-slate-700 transition-all flex-shrink-0"
              >
                {copiedInvite ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
            <span className="text-[10px] text-slate-500 block mt-2">Válido 48h &bull; Máx 5 miembros</span>
          </div>

          {/* Simulador de Rol (Para pruebas) */}
          <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800">
            <span className="text-[11px] text-slate-400 block mb-1.5 font-medium">Modo de Vista (Rol):</span>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
              className="w-full bg-slate-900 border border-slate-700 text-xs text-slate-200 rounded-lg p-2 outline-none"
            >
              <option value="owner">👑 Propietario (Owner)</option>
              <option value="admin">🛡️ Administrador</option>
              <option value="host">💻 Candidato a Host</option>
              <option value="player">🎮 Jugador (Solo Lectura)</option>
            </select>
          </div>
        </div>

        {/* Pie de barra lateral */}
        <div className="text-[10px] text-slate-600 border-t border-slate-800/80 pt-3">
          HostShift Desktop &bull; Aislamiento Win32
        </div>
      </aside>

      {/* 2. ÁREA PRINCIPAL CON CABECERA SUPERIOR FIJA Y SCROLL */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        
        {/* CABECERA PRINCIPAL: BOTÓN ENCENDER / APAGAR Y ESTADO DEL SERVIDOR */}
        <header className="bg-slate-900/90 backdrop-blur border-b border-slate-800 px-8 py-4 flex items-center justify-between z-10 flex-shrink-0 shadow-lg">
          <div className="flex items-center gap-4">
            <div className={`w-3.5 h-3.5 rounded-full ${
              serverStatus === 'online' ? 'bg-emerald-400 animate-pulse' :
              serverStatus === 'starting' ? 'bg-amber-400 animate-spin' :
              'bg-slate-600'
            }`} />
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-lg font-bold text-white tracking-tight">Servidor Dedicado Principal</h1>
                <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                  serverStatus === 'online' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                  serverStatus === 'starting' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' :
                  'bg-slate-800 text-slate-400'
                }`}>
                  {serverStatus}
                </span>
                <span className="text-xs text-slate-400 font-mono">Época #{epoch}</span>
              </div>
              <div className="text-xs text-slate-400 flex items-center gap-2 mt-0.5">
                <span>Iniciador:</span>
                <span className={`font-mono text-xs px-2 py-0.5 rounded border ${
                  launcherFile 
                    ? 'text-cyan-300 bg-slate-950 border-cyan-500/30' 
                    : 'text-amber-400 bg-amber-500/10 border-amber-500/30'
                }`}>
                  {launcherFile ? `▶ ${launcherFile}` : '⚠️ Ningún archivo seleccionado como iniciador'}
                </span>
                <span>&bull; Dirección:</span>
                <span className="font-mono text-emerald-300 font-medium bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                  {tunnelAddress}
                </span>
              </div>
            </div>
          </div>

          {/* Botonera de Encendido en la Cabecera */}
          <div className="flex items-center gap-3">
            {serverStatus === 'offline' ? (
              <button
                onClick={handleStartServer}
                disabled={role === 'player'}
                className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold text-sm transition-all shadow-lg ${
                  role === 'player'
                    ? 'bg-slate-800 text-slate-600 cursor-not-allowed border border-slate-700'
                    : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-900/40 hover:scale-[1.02]'
                }`}
              >
                <Power className="w-4 h-4" />
                Encender Servidor
              </button>
            ) : (
              <button
                onClick={handleStopServer}
                disabled={serverStatus === 'saving'}
                className="flex items-center gap-2 px-6 py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl font-bold text-sm transition-all shadow-lg shadow-rose-900/40 hover:scale-[1.02]"
              >
                <Power className="w-4 h-4" />
                {serverStatus === 'saving' ? 'Guardando y Replicando...' : 'Apagar y Replicar'}
              </button>
            )}

            {isOwnerOrAdmin && serverStatus === 'online' && (
              <button
                onClick={handleStopServer}
                className="flex items-center gap-1.5 px-3 py-2.5 bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border border-amber-500/30 rounded-xl text-xs font-semibold"
                title="Forzar liberación en caso de bloqueo"
              >
                <ShieldAlert className="w-3.5 h-3.5" /> Forzar Liberación
              </button>
            )}
          </div>
        </header>

        {/* NAVEGACIÓN ENTRE SECCIONES CENTRALES: ROLES Y CANDIDATOS vs FOLDER (FILES) */}
        <div className="bg-slate-950 px-8 py-3 border-b border-slate-800/80 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2 bg-slate-900 p-1 rounded-xl border border-slate-800">
            <button
              onClick={() => setActiveMainTab('folder')}
              className={`flex items-center gap-2 px-5 py-2 rounded-lg text-xs font-bold transition-all duration-300 ${
                activeMainTab === 'folder'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Folder className="w-4 h-4" />
              Folder y Archivos (Files)
            </button>

            <button
              onClick={() => setActiveMainTab('console')}
              className={`flex items-center gap-2 px-5 py-2 rounded-lg text-xs font-bold transition-all duration-300 ${
                activeMainTab === 'console'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <SquareTerminal className="w-4 h-4" />
              Consola / Terminal en Vivo
            </button>

            <button
              onClick={() => setActiveMainTab('roles')}
              className={`flex items-center gap-2 px-5 py-2 rounded-lg text-xs font-bold transition-all duration-300 ${
                activeMainTab === 'roles'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <ShieldCheck className="w-4 h-4" />
              Roles y Candidatos
            </button>

            {/* PESTAÑA PLAYIT.GG: SE MUESTRA/OCULTA CON LA FLECHA AL LADO DE ROLES */}
            {showPlayitPanel && (
              <button
                onClick={() => setActiveMainTab('playit')}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all duration-300 animate-fadeIn ${
                  activeMainTab === 'playit'
                    ? 'bg-cyan-600 text-white shadow-md'
                    : 'bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20'
                }`}
              >
                <Globe className="w-3.5 h-3.5" />
                <span>Túnel Playit.gg</span>
              </button>
            )}

            {/* BOTÓN CON FLECHA PARA MOSTRAR/OCULTAR LA PESTAÑA PLAYIT.GG */}
            <button
              onClick={() => {
                setShowPlayitPanel(prev => !prev);
                if (showPlayitPanel && activeMainTab === 'playit') {
                  setActiveMainTab('folder');
                }
              }}
              title={showPlayitPanel ? "Ocultar acceso a playit.gg" : "Mostrar opción playit.gg"}
              className={`p-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center border ${
                showPlayitPanel
                  ? 'bg-slate-800 text-cyan-300 border-cyan-500/30'
                  : 'bg-slate-950/60 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border-slate-800'
              }`}
            >
              {showPlayitPanel ? <ChevronLeft className="w-4 h-4 text-cyan-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
            </button>
          </div>

          <div className="text-xs text-slate-400 flex items-center gap-2">
            <Activity className="w-3.5 h-3.5 text-indigo-400" />
            Host activo: <span className="font-semibold text-slate-200">{currentHostName || 'Ninguno (Libre)'}</span>
          </div>
        </div>

        {/* CONTENEDOR CON ANIMACIÓN DE TRANSICIÓN SUAVE ENTRE 'FOLDER' Y 'ROLES' */}
        <div className="flex-1 overflow-y-auto p-8 relative">
          <div className="max-w-5xl mx-auto relative overflow-hidden min-h-[500px]">
            
            {/* PESTAÑA A: FOLDER Y GESTOR DE ARCHIVOS ESTILO ATERNOS */}
            <div 
              className={`transition-all duration-500 ease-in-out transform ${
                activeMainTab === 'folder'
                  ? 'opacity-100 translate-x-0 relative pointer-events-auto'
                  : 'opacity-0 -translate-x-12 absolute top-0 left-0 w-full pointer-events-none'
              }`}
            >
              <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
                {/* Selector de Carpeta del Servidor */}
                <div className="bg-slate-950 px-6 py-4 border-b border-slate-800 flex items-center gap-3">
                  <FolderOpen className="w-5 h-5 text-indigo-400 flex-shrink-0" />
                  <span className="text-xs font-semibold text-slate-300 whitespace-nowrap">Ruta de Carpeta:</span>
                  <input
                    type="text"
                    value={serverFolder}
                    placeholder="Ejemplo: C:\Servidores\MiJuego o D:\GameServers\Server1"
                    onChange={(e) => {
                      const val = e.target.value;
                      setServerFolder(val);
                      localStorage.setItem('hostshift_server_folder', val);
                    }}
                    className="w-full bg-slate-900 border border-slate-700 text-xs font-mono text-slate-200 px-3 py-2 rounded-lg outline-none focus:border-indigo-500 placeholder-slate-600"
                  />
                  <button
                    onClick={() => {
                      localStorage.setItem('hostshift_server_folder', serverFolder);
                      loadRealDirectory(serverFolder, '');
                    }}
                    className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold px-4 py-2 rounded-lg transition-all flex items-center gap-1.5 flex-shrink-0"
                  >
                    <RefreshCw className="w-3.5 h-3.5" /> Guardar y Cargar
                  </button>
                </div>

                {selectedFile ? (
                  /* Editor de Código en Pantalla */
                  <div className="p-6">
                    <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-800">
                      <button
                        onClick={() => setSelectedFile(null)}
                        className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-white bg-slate-800 px-3 py-1.5 rounded-lg transition-all"
                      >
                        <ArrowLeft className="w-4 h-4" /> Volver a Archivos
                      </button>

                      <div className="flex items-center gap-3">
                        <span className="text-xs font-mono text-slate-400">{selectedFile.name} ({fileContent.length} bytes)</span>
                        {isOwnerOrAdmin && (
                          <button
                            onClick={handleSaveFile}
                            className="flex items-center gap-1.5 px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold shadow-md transition-all"
                          >
                            {isSaved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
                            {isSaved ? '¡Guardado en Disco!' : 'Guardar Archivo'}
                          </button>
                        )}
                      </div>
                    </div>

                    <textarea
                      value={fileContent}
                      onChange={(e) => setFileContent(e.target.value)}
                      disabled={!isOwnerOrAdmin}
                      rows={14}
                      className={`w-full bg-slate-950 font-mono text-xs text-slate-200 p-4 rounded-xl border border-slate-800 outline-none leading-relaxed ${
                        isOwnerOrAdmin ? 'focus:border-indigo-500' : 'cursor-not-allowed opacity-80'
                      }`}
                    />
                  </div>
                ) : (
                  /* Lista de Archivos */
                  <div className="p-6">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
                        <Folder className="w-4 h-4 text-indigo-400" />
                        <span>/{currentSubDir}</span>
                        {currentSubDir && (
                          <button
                            onClick={() => loadRealDirectory(serverFolder, '')}
                            className="text-xs text-indigo-400 hover:underline ml-2"
                          >
                            (Volver a raíz)
                          </button>
                        )}
                      </div>
                      <div className="relative">
                        <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
                        <input
                          type="text"
                          placeholder="Buscar archivo..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="bg-slate-950 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-300 outline-none focus:border-indigo-500 w-44"
                        />
                      </div>
                    </div>

                    <div className="bg-slate-950 rounded-xl border border-slate-800 divide-y divide-slate-800/80 overflow-hidden">
                      {mockFiles.length === 0 ? (
                        <div className="p-8 text-center text-xs text-slate-500">
                          {serverFolder ? 'Carpeta vacía o sin permisos de lectura.' : 'Ingresa una ruta de carpeta arriba y pulsa "Guardar y Cargar".'}
                        </div>
                      ) : (
                        mockFiles
                          .filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase()))
                          .map((item) => (
                            <div
                              key={item.name}
                              onClick={async () => {
                                if (item.is_dir) {
                                  loadRealDirectory(serverFolder, item.name);
                                } else {
                                  try {
                                    const content = await invoke<string>('read_file_content', {
                                      basePath: serverFolder,
                                      relativePath: currentSubDir ? `${currentSubDir}/${item.name}` : item.name
                                    });
                                    setSelectedFile({ name: item.name, path: item.name, size: item.size, content });
                                    setFileContent(content);
                                  } catch (err: any) {
                                    setSelectedFile({ name: item.name, path: item.name, size: item.size, content: '' });
                                    setFileContent(`# [Vista previa de ${item.name}]\n# Archivo binario o sin permisos de texto.\n# Tamaño: ${item.size} bytes`);
                                  }
                                }
                              }}
                              className="flex items-center justify-between px-4 py-3 hover:bg-slate-900 cursor-pointer transition-all group"
                            >
                              <div className="flex items-center gap-3">
                                {item.is_dir ? <Folder className="w-5 h-5 text-indigo-400" /> : <FileText className="w-5 h-5 text-slate-400 group-hover:text-indigo-400 transition-colors" />}
                                <span className="text-sm font-medium text-slate-200 group-hover:text-white">{item.name}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                {!item.is_dir && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const path = currentSubDir ? `${currentSubDir}\\${item.name}` : item.name;
                                      setLauncherFile(path);
                                      localStorage.setItem('hostshift_launcher_file', path);
                                      setLogs(prev => [...prev, `[Iniciador] Seleccionado '${path}' como programa de arranque del servidor.`]);
                                    }}
                                    className={`text-[11px] px-2.5 py-1 rounded font-bold transition-all ${
                                      launcherFile === (currentSubDir ? `${currentSubDir}\\${item.name}` : item.name)
                                        ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                                        : 'bg-slate-800 hover:bg-indigo-600/30 text-slate-400 hover:text-indigo-300 border border-slate-700'
                                    }`}
                                  >
                                    {launcherFile === (currentSubDir ? `${currentSubDir}\\${item.name}` : item.name) ? '★ Iniciador Activo' : 'Hacer Iniciador'}
                                  </button>
                                )}
                                <span className="text-xs text-slate-500 font-mono">
                                  {item.is_dir ? 'Abrir carpeta →' : `${item.size} B &bull; Editar →`}
                                </span>
                              </div>
                            </div>
                          ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* PESTAÑA B: TERMINAL / CONSOLA EN VIVO DEL SERVIDOR */}
            <div 
              className={`transition-all duration-500 ease-in-out transform ${
                activeMainTab === 'console'
                  ? 'opacity-100 translate-x-0 relative pointer-events-auto'
                  : 'opacity-0 translate-x-12 absolute top-0 left-0 w-full pointer-events-none'
              }`}
            >
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl flex flex-col h-[520px]">
                <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-800">
                  <div className="flex items-center gap-2">
                    <SquareTerminal className="w-5 h-5 text-indigo-400" />
                    <div>
                      <h3 className="text-sm font-bold text-white">Consola Interactiva del Servidor</h3>
                      <p className="text-[11px] text-slate-400">Salida estándar en vivo (stdout / stderr) con envío de comandos por stdin.</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`w-2.5 h-2.5 rounded-full ${serverStatus === 'online' ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
                    <span className="text-xs text-slate-300 font-mono uppercase">{serverStatus}</span>
                  </div>
                </div>

                {/* Área de texto de la terminal estilo Linux/Win32 */}
                <div className="flex-1 bg-slate-950 rounded-xl border border-slate-800 p-4 font-mono text-xs text-slate-200 overflow-y-auto space-y-1">
                  {serverTerminalLogs.map((line, idx) => (
                    <div key={idx} className="leading-relaxed">
                      {line.startsWith('>') ? (
                        <span className="text-cyan-400 font-bold">{line}</span>
                      ) : line.includes('WARN') || line.includes('warn') ? (
                        <span className="text-amber-300">{line}</span>
                      ) : line.includes('ERR') || line.includes('error') ? (
                        <span className="text-rose-400">{line}</span>
                      ) : (
                        <span className="text-slate-300">{line}</span>
                      )}
                    </div>
                  ))}
                </div>

                {/* Barra de entrada de comandos interactivos */}
                <div className="mt-3 flex items-center gap-2">
                  <input
                    type="text"
                    value={terminalInput}
                    onChange={(e) => setTerminalInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSendTerminalCommand()}
                    disabled={serverStatus !== 'online'}
                    placeholder={serverStatus === 'online' ? "Escribe un comando para el servidor (ej: help, save, op, whitelist)..." : "El servidor debe estar ENCENDIDO para enviar comandos."}
                    className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs font-mono text-slate-200 outline-none focus:border-indigo-500 placeholder-slate-600 disabled:opacity-50"
                  />
                  <button
                    onClick={handleSendTerminalCommand}
                    disabled={serverStatus !== 'online' || !terminalInput.trim()}
                    className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-600 text-white px-5 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-lg"
                  >
                    <Send className="w-3.5 h-3.5" /> Enviar
                  </button>
                </div>
              </div>
            </div>

            {/* PESTAÑA C: ROLES Y CANDIDATOS A HOST */}
            <div 
              className={`transition-all duration-500 ease-in-out transform ${
                activeMainTab === 'roles'
                  ? 'opacity-100 translate-x-0 relative pointer-events-auto'
                  : 'opacity-0 translate-x-12 absolute top-0 left-0 w-full pointer-events-none'
              }`}
            >
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl">
                <div className="flex items-center justify-between pb-4 mb-6 border-b border-slate-800">
                  <div>
                    <h3 className="text-base font-bold text-white flex items-center gap-2">
                      <ShieldCheck className="w-5 h-5 text-indigo-400" />
                      Candidatos a Host y Permisos
                    </h3>
                    <p className="text-xs text-slate-400">
                      Define qué miembros de confianza pueden encender el servidor y replicar el mundo en su disco.
                    </p>
                  </div>
                  <span className="text-xs bg-slate-800 text-slate-300 px-3 py-1 rounded-full font-mono">3 Miembros</span>
                </div>

                <div className="divide-y divide-slate-800/80 bg-slate-950 rounded-xl border border-slate-800 overflow-hidden">
                  <div className="p-4 flex items-center justify-between">
                    <div>
                      <div className="text-sm font-bold text-slate-200 flex items-center gap-2">
                        Matias <span className="text-xs text-indigo-400">(Tú)</span>
                      </div>
                      <div className="text-xs text-slate-500 font-mono">ID: usr-matias-01 &bull; Copia local: Al día (Época #{epoch})</div>
                    </div>
                    <span className="text-xs px-3 py-1 bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-lg font-bold">
                      PROPIETARIO
                    </span>
                  </div>

                  <div className="p-4 flex items-center justify-between">
                    <div>
                      <div className="text-sm font-bold text-slate-200">Lucas_Gamer</div>
                      <div className="text-xs text-slate-500 font-mono">ID: usr-lucas-88 &bull; PC Apto (16GB RAM)</div>
                    </div>
                    <span className="text-xs px-3 py-1 bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 rounded-lg font-medium">
                      CANDIDATO A HOST
                    </span>
                  </div>

                  <div className="p-4 flex items-center justify-between">
                    <div>
                      <div className="text-sm font-bold text-slate-200">Agustin99</div>
                      <div className="text-xs text-slate-500 font-mono">ID: usr-agus-42 &bull; Conexión de jugador</div>
                    </div>
                    <span className="text-xs px-3 py-1 bg-slate-800 text-slate-400 rounded-lg font-medium">
                      JUGADOR
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* PESTAÑA D: TÚNEL Y SEGUNDA TERMINAL DE PLAYIT.GG (EN LA MISMA VENTANA) */}
            <div 
              className={`transition-all duration-500 ease-in-out transform ${
                activeMainTab === 'playit'
                  ? 'opacity-100 translate-x-0 relative pointer-events-auto'
                  : 'opacity-0 translate-x-12 absolute top-0 left-0 w-full pointer-events-none'
              }`}
            >
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl flex flex-col h-[520px]">
                <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-800">
                  <div className="flex items-center gap-2">
                    <Globe className="w-5 h-5 text-cyan-400" />
                    <div>
                      <h3 className="text-sm font-bold text-white">Túnel Playit.gg (Dirección Pública Fija)</h3>
                      <p className="text-[11px] text-slate-400">Permite a tus amigos conectarse sin que abras puertos ni expongas tu IP real.</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`w-2.5 h-2.5 rounded-full ${playitStatus === 'running' ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
                    <span className="text-xs text-slate-300 font-mono uppercase">{playitStatus}</span>
                  </div>
                </div>

                {/* Configuración de Ruta de playit */}
                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 mb-4 flex items-center justify-between gap-4">
                  <div className="flex-1">
                    <span className="text-xs font-semibold text-slate-300 block mb-1">Ruta o Carpeta de playit.gg:</span>
                    <input
                      type="text"
                      value={playitExePath}
                      placeholder="Ej: C:\Program Files\playit_gg\bin o D:\playit.exe"
                      onChange={(e) => {
                        setPlayitExePath(e.target.value);
                        localStorage.setItem('hostshift_playit_exe', e.target.value);
                      }}
                      className="w-full bg-slate-900 border border-slate-700 text-xs font-mono text-slate-200 px-3 py-1.5 rounded-lg outline-none focus:border-cyan-500 placeholder-slate-600"
                    />
                  </div>

                  <div className="flex items-end pt-5">
                    {playitStatus === 'stopped' ? (
                      <button
                        onClick={handleStartPlayit}
                        className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-5 py-2 rounded-xl transition-all shadow-md flex items-center gap-1.5 whitespace-nowrap"
                      >
                        <Power className="w-3.5 h-3.5" /> Iniciar Túnel
                      </button>
                    ) : (
                      <button
                        onClick={handleStopPlayit}
                        className="bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold px-5 py-2 rounded-xl transition-all shadow-md flex items-center gap-1.5 whitespace-nowrap"
                      >
                        <Power className="w-3.5 h-3.5" /> Detener Túnel
                      </button>
                    )}
                  </div>
                </div>

                {/* SEGUNDA TERMINAL EN VIVO: SALIDA DE PLAYIT.GG */}
                <div className="flex-1 bg-slate-950 rounded-xl border border-slate-800 p-4 font-mono text-xs text-slate-200 overflow-y-auto space-y-1">
                  {playitTerminalLogs.map((log, i) => (
                    <div key={i} className="leading-relaxed text-[11px] text-slate-300">
                      {log.startsWith('>') ? (
                        <span className="text-cyan-400 font-bold">{log}</span>
                      ) : (
                        log
                      )}
                    </div>
                  ))}
                </div>

                {/* Barra de entrada de comandos para playit.gg */}
                <div className="mt-3 flex items-center gap-2">
                  <input
                    type="text"
                    value={playitTerminalInput}
                    onChange={(e) => setPlayitTerminalInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSendPlayitCommand()}
                    disabled={playitStatus !== 'running'}
                    placeholder={playitStatus === 'running' ? "Escribe un comando para playit.gg (ej: status, claim, help)..." : "El túnel playit.gg debe estar INICIADO para enviar comandos."}
                    className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs font-mono text-slate-200 outline-none focus:border-cyan-500 placeholder-slate-600 disabled:opacity-50"
                  />
                  <button
                    onClick={handleSendPlayitCommand}
                    disabled={playitStatus !== 'running' || !playitTerminalInput.trim()}
                    className="bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-800 disabled:text-slate-600 text-white px-5 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-lg"
                  >
                    <Send className="w-3.5 h-3.5" /> Enviar
                  </button>
                </div>
              </div>
            </div>

            {/* CONSOLA DE AUDITORÍA INFERIOR */}
            <div className="bg-slate-900 rounded-2xl border border-slate-800 p-4 mt-6">
              <div className="flex items-center justify-between text-xs text-slate-400 border-b border-slate-800 pb-2 mb-2 font-mono">
                <span className="flex items-center gap-1.5">
                  <Terminal className="w-3.5 h-3.5 text-slate-500" /> Registro de Ciclo de Vida y Replicación
                </span>
                <span className="text-[10px] text-emerald-400">P2P Sincronizado</span>
              </div>
              <div className="font-mono text-xs text-slate-300 space-y-1 max-h-32 overflow-y-auto">
                {logs.map((log, i) => (
                  <div key={i} className="leading-relaxed">{log}</div>
                ))}
              </div>
            </div>

          </div>
        </div>

      </div>
      {/* Modal para Compartir Servidor y Archivos P2P */}
      <ShareFilesModal
        isOpen={isShareOpen}
        onClose={() => setIsShareOpen(false)}
        serverFolder={serverFolder}
        files={mockFiles}
      />
    </div>
  );
}

export default App;
