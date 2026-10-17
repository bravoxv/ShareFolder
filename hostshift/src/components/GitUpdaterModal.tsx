import React, { useState } from 'react';
import { 
  GitBranch, 
  RefreshCw, 
  DownloadCloud, 
  CheckCircle2, 
  AlertCircle, 
  FileCode, 
  X,
  Loader2
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';

interface GitUpdateStatus {
  has_updates: boolean;
  current_commit: string;
  remote_commit: string;
  modified_files: string[];
}

interface GitUpdateResult {
  success: boolean;
  updated_files: string[];
  message: string;
}

interface GitUpdaterModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpdateApplied?: () => void;
}

export const GitUpdaterModal: React.FC<GitUpdaterModalProps> = ({
  isOpen,
  onClose,
  onUpdateApplied
}) => {
  const [checking, setChecking] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [status, setStatus] = useState<GitUpdateStatus | null>(null);
  const [result, setResult] = useState<GitUpdateResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleCheckUpdates = async () => {
    setChecking(true);
    setErrorMsg(null);
    setResult(null);

    try {
      const updateStatus = await invoke<GitUpdateStatus>('check_git_updates', {
        repoPath: null
      });
      setStatus(updateStatus);
    } catch (err: any) {
      console.error('Error comprobando actualizaciones:', err);
      setErrorMsg(typeof err === 'string' ? err : 'Error al consultar actualizaciones en GitHub.');
    } finally {
      setChecking(false);
    }
  };

  const handleApplyUpdates = async () => {
    setUpdating(true);
    setErrorMsg(null);

    try {
      const updateResult = await invoke<GitUpdateResult>('apply_git_updates', {
        repoPath: null
      });
      setResult(updateResult);
      if (updateResult.success) {
        setStatus(prev => prev ? { ...prev, has_updates: false } : null);
        if (onUpdateApplied) {
          onUpdateApplied();
        }
      }
    } catch (err: any) {
      console.error('Error aplicando actualización:', err);
      setErrorMsg(typeof err === 'string' ? err : 'Fallo al aplicar la actualización de Git.');
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-lg w-full p-6 shadow-2xl text-slate-100 animate-fadeIn relative">
        
        {/* Cabecera */}
        <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-600/20 text-indigo-400 rounded-2xl border border-indigo-500/30">
              <GitBranch className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-base text-white">Actualizador Inteligente de GitHub</h3>
              <p className="text-xs text-slate-400">Descarga e integra únicamente los archivos que cambiaron</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mensaje de Error */}
        {errorMsg && (
          <div className="mb-4 p-3 bg-rose-500/20 border border-rose-500/30 rounded-xl text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Mensaje de Éxito al Aplicar */}
        {result && result.success && (
          <div className="mb-4 p-3 bg-emerald-500/20 border border-emerald-500/30 rounded-xl text-emerald-300 text-xs space-y-1.5">
            <div className="flex items-center gap-2 font-bold">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              <span>{result.message}</span>
            </div>
            {result.updated_files.length > 0 && (
              <p className="text-[11px] text-emerald-200">
                Se actualizaron {result.updated_files.length} archivos en tu disco sin descargar el proyecto completo.
              </p>
            )}
          </div>
        )}

        {/* Estado y Resultados */}
        <div className="space-y-4">
          {!status ? (
            <div className="bg-slate-950 p-5 rounded-2xl border border-slate-800 text-center space-y-2">
              <p className="text-xs text-slate-400">
                Haz clic abajo para comparar tu versión local con el repositorio remoto de GitHub (<strong>bravoxv/ShareFolder</strong>).
              </p>
            </div>
          ) : (
            <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">Commit actual:</span>
                <span className="font-mono text-indigo-400 font-bold bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                  {status.current_commit}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">Último commit en GitHub:</span>
                <span className="font-mono text-cyan-400 font-bold bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                  {status.remote_commit}
                </span>
              </div>

              <div className="pt-2 border-t border-slate-800/80">
                {status.has_updates ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
                        <DownloadCloud className="w-4 h-4" /> ¡Hay actualizaciones disponibles!
                      </span>
                      <span className="text-[11px] text-slate-400 font-mono">
                        {status.modified_files.length} archivo(s) modificado(s)
                      </span>
                    </div>

                    <div className="max-h-36 overflow-y-auto space-y-1 bg-slate-900/60 p-2.5 rounded-xl border border-slate-800/80 text-[11px] font-mono">
                      {status.modified_files.map((file, idx) => (
                        <div key={idx} className="flex items-center gap-1.5 text-slate-300">
                          <FileCode className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" />
                          <span className="truncate">{file}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-emerald-400 text-xs font-bold">
                    <CheckCircle2 className="w-4 h-4" /> Tu aplicación está en la versión más reciente.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Botonera de Acción */}
          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={handleCheckUpdates}
              disabled={checking || updating}
              className="flex-1 py-2.5 px-4 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 border border-slate-700"
            >
              {checking ? (
                <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              {checking ? 'Comprobando GitHub...' : 'Buscar Actualizaciones'}
            </button>

            {status && status.has_updates && (
              <button
                onClick={handleApplyUpdates}
                disabled={updating}
                className="flex-1 py-2.5 px-4 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-lg shadow-emerald-900/30 transition-all flex items-center justify-center gap-2 hover:scale-[1.02]"
              >
                {updating ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <DownloadCloud className="w-4 h-4" />
                )}
                {updating ? 'Actualizando archivos...' : 'Actualizar Solo Archivos'}
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};
