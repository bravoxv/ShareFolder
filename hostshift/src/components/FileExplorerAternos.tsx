import React, { useState, useEffect } from 'react';
import { 
  Folder, 
  FileText, 
  Save, 
  ArrowLeft, 
  ShieldAlert, 
  FileCode, 
  Check, 
  Search,
  RefreshCw,
  FolderOpen
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { Role } from '../types/models';

export interface DiskFileItem {
  name: string;
  relative_path: string;
  is_dir: boolean;
  size_bytes: number;
}

interface Props {
  currentRole: Role;
  baseServerFolder: string;
  onFolderPathChange?: (newPath: string) => void;
}

export const FileExplorerAternos: React.FC<Props> = ({ 
  currentRole, 
  baseServerFolder,
  onFolderPathChange 
}) => {
  const [folderInput, setFolderInput] = useState<string>(baseServerFolder);
  const [currentSubDir, setCurrentSubDir] = useState<string>('');
  const [files, setFiles] = useState<DiskFileItem[]>([]);
  const [selectedFile, setSelectedFile] = useState<DiskFileItem | null>(null);
  const [fileContent, setFileContent] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSaved, setIsSaved] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');

  const isOwnerOrAdmin = currentRole === 'owner' || currentRole === 'admin';

  // Carga archivos reales del disco mediante Tauri (o fallback local)
  const loadDirectory = async (folderPath: string, sub: string = '') => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const items = await invoke<DiskFileItem[]>('list_directory_contents', {
        basePath: folderPath,
        subDir: sub
      });
      setFiles(items);
      setCurrentSubDir(sub);
    } catch (err: any) {
      // Si corre en navegador web o aún no existe la ruta, muestra fallback instructivo
      console.warn("Fallo o modo navegador:", err);
      setErrorMsg(typeof err === 'string' ? err : 'No se pudo leer la carpeta del disco.');
      setFiles([
        { name: 'server_config.ini', relative_path: 'server_config.ini', is_dir: false, size_bytes: 840 },
        { name: 'settings.json', relative_path: 'settings.json', is_dir: false, size_bytes: 1200 },
        { name: 'admins.txt', relative_path: 'admins.txt', is_dir: false, size_bytes: 64 },
        { name: 'saved_worlds', relative_path: 'saved_worlds', is_dir: true, size_bytes: 0 }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadDirectory(folderInput, '');
  }, []);

  const handleApplyFolder = () => {
    if (onFolderPathChange) onFolderPathChange(folderInput);
    loadDirectory(folderInput, '');
  };

  const handleItemClick = async (item: DiskFileItem) => {
    if (item.is_dir) {
      loadDirectory(folderInput, item.relative_path);
      return;
    }

    setIsLoading(true);
    try {
      const content = await invoke<string>('read_file_content', {
        basePath: folderInput,
        relativePath: item.relative_path
      });
      setSelectedFile(item);
      setFileContent(content);
      setIsSaved(false);
    } catch (err: any) {
      setSelectedFile(item);
      setFileContent(`# [Vista previa de ${item.name}]\n# No se pudo leer el contenido binario o superó el límite de texto.\n# Tamaño: ${item.size_bytes} bytes`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveFile = async () => {
    if (!selectedFile) return;
    if (!isOwnerOrAdmin) {
      alert('Solo el Propietario o Administrador pueden guardar cambios en archivos.');
      return;
    }

    try {
      await invoke('save_file_content', {
        basePath: folderInput,
        relativePath: selectedFile.relative_path,
        content: fileContent
      });
      setIsSaved(true);
      setTimeout(() => setIsSaved(false), 2500);
    } catch (err: any) {
      alert(`Error al guardar archivo en disco: ${err}`);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl text-slate-100 max-w-4xl mx-auto mb-8">
      {/* Cabecera */}
      <div className="bg-slate-950 px-6 py-4 border-b border-slate-800 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-indigo-600/20 text-indigo-400 rounded-xl border border-indigo-500/30">
            <FileCode className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold flex items-center gap-2">
              Gestor de Archivos Universal (Files)
            </h2>
            <p className="text-xs text-slate-400">
              Explora, previsualiza y edita cualquier archivo de cualquier servidor dedicado.
            </p>
          </div>
        </div>

        {!isOwnerOrAdmin && (
          <div className="flex items-center gap-1.5 text-xs text-amber-400 bg-amber-500/10 px-3 py-1.5 rounded-lg border border-amber-500/20">
            <ShieldAlert className="w-4 h-4" />
            <span>Solo Lectura (Requiere Propietario o Admin)</span>
          </div>
        )}
      </div>

      {/* Selector de Carpeta Raíz en el Disco */}
      <div className="bg-slate-900/90 px-6 py-3 border-b border-slate-800 flex items-center gap-3">
        <FolderOpen className="w-4 h-4 text-slate-400 flex-shrink-0" />
        <span className="text-xs text-slate-400 font-medium whitespace-nowrap">Carpeta del Servidor:</span>
        <input
          type="text"
          value={folderInput}
          onChange={(e) => setFolderInput(e.target.value)}
          placeholder="C:\Ruta\A\Tu\Servidor"
          className="w-full bg-slate-950 border border-slate-700 text-xs text-slate-200 px-3 py-1.5 rounded-lg font-mono outline-none focus:border-indigo-500"
        />
        <button
          onClick={handleApplyFolder}
          className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold px-4 py-1.5 rounded-lg transition-all flex items-center gap-1.5 whitespace-nowrap"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Cargar Carpeta
        </button>
      </div>

      {errorMsg && (
        <div className="mx-6 mt-4 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-300 text-xs">
          Aviso: {errorMsg} (mostrando lista previa de referencia)
        </div>
      )}

      {selectedFile ? (
        /* VISTA DE EDICIÓN DE ARCHIVO */
        <div className="p-6">
          <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-800">
            <button
              onClick={() => setSelectedFile(null)}
              className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-lg transition-all"
            >
              <ArrowLeft className="w-4 h-4" /> Volver a Archivos
            </button>

            <div className="flex items-center gap-3">
              <span className="text-xs font-mono text-slate-400">
                {selectedFile.relative_path} ({selectedFile.size_bytes} bytes)
              </span>

              {isOwnerOrAdmin && (
                <button
                  onClick={handleSaveFile}
                  className="flex items-center gap-1.5 px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold shadow-md shadow-emerald-900/30 transition-all"
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
            rows={16}
            className={`w-full bg-slate-950 font-mono text-xs text-slate-200 p-4 rounded-xl border border-slate-800 outline-none leading-relaxed resize-y ${
              isOwnerOrAdmin ? 'focus:border-indigo-500' : 'cursor-not-allowed opacity-80'
            }`}
          />
        </div>
      ) : (
        /* VISTA DE LISTA DE ARCHIVOS (ESTILO ATERNOS) */
        <div className="p-6">
          <div className="flex items-center justify-between mb-4 gap-4">
            <div className="flex items-center gap-2 bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800 text-xs font-mono text-slate-300">
              <Folder className="w-4 h-4 text-indigo-400" />
              <span>/{currentSubDir}</span>
              {currentSubDir && (
                <button
                  onClick={() => loadDirectory(folderInput, '')}
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
                placeholder="Filtrar archivos..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-300 outline-none focus:border-indigo-500 w-48"
              />
            </div>
          </div>

          {isLoading ? (
            <div className="p-8 text-center text-xs text-slate-400">Leyendo archivos del servidor...</div>
          ) : (
            <div className="bg-slate-950 rounded-xl border border-slate-800 divide-y divide-slate-800/80 overflow-hidden">
              {files
                .filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase()))
                .map((item) => (
                  <div
                    key={item.relative_path}
                    onClick={() => handleItemClick(item)}
                    className="flex items-center justify-between px-4 py-3 hover:bg-slate-900/80 cursor-pointer transition-all group"
                  >
                    <div className="flex items-center gap-3">
                      {item.is_dir ? (
                        <Folder className="w-5 h-5 text-indigo-400" />
                      ) : (
                        <FileText className="w-5 h-5 text-slate-400 group-hover:text-indigo-400 transition-colors" />
                      )}
                      <span className="text-sm font-medium text-slate-200 group-hover:text-white transition-colors">
                        {item.name}
                      </span>
                    </div>

                    <div className="flex items-center gap-4 text-xs text-slate-500 font-mono">
                      {!item.is_dir && (
                        <span>{item.size_bytes < 1024 ? `${item.size_bytes} B` : `${(item.size_bytes / 1024).toFixed(1)} KB`}</span>
                      )}
                      <span className="text-slate-600 group-hover:text-slate-400 transition-colors">
                        {item.is_dir ? 'Abrir carpeta →' : 'Editar →'}
                      </span>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
