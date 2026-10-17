import React, { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { Copy, FolderOpen, RefreshCw, Share2, Wifi } from 'lucide-react';
import { GroupService } from '../services/groupService';
import { Role } from '../types/models';
import { SyncDeviceDocument } from '../types/schema';

interface SyncResult { deviceId: string; peerCount: number; folderId: string; }
interface ShareFilesModalProps {
  groupId: string;
  groupName: string;
  ownerName: string;
  currentUser: { uid: string; displayName: string };
  currentRole: Role;
  serverFolder: string;
  onSelectFolder: (folder: string) => void;
  isOpen: boolean;
  onClose: () => void;
  onSyncBusyChange: (busy: boolean) => void;
}

export const ShareFilesModal: React.FC<ShareFilesModalProps> = ({
  groupId, groupName, ownerName, currentUser, currentRole, serverFolder, onSelectFolder, isOpen, onClose, onSyncBusyChange
}) => {
  const [busy, setBusy] = useState(false);
  const [deviceId, setDeviceId] = useState('');
  const [devices, setDevices] = useState<SyncDeviceDocument[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const stopWatching = useRef<null | (() => void)>(null);

  useEffect(() => () => stopWatching.current?.(), []);
  if (!isOpen) return null;

  const syncPeers = async (nextDevices: SyncDeviceDocument[]) => {
    setDevices(nextDevices);
    if (nextDevices.length) setNotice(`Dispositivos registrados: ${nextDevices.length}. Syncthing conecta las PCs cuando están disponibles.`);
  };

  const handleConnect = async () => {
    if (!serverFolder) { setError('Selecciona primero la carpeta local del servidor.'); return; }
    setBusy(true);
    onSyncBusyChange(true);
    setError('');
    setNotice('Iniciando Syncthing y registrando este dispositivo…');
    try {
      const local = await invoke<SyncResult>('syncthing_connect_group', { groupId, folderPath: serverFolder, peerIds: [], canPublish: currentRole === 'owner' || currentRole === 'admin' });
      setDeviceId(local.deviceId);
      await GroupService.publishSyncDevice(groupId, local.deviceId, currentUser.displayName);
      stopWatching.current?.();
      stopWatching.current = GroupService.watchSyncDevices(groupId, nextDevices => { void syncPeers(nextDevices); }, watchError => setError(watchError.message));
      setNotice('Dispositivo registrado. Preparando la sincronización del grupo…');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setNotice('');
    } finally {
      setBusy(false);
      onSyncBusyChange(false);
    }
  };

  const copyId = async () => {
    if (!deviceId) return;
    await navigator.clipboard.writeText(deviceId);
    setNotice('ID de Syncthing copiado.');
  };

  const chooseFolder = async () => {
    setError('');
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        ...(serverFolder ? { defaultPath: serverFolder } : {})
      });
      if (typeof selected === 'string') {
        onSelectFolder(selected);
        setNotice('Carpeta local guardada en esta PC. Conecta para sincronizar los archivos del grupo.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full p-6 shadow-2xl text-slate-100 animate-fadeIn max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-cyan-600/20 text-cyan-300 rounded-xl border border-cyan-500/30"><Share2 className="w-5 h-5" /></div>
            <div><h3 className="font-bold text-sm text-white">Sincronización P2P del grupo</h3><p className="text-[11px] text-slate-400">{groupName} · Creado por {ownerName}</p></div>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 text-sm font-bold" aria-label="Cerrar">✕</button>
        </div>

        <p className="text-xs text-slate-300 leading-relaxed mb-4">
          Elige la carpeta local de esta PC donde se guardará el servidor del grupo. Cada computadora puede usar una ruta diferente. Syncthing transfiere los archivos directamente entre las PCs; el contenido no se sube a Firebase.
        </p>
        <div className="rounded-xl border border-slate-800 bg-slate-950 p-3 mb-4">
          <div className="flex flex-wrap items-center gap-2">
            <FolderOpen className="w-4 h-4 text-cyan-300 flex-shrink-0" />
            <span className="text-[11px] font-semibold text-slate-300">Carpeta local de esta PC</span>
            <button onClick={() => void chooseFolder()} disabled={busy} className="ml-auto rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-50 px-3 py-1.5 text-[11px] font-bold text-slate-100">
              Elegir carpeta…
            </button>
          </div>
          <p className="mt-2 break-all font-mono text-[10px] text-slate-400">{serverFolder || 'No seleccionada'}</p>
          <p className="mt-1 text-[10px] text-slate-500">La ruta solo se guarda localmente en esta PC. Puedes elegir una diferente en cada computadora.</p>
        </div>
        <div className="flex flex-wrap gap-2 mb-4">
          <button disabled={busy || !serverFolder} onClick={() => void handleConnect()} className="flex-1 min-w-[210px] py-2.5 px-3 bg-cyan-700 hover:bg-cyan-600 disabled:bg-slate-800 disabled:text-slate-500 rounded-xl text-xs font-bold flex items-center justify-center gap-2">
            {busy ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Wifi className="w-4 h-4" />}
            {busy ? 'Conectando dispositivos…' : 'Conectar / actualizar dispositivos'}
          </button>
        </div>
        {!serverFolder && <p className="text-[11px] text-amber-300 mb-3">Selecciona una carpeta local del servidor antes de conectar Syncthing.</p>}
        {deviceId && <div className="rounded-xl border border-slate-800 bg-slate-950 p-3 mb-3">
          <div className="flex items-center justify-between gap-2"><span className="text-xs font-semibold text-slate-200">ID de esta PC</span><button onClick={() => void copyId()} className="text-cyan-300 hover:text-cyan-200 flex items-center gap-1 text-[11px]"><Copy className="w-3.5 h-3.5" /> Copiar</button></div>
          <code className="mt-2 block break-all text-[10px] text-slate-400">{deviceId}</code>
        </div>}
        <div className="bg-slate-950 rounded-xl border border-slate-800 overflow-hidden">
          <div className="flex justify-between text-[11px] text-slate-400 p-3 border-b border-slate-800"><span>Dispositivos registrados en el grupo</span><span>{devices.length}</span></div>
          <div className="max-h-56 overflow-y-auto divide-y divide-slate-800/70">
            {devices.length ? devices.map(device => <div key={device.deviceId} className="px-3 py-2.5"><p className="text-xs text-slate-200">{device.displayName || 'Miembro'}</p><code className="text-[10px] text-slate-500 break-all">{device.deviceId}</code></div>) : <p className="text-xs text-slate-500 text-center py-6">Pulsa conectar en cada PC que deba participar en este grupo.</p>}
          </div>
        </div>
        {notice && <p role="status" className="text-xs text-emerald-300 mt-3">{notice}</p>}
        {error && <p role="alert" className="text-xs text-rose-300 mt-3 break-words">{error}</p>}
        <p className="text-[10px] text-slate-500 mt-3">Carpeta local: {serverFolder || 'sin configurar'} · Rol: {currentRole}. Mantén HostShift abierto en ambas PCs; la conexión directa puede requerir una regla de firewall.</p>
      </div>
    </div>
  );
};
