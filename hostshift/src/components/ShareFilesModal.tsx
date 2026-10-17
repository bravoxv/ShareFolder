import React, { useEffect, useState } from 'react';
import { Share2, Upload, Download, RefreshCw, FolderOpen, FileText, Trash2 } from 'lucide-react';
import { GroupService } from '../services/groupService';
import { deleteSharedFile, downloadSharedFiles, uploadServerFiles } from '../services/sharedFileService';
import { Role } from '../types/models';
import { SharedFileDocument } from '../types/schema';

interface ShareFilesModalProps {
  groupId: string;
  groupName: string;
  ownerName: string;
  currentUser: { uid: string; displayName: string };
  currentRole: Role;
  serverFolder: string;
  isOpen: boolean;
  onClose: () => void;
}

const formatSize = (bytes: number) => bytes < 1024 * 1024
  ? `${(bytes / 1024).toFixed(1)} KB`
  : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

export const ShareFilesModal: React.FC<ShareFilesModalProps> = ({
  groupId,
  groupName,
  ownerName,
  currentUser,
  currentRole,
  serverFolder,
  isOpen,
  onClose
}) => {
  const [files, setFiles] = useState<SharedFileDocument[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const refreshFiles = async () => {
    setError('');
    try {
      const shared = await GroupService.getSharedFiles(groupId);
      setFiles(shared);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar los archivos del grupo.');
    }
  };

  useEffect(() => {
    if (isOpen) void refreshFiles();
  }, [isOpen, groupId]);

  if (!isOpen) return null;

  const handleUpload = async () => {
    if (!serverFolder) {
      setError('Configura primero la carpeta local del servidor.');
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    setProgress('Preparando archivos del servidor...');
    try {
      const total = await uploadServerFiles(groupId, serverFolder, currentUser.displayName, (done, count) => {
        setProgress(`Subiendo bloques: ${done} de ${count}...`);
      });
      setNotice(`Se compartieron ${total} archivos con el grupo.`);
      await refreshFiles();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
      setProgress('');
    }
  };

  const handleDownload = async () => {
    if (!serverFolder) {
      setError('Configura primero una carpeta de servidor de destino.');
      return;
    }
    if (!files.length) {
      setError('Este grupo aún no tiene archivos compartidos.');
      return;
    }
    if (!window.confirm(`Se descargarán ${files.length} archivos a la carpeta del servidor. Los archivos existentes con la misma ruta se reemplazarán. ¿Continuar?`)) return;

    setBusy(true);
    setError('');
    setNotice('');
    try {
      const count = await downloadSharedFiles(files, serverFolder, (done, total) => {
        setProgress(`Descargando bloques: ${done} de ${total}...`);
      });
      setNotice(`Se descargaron ${count} archivos del grupo a la carpeta del servidor.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
      setProgress('');
    }
  };

  const handleDelete = async (file: SharedFileDocument) => {
    if (!window.confirm(`¿Quitar “${file.relativePath}” de los archivos compartidos del grupo?`)) return;
    setBusy(true);
    setError('');
    try {
      await deleteSharedFile(groupId, file);
      await refreshFiles();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo quitar el archivo compartido.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full p-6 shadow-2xl text-slate-100 animate-fadeIn max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-cyan-600/20 text-cyan-300 rounded-xl border border-cyan-500/30"><Share2 className="w-5 h-5" /></div>
            <div>
              <h3 className="font-bold text-sm text-white">Archivos compartidos del grupo</h3>
              <p className="text-[11px] text-slate-400">{groupName} · Creado por {ownerName}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 text-sm font-bold" aria-label="Cerrar">✕</button>
        </div>

        <p className="text-xs text-slate-300 leading-relaxed mb-4">
          Los miembros pueden compartir y descargar los archivos de su servidor. Se conserva la estructura de carpetas y la transferencia se realiza en bloques de 8 MB para manejar mundos grandes. El espacio disponible y el plan de Firebase determinan cuánto se puede almacenar.
        </p>

        <div className="flex flex-wrap gap-2 mb-4">
          <button disabled={busy || !serverFolder} onClick={handleUpload} className="flex-1 min-w-[190px] py-2.5 px-3 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-500 rounded-xl text-xs font-bold flex items-center justify-center gap-2">
            <Upload className="w-4 h-4" /> Compartir carpeta del servidor
          </button>
          <button disabled={busy || !serverFolder || !files.length} onClick={handleDownload} className="flex-1 min-w-[190px] py-2.5 px-3 bg-cyan-700 hover:bg-cyan-600 disabled:bg-slate-800 disabled:text-slate-500 rounded-xl text-xs font-bold flex items-center justify-center gap-2">
            <Download className="w-4 h-4" /> Descargar archivos del grupo
          </button>
          <button disabled={busy} onClick={refreshFiles} title="Actualizar lista" className="p-2.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 rounded-xl"><RefreshCw className="w-4 h-4" /></button>
        </div>

        {!serverFolder && <p className="text-[11px] text-amber-300 mb-3 flex items-center gap-1.5"><FolderOpen className="w-3.5 h-3.5" /> Selecciona una carpeta local del servidor antes de sincronizar.</p>}
        {progress && <p className="text-xs text-cyan-300 mb-3">{progress}</p>}
        {notice && <p className="text-xs text-emerald-300 mb-3">{notice}</p>}
        {error && <p className="text-xs text-rose-300 mb-3 break-words">{error}</p>}

        <div className="bg-slate-950 rounded-xl border border-slate-800 overflow-hidden">
          <div className="flex justify-between text-[11px] text-slate-400 p-3 border-b border-slate-800">
            <span>Archivos disponibles para el grupo</span><span>{files.length} archivos</span>
          </div>
          <div className="max-h-64 overflow-y-auto divide-y divide-slate-800/70">
            {files.length ? files.map(file => (
              <div key={file.id} className="px-3 py-2.5 flex items-center gap-3">
                <FileText className="w-4 h-4 text-cyan-400 flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-slate-200 truncate" title={file.relativePath}>{file.relativePath}</p>
                  <p className="text-[10px] text-slate-500">{formatSize(file.sizeBytes)} · Compartido por {file.uploadedByName || 'miembro'}</p>
                </div>
                {(file.uploadedBy === currentUser.uid || currentRole === 'owner' || currentRole === 'admin') && (
                  <button disabled={busy} onClick={() => void handleDelete(file)} title="Quitar del grupo" className="p-1.5 text-slate-500 hover:text-rose-300 disabled:opacity-50"><Trash2 className="w-3.5 h-3.5" /></button>
                )}
              </div>
            )) : <p className="text-xs text-slate-500 text-center py-8">Todavía no se compartieron archivos.</p>}
          </div>
        </div>
        <p className="text-[10px] text-slate-500 mt-3">La descarga reemplaza archivos que ya existan con la misma ruta. Los archivos se guardan en Firebase Storage y solo los miembros del grupo pueden acceder.</p>
      </div>
    </div>
  );
};
