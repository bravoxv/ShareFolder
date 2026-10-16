import React, { useState } from 'react';
import { 
  Share2, 
  Copy, 
  Check 
} from 'lucide-react';

interface ShareFilesModalProps {
  serverFolder: string;
  files: { name: string; is_dir: boolean; size: number }[];
  isOpen: boolean;
  onClose: () => void;
}

export const ShareFilesModal: React.FC<ShareFilesModalProps> = ({
  serverFolder,
  files,
  isOpen,
  onClose
}) => {
  const [copiedLink, setCopiedLink] = useState(false);
  const shareToken = 'hs-share-' + crypto.randomUUID().slice(0, 8);
  const shareUrl = `https://hostshift.gg/sync/${shareToken}?dir=${encodeURIComponent(serverFolder)}`;

  if (!isOpen) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl text-slate-100 animate-fadeIn">
        <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-indigo-600/20 text-indigo-400 rounded-xl border border-indigo-500/30">
              <Share2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-white">Compartir Servidor y Archivos</h3>
              <p className="text-[11px] text-slate-400">Replicación directa entre candidatos P2P</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-300 text-sm font-bold"
          >
            ✕
          </button>
        </div>

        <p className="text-xs text-slate-300 leading-relaxed mb-4">
          Tus amigos que abran este enlace vincularán automáticamente esta carpeta de guardado en su propio HostShift para recibir los snapshots de sincronización:
        </p>

        {/* Caja de Enlace de Sincronización */}
        <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 mb-4">
          <span className="text-[10px] text-slate-400 block mb-1 font-mono uppercase">Enlace P2P de Sincronización:</span>
          <div className="flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={shareUrl}
              className="w-full bg-slate-900 border border-slate-700 text-xs font-mono text-cyan-300 px-3 py-1.5 rounded-lg outline-none truncate"
            />
            <button
              onClick={handleCopy}
              className="bg-indigo-600 hover:bg-indigo-500 text-white p-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1 flex-shrink-0"
            >
              {copiedLink ? <Check className="w-4 h-4 text-emerald-300" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Resumen de Archivos a Replicar */}
        <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 mb-6">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
            <span>Archivos listos para sincronizar:</span>
            <span className="font-mono text-slate-300 font-bold">{files.length} elementos</span>
          </div>
          <div className="max-h-32 overflow-y-auto font-mono text-[11px] text-slate-400 space-y-1">
            {files.map((f, i) => (
              <div key={i} className="flex items-center justify-between py-0.5">
                <span className="truncate max-w-[280px]">{f.is_dir ? `📁 ${f.name}/` : `📄 ${f.name}`}</span>
                <span>{!f.is_dir ? `${f.size} B` : ''}</span>
              </div>
            ))}
          </div>
        </div>

        <button
          onClick={onClose}
          className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold transition-all"
        >
          Entendido / Cerrar
        </button>
      </div>
    </div>
  );
};
