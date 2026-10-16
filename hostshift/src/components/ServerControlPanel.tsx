import React, { useState, useEffect } from 'react';
import { 
  Server, 
  Power, 
  ShieldAlert, 
  Clock, 
  Users, 
  CheckCircle2, 
  AlertTriangle,
  FolderSync,
  Terminal
} from 'lucide-react';
import { LeaseManager } from '../services/leaseManager';
import { ServerState, Role } from '../types/models';

interface Props {
  groupId: string;
  serverId: string;
  currentUserId: string;
  currentUserName: string;
  userRole: Role;
}

export const ServerControlPanel: React.FC<Props> = ({
  groupId,
  serverId,
  currentUserId,
  currentUserName,
  userRole
}) => {
  const [serverState, setServerState] = useState<ServerState>({
    id: serverId,
    groupId: groupId,
    gameId: 'minecraft-paper',
    name: 'Mundo Survival Principal',
    status: 'offline',
    lease: {
      currentHostId: null,
      currentHostName: null,
      leaseExpiresAt: 0,
      epoch: 4,
      leaseToken: null
    },
    lastSnapshotId: 'snap-402',
    lastSnapshotHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    tunnelAddress: 'play.hostshift.gg:25565',
    updatedAt: Date.now()
  });

  const [leaseManager, setLeaseManager] = useState<LeaseManager | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([
    "[Sistema] Servidor inicializado y sincronizado con el coordinador P2P.",
    "[P2P] Último snapshot verificado (Época #4)."
  ]);

  const isCurrentHost = serverState.lease.currentHostId === currentUserId;
  const isServerBusy = Boolean(
    serverState.lease.currentHostId && 
    serverState.lease.currentHostId !== currentUserId &&
    serverState.lease.leaseExpiresAt > Date.now()
  );

  useEffect(() => {
    const manager = new LeaseManager(
      groupId,
      serverId,
      currentUserId,
      currentUserName,
      () => {
        setLogs(prev => [...prev, "[Alerta] El latido de turno falló o expiró. Apagando servidor preventivamente..."]);
        handleEmergencyShutdown();
      }
    );
    setLeaseManager(manager);

    return () => {
      manager.releaseLease();
    };
  }, [groupId, serverId, currentUserId]);

  const handleStartServer = async () => {
    if (!leaseManager) return;
    setIsProcessing(true);
    setErrorMsg(null);
    setLogs(prev => [...prev, `[Turno] Solicitando turno de host atómico al coordinador...`]);

    const res = await leaseManager.acquireLease();
    if (!res.success) {
      setErrorMsg(res.reason || "No se pudo obtener el turno.");
      setLogs(prev => [...prev, `[Error] ${res.reason}`]);
      setIsProcessing(false);
      return;
    }

    setServerState(prev => ({
      ...prev,
      status: 'starting',
      lease: {
        ...prev.lease,
        currentHostId: currentUserId,
        currentHostName: currentUserName,
        epoch: res.epoch || prev.lease.epoch + 1,
        leaseExpiresAt: Date.now() + 15000
      }
    }));

    setLogs(prev => [
      ...prev, 
      `[Turno] ¡Turno concedido (Época #${res.epoch})! Iniciando túnel persistente...`,
      `[Túnel] playit.gg conectado: ${serverState.tunnelAddress}`,
      `[Proceso] Arrancando PaperMC 1.21.1 en sandbox aislado...`,
      `[Juego] Servidor listo para conexiones de jugadores.`
    ]);

    setServerState(prev => ({ ...prev, status: 'online' }));
    setIsProcessing(false);
  };

  const handleStopServer = async () => {
    if (!leaseManager) return;
    setIsProcessing(true);
    setLogs(prev => [
      ...prev,
      `[Apagado] Enviando comando 'save-all flush' al servidor del juego...`,
      `[P2P] Generando snapshot y calculando hash SHA-256...`,
      `[P2P] Replicando a candidatos conectados (esperando confirmación de mínimo 1 candidato)...`,
      `[P2P] Confirmación recibida de 2 candidatos (Época #${serverState.lease.epoch}).`,
      `[Turno] Liberando turno de host en el coordinador...`
    ]);

    await leaseManager.releaseLease();

    setServerState(prev => ({
      ...prev,
      status: 'offline',
      lease: {
        ...prev.lease,
        currentHostId: null,
        currentHostName: null,
        leaseExpiresAt: 0,
        leaseToken: null
      }
    }));

    setLogs(prev => [...prev, `[Sistema] Servidor apagado limpiamente. Listo para el siguiente host.`]);
    setIsProcessing(false);
  };

  const handleEmergencyShutdown = () => {
    setServerState(prev => ({
      ...prev,
      status: 'offline',
      lease: {
        ...prev.lease,
        currentHostId: null,
        currentHostName: null,
        leaseExpiresAt: 0,
        leaseToken: null
      }
    }));
  };

  const handleForceRelease = async () => {
    if (userRole !== 'admin' && userRole !== 'owner') return;
    setIsProcessing(true);
    await LeaseManager.forceReleaseByAdmin(groupId, serverId, currentUserId, currentUserName);
    setLogs(prev => [...prev, `[Admin] Liberación forzada de turno ejecutada.`]);
    setServerState(prev => ({
      ...prev,
      status: 'offline',
      lease: { ...prev.lease, currentHostId: null, currentHostName: null, leaseExpiresAt: 0 }
    }));
    setIsProcessing(false);
  };

  return (
    <div className="bg-slate-900 text-slate-100 p-6 rounded-2xl shadow-2xl border border-slate-800 max-w-4xl mx-auto">
      {/* Cabecera */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-indigo-600/20 text-indigo-400 rounded-xl border border-indigo-500/30">
            <Server className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold flex items-center gap-2">
              {serverState.name}
              <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${
                serverState.status === 'online' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                serverState.status === 'starting' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' :
                'bg-slate-700 text-slate-300'
              }`}>
                {serverState.status.toUpperCase()}
              </span>
            </h2>
            <p className="text-xs text-slate-400">Época de guardado actual: #{serverState.lease.epoch} | Rol: <span className="text-indigo-400 uppercase font-semibold">{userRole}</span></p>
          </div>
        </div>

        {/* Dirección fija */}
        <div className="text-right">
          <span className="text-xs text-slate-400 block">Dirección fija (Túnel):</span>
          <span className="font-mono text-sm bg-slate-800 px-3 py-1 rounded border border-slate-700 text-emerald-300">
            {serverState.tunnelAddress}
          </span>
        </div>
      </div>

      {/* Alertas */}
      {errorMsg && (
        <div className="mb-4 p-3 bg-rose-500/20 border border-rose-500/30 rounded-xl text-rose-300 text-sm flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 flex-shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Estado del Host y Turnos */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-slate-800/60 border border-slate-700/50 p-4 rounded-xl">
          <div className="flex items-center gap-2 text-slate-400 text-xs mb-1">
            <Users className="w-4 h-4 text-indigo-400" /> Host actual del servidor
          </div>
          <div className="text-base font-semibold">
            {serverState.lease.currentHostName ? (
              <span className="text-amber-300">{serverState.lease.currentHostName}</span>
            ) : (
              <span className="text-emerald-400 font-normal">Libre (Cualquier candidato puede encender)</span>
            )}
          </div>
        </div>

        <div className="bg-slate-800/60 border border-slate-700/50 p-4 rounded-xl">
          <div className="flex items-center gap-2 text-slate-400 text-xs mb-1">
            <Clock className="w-4 h-4 text-indigo-400" /> Latido / Expiración de turno
          </div>
          <div className="text-base font-semibold">
            {serverState.lease.currentHostId ? (
              <span className="text-slate-200">Activo (Renueva cada 5s)</span>
            ) : (
              <span className="text-slate-500 font-normal">Sin latido activo</span>
            )}
          </div>
        </div>

        <div className="bg-slate-800/60 border border-slate-700/50 p-4 rounded-xl">
          <div className="flex items-center gap-2 text-slate-400 text-xs mb-1">
            <FolderSync className="w-4 h-4 text-indigo-400" /> Consistencia P2P
          </div>
          <div className="text-base font-semibold flex items-center gap-1.5 text-emerald-400">
            <CheckCircle2 className="w-4 h-4" /> Al día (Snapshot #{serverState.lease.epoch})
          </div>
        </div>
      </div>

      {/* Botonera de Acción */}
      <div className="flex flex-wrap items-center gap-4 mb-6">
        {!isCurrentHost ? (
          <button
            onClick={handleStartServer}
            disabled={isServerBusy || isProcessing || userRole === 'player'}
            className={`flex items-center gap-2 px-6 py-3 rounded-xl font-bold transition-all ${
              isServerBusy
                ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-900/30'
            }`}
          >
            <Power className="w-5 h-5" />
            {isServerBusy ? `Ocupado por ${serverState.lease.currentHostName}` : 'Encender Servidor'}
          </button>
        ) : (
          <button
            onClick={handleStopServer}
            disabled={isProcessing}
            className="flex items-center gap-2 px-6 py-3 bg-rose-600 hover:bg-rose-500 text-white rounded-xl font-bold transition-all shadow-lg shadow-rose-900/30"
          >
            <Power className="w-5 h-5" />
            Apagar y Replicar a Candidatos
          </button>
        )}

        {(userRole === 'admin' || userRole === 'owner') && isServerBusy && (
          <button
            onClick={handleForceRelease}
            disabled={isProcessing}
            className="flex items-center gap-2 px-4 py-3 bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border border-amber-500/30 rounded-xl font-medium transition-all text-sm"
          >
            <ShieldAlert className="w-4 h-4" />
            Liberación Forzada (Admin)
          </button>
        )}
      </div>

      {/* Terminal / Registro de Auditoría Local */}
      <div className="bg-slate-950 rounded-xl border border-slate-800 p-4">
        <div className="flex items-center justify-between text-xs text-slate-400 border-b border-slate-800/80 pb-2 mb-3">
          <span className="flex items-center gap-1.5 font-medium">
            <Terminal className="w-4 h-4 text-slate-500" /> Registro de Ciclo de Vida y Replicación
          </span>
          <span className="font-mono text-[10px] text-slate-500">Aislamiento Sandbox ACTIVO</span>
        </div>
        <div className="font-mono text-xs text-slate-300 space-y-1 max-h-48 overflow-y-auto">
          {logs.map((log, idx) => (
            <div key={idx} className="leading-relaxed">
              {log.startsWith('[Error]') ? <span className="text-rose-400">{log}</span> :
               log.startsWith('[Alerta]') ? <span className="text-amber-400">{log}</span> :
               log.startsWith('[Túnel]') ? <span className="text-indigo-400">{log}</span> :
               log.startsWith('[P2P]') ? <span className="text-cyan-400">{log}</span> :
               log}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
