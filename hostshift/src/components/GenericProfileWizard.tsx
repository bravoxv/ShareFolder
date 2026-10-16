import React, { useState } from 'react';
import { 
  Plus, 
  Terminal, 
  Save, 
  FolderSync, 
  Network, 
  Sparkles,
  FileCode
} from 'lucide-react';
import { CustomGameProfileDefinition, COMMUNITY_PRESETS } from '../profiles/customProfileBuilder';

interface Props {
  onProfileCreated: (profile: CustomGameProfileDefinition) => void;
  onCancel: () => void;
}

export const GenericProfileWizard: React.FC<Props> = ({ onProfileCreated, onCancel }) => {
  const [activeStep, setActiveStep] = useState<'preset' | 'custom'>('preset');

  // Estado del formulario genérico para CUALQUIER juego
  const [profileName, setProfileName] = useState('');
  const [category, setCategory] = useState('Supervivencia / Sandbox');
  const [executable, setExecutable] = useState('');
  const [defaultArgs, setDefaultArgs] = useState('');
  const [stopCommand, setStopCommand] = useState('stop');
  const [port, setPort] = useState(25565);
  const [protocol, setProtocol] = useState<'tcp' | 'udp'>('udp');
  const [syncFolders, setSyncFolders] = useState('Saved, SaveGames');
  const [watchLogPattern, setWatchLogPattern] = useState('Saved game, World save completed');
  const [saveCommand, setSaveCommand] = useState('save');

  const handleSelectPreset = (preset: CustomGameProfileDefinition) => {
    setProfileName(preset.name);
    setCategory(preset.gameCategory);
    setExecutable(preset.executable);
    setDefaultArgs(preset.defaultArgs.join(' '));
    setStopCommand(preset.stopCommand || '');
    setPort(preset.ports[0]?.port || 7777);
    setProtocol(preset.ports[0]?.protocol || 'udp');
    setSyncFolders(preset.syncFolders.join(', '));
    setWatchLogPattern(preset.saveTriggers.logPatterns.join(', '));
    setSaveCommand(preset.saveTriggers.preCopyCommands.join(', '));
    setActiveStep('custom');
  };

  const handleSaveProfile = () => {
    if (!profileName.trim() || !executable.trim()) {
      alert('Por favor ingresa al menos el Nombre del Juego y el Archivo Ejecutable.');
      return;
    }

    const newProfile: CustomGameProfileDefinition = {
      id: profileName.toLowerCase().replace(/[^a-z0-9]/g, '-'),
      name: profileName,
      gameCategory: category,
      executable: executable,
      defaultArgs: defaultArgs.split(' ').filter(Boolean),
      stopCommand: stopCommand.trim() || undefined,
      ports: [{ port: Number(port), protocol, label: 'Puerto Principal de Juego' }],
      syncFolders: syncFolders.split(',').map(s => s.trim()).filter(Boolean),
      ignoredPatterns: ['*.tmp', '*.log', 'Logs/*'],
      saveTriggers: {
        watchPaths: syncFolders.split(',').map(s => s.trim()).filter(Boolean),
        logPatterns: watchLogPattern.split(',').map(s => s.trim()).filter(Boolean),
        debounceMs: 4000,
        minIntervalSec: 600,
        preCopyCommands: saveCommand.split(',').map(s => s.trim()).filter(Boolean),
        postCopyCommands: []
      }
    };

    onProfileCreated(newProfile);
  };

  return (
    <div className="bg-slate-950 p-6 rounded-2xl border border-indigo-500/30 text-slate-100 shadow-2xl">
      <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-6">
        <div>
          <h3 className="text-lg font-bold flex items-center gap-2 text-white">
            <Sparkles className="w-5 h-5 text-indigo-400" />
            Asistente Universal: Crear Perfil para Cualquier Juego
          </h3>
          <p className="text-xs text-slate-400">
            Define cómo arrancar, qué puertos mapear y qué carpetas replicar vía P2P.
          </p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setActiveStep('preset')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
              activeStep === 'preset' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-300'
            }`}
          >
            Biblioteca de Juegos Populares
          </button>
          <button
            onClick={() => setActiveStep('custom')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
              activeStep === 'custom' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-300'
            }`}
          >
            Juego 100% Personalizado
          </button>
        </div>
      </div>

      {activeStep === 'preset' ? (
        <div>
          <p className="text-xs text-slate-400 mb-4">
            Selecciona un perfil preconfigurado de la comunidad o úsalo como plantilla para adaptarlo:
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6 max-h-72 overflow-y-auto">
            {COMMUNITY_PRESETS.map((preset) => (
              <div
                key={preset.id}
                onClick={() => handleSelectPreset(preset)}
                className="bg-slate-900/80 hover:bg-slate-800/90 border border-slate-800 hover:border-indigo-500/50 p-4 rounded-xl cursor-pointer transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-sm text-slate-200">{preset.name}</span>
                    <span className="text-[10px] bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded-full font-mono uppercase">
                      {preset.ports[0]?.protocol} :{preset.ports[0]?.port}
                    </span>
                  </div>
                  <span className="text-xs text-slate-500 block mb-2">{preset.gameCategory}</span>
                  <div className="text-[11px] font-mono text-slate-400 bg-slate-950 px-2.5 py-1.5 rounded border border-slate-800/80 truncate">
                    {preset.executable}
                  </div>
                </div>
                <div className="mt-3 text-[11px] text-indigo-400 flex items-center gap-1 font-medium">
                  <Plus className="w-3.5 h-3.5" /> Usar esta plantilla
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-slate-400 block mb-1">Nombre del Juego / Servidor</label>
              <input
                type="text"
                placeholder="ej: Rust, Enshrouded, Satisfactory..."
                value={profileName}
                onChange={(e) => setProfileName(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 text-slate-200 text-xs px-3 py-2 rounded-lg outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1">Categoría</label>
              <input
                type="text"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 text-slate-200 text-xs px-3 py-2 rounded-lg outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <label className="text-xs text-slate-400 block mb-1 flex items-center gap-1.5">
                <FileCode className="w-3.5 h-3.5 text-indigo-400" />
                Nombre del Ejecutable (.exe, .bat o binario)
              </label>
              <input
                type="text"
                placeholder="ej: PalServer.exe, ShooterGameServer.exe, RustDedicated.exe"
                value={executable}
                onChange={(e) => setExecutable(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 font-mono text-slate-200 text-xs px-3 py-2 rounded-lg outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1 flex items-center gap-1.5">
                <Network className="w-3.5 h-3.5 text-emerald-400" />
                Puerto y Protocolo
              </label>
              <div className="flex gap-2">
                <input
                  type="number"
                  value={port}
                  onChange={(e) => setPort(Number(e.target.value))}
                  className="w-2/3 bg-slate-900 border border-slate-700 font-mono text-slate-200 text-xs px-2 py-2 rounded-lg outline-none"
                />
                <select
                  value={protocol}
                  onChange={(e) => setProtocol(e.target.value as 'tcp' | 'udp')}
                  className="w-1/3 bg-slate-900 border border-slate-700 text-xs text-slate-300 rounded-lg outline-none uppercase font-semibold"
                >
                  <option value="udp">UDP</option>
                  <option value="tcp">TCP</option>
                </select>
              </div>
            </div>
          </div>

          <div>
            <label className="text-xs text-slate-400 block mb-1">Argumentos de Arranque (opcional)</label>
            <input
              type="text"
              placeholder="ej: -batchmode -nographics -port 8211"
              value={defaultArgs}
              onChange={(e) => setDefaultArgs(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 font-mono text-slate-200 text-xs px-3 py-2 rounded-lg outline-none"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-slate-400 block mb-1 flex items-center gap-1.5">
                <FolderSync className="w-3.5 h-3.5 text-cyan-400" />
                Carpetas de Guardado a Replicar P2P
              </label>
              <input
                type="text"
                placeholder="ej: Saves, Saved/SaveGames, world"
                value={syncFolders}
                onChange={(e) => setSyncFolders(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 font-mono text-slate-200 text-xs px-3 py-2 rounded-lg outline-none"
              />
              <span className="text-[10px] text-slate-500 mt-0.5 block">Separadas por comas. Solo estas carpetas viajarán a los candidatos.</span>
            </div>

            <div>
              <label className="text-xs text-slate-400 block mb-1 flex items-center gap-1.5">
                <Terminal className="w-3.5 h-3.5 text-amber-400" />
                Comando de Apagado Limpio y Guardado
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Apagado (ej: quit, stop)"
                  value={stopCommand}
                  onChange={(e) => setStopCommand(e.target.value)}
                  className="w-1/2 bg-slate-900 border border-slate-700 text-slate-200 text-xs px-3 py-2 rounded-lg outline-none"
                />
                <input
                  type="text"
                  placeholder="Guardado (ej: save, saveworld)"
                  value={saveCommand}
                  onChange={(e) => setSaveCommand(e.target.value)}
                  className="w-1/2 bg-slate-900 border border-slate-700 text-slate-200 text-xs px-3 py-2 rounded-lg outline-none"
                />
              </div>
              <span className="text-[10px] text-slate-500 mt-0.5 block">Si el juego no usa consola, déjalo vacío (se usará señal de proceso).</span>
            </div>
          </div>
        </div>
      )}

      {/* Botones de acción */}
      <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-slate-800">
        <button
          onClick={onCancel}
          className="px-4 py-2 text-slate-400 hover:text-slate-200 text-xs font-semibold"
        >
          Cancelar
        </button>
        {activeStep === 'custom' && (
          <button
            onClick={handleSaveProfile}
            className="flex items-center gap-1.5 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-indigo-900/30 transition-all"
          >
            <Save className="w-4 h-4" />
            Guardar Perfil Universal
          </button>
        )}
      </div>
    </div>
  );
};
