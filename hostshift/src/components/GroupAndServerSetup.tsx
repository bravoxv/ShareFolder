import { useState } from 'react';
import { 
  Users, 
  PlusCircle, 
  ShieldCheck, 
  Copy, 
  Check 
} from 'lucide-react';
import { Role } from '../types/models';

interface GroupManagerProps {
  currentUserId: string;
  currentUserName: string;
  currentRole: Role;
}

export const GroupAndServerSetup: React.FC<GroupManagerProps> = ({
  currentUserId,
  currentUserName,
  currentRole
}) => {
  const [activeTab, setActiveTab] = useState<'group' | 'members'>('group');
  const [groupName, setGroupName] = useState('Los Pibes Gaming');
  const inviteCode = 'hs-invite-9482-xy';
  const [copied, setCopied] = useState(false);

  const copyInvite = () => {
    navigator.clipboard.writeText(`https://hostshift.gg/join/${inviteCode}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-4xl mx-auto mb-8 shadow-xl">
      {/* Selector de pestañas */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-6">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('group')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
              activeTab === 'group'
                ? 'bg-indigo-600 text-white'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <Users className="w-4 h-4" />
            Mi Grupo y Propietario
          </button>

          <button
            onClick={() => setActiveTab('members')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
              activeTab === 'members'
                ? 'bg-indigo-600 text-white'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            Roles y Candidatos
          </button>
        </div>

        <span className="text-xs bg-slate-800 text-slate-300 px-3 py-1 rounded-full border border-slate-700">
          ID Grupo: <span className="font-mono text-indigo-400">grp-survival-squad</span>
        </span>
      </div>

      {/* Pestaña 1: Configuración del Grupo y Propietario */}
      {activeTab === 'group' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-slate-950/60 p-5 rounded-xl border border-slate-800">
              <h3 className="text-sm font-bold text-slate-200 mb-2 flex items-center gap-2">
                <Users className="w-4 h-4 text-indigo-400" /> Datos del Grupo
              </h3>
              <p className="text-xs text-slate-400 mb-4">
                El grupo es tu espacio privado donde residen los servidores y candidatos a host.
              </p>

              <label className="text-xs text-slate-400 block mb-1">Nombre del Grupo</label>
              <input
                type="text"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                disabled={currentRole !== 'owner'}
                className="w-full bg-slate-900 border border-slate-700 text-slate-100 px-3 py-2 rounded-lg text-sm mb-4 focus:border-indigo-500 outline-none"
              />

              <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-800">
                <span className="text-slate-400">Propietario Legítimo:</span>
                <span className="font-semibold text-amber-300 flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5" /> {currentUserName} (Tú)
                </span>
              </div>
            </div>

            {/* Invitaciones */}
            <div className="bg-slate-950/60 p-5 rounded-xl border border-slate-800">
              <h3 className="text-sm font-bold text-slate-200 mb-2 flex items-center gap-2">
                <PlusCircle className="w-4 h-4 text-emerald-400" /> Invitar Amigos al Grupo
              </h3>
              <p className="text-xs text-slate-400 mb-4">
                Comparte este enlace privado con tus amigos para unirse.
              </p>

              <label className="text-xs text-slate-400 block mb-1">Enlace de Invitación</label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={`https://hostshift.gg/join/${inviteCode}`}
                  className="w-full bg-slate-900 border border-slate-700 font-mono text-xs text-emerald-400 px-3 py-2 rounded-lg outline-none"
                />
                <button
                  onClick={copyInvite}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-200 p-2 rounded-lg border border-slate-700 transition-all flex items-center gap-1"
                >
                  {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>

              <div className="mt-4 text-[11px] text-slate-500">
                Los nuevos miembros entran con rol de <strong>Jugador</strong>. Podrás promover a quienes tengan buena PC a <strong>Candidato a Host</strong>.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Pestaña 2: Gestión de Miembros y Roles */}
      {activeTab === 'members' && (
        <div className="space-y-4">
          <div className="bg-slate-950/60 p-5 rounded-xl border border-slate-800">
            <h3 className="text-sm font-bold text-slate-200 mb-1 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-indigo-400" /> Miembros del Grupo y Permisos
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              Solo los usuarios con rol de <strong>Host</strong> pueden encender la máquina y almacenar copias en su disco.
            </p>

            <div className="divide-y divide-slate-800">
              <div className="py-3 flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                    {currentUserName} <span className="text-xs text-indigo-400">(Tú)</span>
                  </div>
                  <div className="text-xs text-slate-500">ID: {currentUserId}</div>
                </div>
                <span className="text-xs px-2.5 py-1 bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-lg font-bold">
                  PROPIETARIO
                </span>
              </div>

              <div className="py-3 flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-slate-200">Lucas_Gamer</div>
                  <div className="text-xs text-slate-500">ID: usr-lucas-88</div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs px-2.5 py-1 bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 rounded-lg font-medium">
                    CANDIDATO A HOST
                  </span>
                </div>
              </div>

              <div className="py-3 flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-slate-200">Agustin99</div>
                  <div className="text-xs text-slate-500">ID: usr-agus-42</div>
                </div>
                <span className="text-xs px-2.5 py-1 bg-slate-800 text-slate-400 rounded-lg">
                  JUGADOR
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
