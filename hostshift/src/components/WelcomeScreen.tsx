import React, { useState } from 'react';
import { 
  Users, 
  PlusCircle, 
  LogIn, 
  ExternalLink, 
  KeyRound, 
  Sparkles, 
  ShieldCheck, 
  Loader2, 
  AlertCircle,
  Copy,
  FolderOpen,
  UserPlus,
  Globe,
  LogOut,
  Server,
  Trash2,
  ChevronRight,
  Play
} from 'lucide-react';
import { UserDocument, GroupDocument } from '../types/schema';
import { GroupService } from '../services/groupService';

interface WelcomeScreenProps {
  currentUser: UserDocument | null;
  onUserChanged: (user: UserDocument | null) => void;
  onGroupSelected: (group: GroupDocument, role?: string) => void;
}

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({
  currentUser,
  onUserChanged,
  onGroupSelected
}) => {
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'create' | 'join'>('create');
  const [groupNameInput, setGroupNameInput] = useState('');
  const [joinInput, setJoinInput] = useState('');
  const [showCodeInput, setShowCodeInput] = useState(false);
  const [sessionCodeInput, setSessionCodeInput] = useState('');
  const [copiedCode, setCopiedCode] = useState(false);
  const [myGroups, setMyGroups] = useState(() => GroupService.getUserGroups());

  const isBrowser = !window.__TAURI_INTERNALS__;

  // Abrir navegador para autenticarse con Google sin restricciones de WebView
  const handleOpenBrowserLogin = async () => {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('open_external_url', { url: 'http://localhost:1420' });
    } catch {
      window.open('http://localhost:1420', '_blank');
    }
  };

  // Copiar código de sesión desde el navegador hacia la app
  const handleCopyBrowserSession = () => {
    if (!currentUser) return;
    const token = btoa(JSON.stringify(currentUser));
    navigator.clipboard.writeText(token);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 3000);
  };

  // Aplicar código de sesión en la app de escritorio
  const handleApplySessionCode = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    try {
      const parsed = JSON.parse(atob(sessionCodeInput.trim()));
      if (parsed && parsed.uid && parsed.displayName) {
        onUserChanged(parsed);
        localStorage.setItem('hostshift_user', JSON.stringify(parsed));
        setShowCodeInput(false);
      } else {
        setErrorMsg('El código de sesión no es válido.');
      }
    } catch {
      setErrorMsg('Código no reconocido. Asegúrate de copiarlo completo del navegador.');
    }
  };

  // Crear grupo oficial en Firestore y asignar al usuario actual como Propietario (Owner)
  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) {
      setErrorMsg('Primero debes iniciar sesión con Google para ser el Propietario del grupo.');
      return;
    }

    const name = groupNameInput.trim();
    if (!name) {
      setErrorMsg('Por favor escribe un nombre para tu grupo.');
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    try {
      let createdGroup: GroupDocument;
      try {
        // Intento de guardado atómico en Firebase Firestore
        createdGroup = await GroupService.createGroup(name, currentUser);
      } catch (err: any) {
        console.warn('Firestore grupo fallback local:', err);
        // Fallback local garantizado si las reglas o la conexión tardan
        createdGroup = {
          id: 'grp-' + crypto.randomUUID().slice(0, 8),
          name: name,
          ownerId: currentUser.uid,
          createdAt: Date.now(),
          maxMembers: 10
        };
      }

      GroupService.saveUserGroup(createdGroup, 'owner');
      setMyGroups(GroupService.getUserGroups());
      localStorage.setItem('hostshift_active_group', JSON.stringify(createdGroup));
      onGroupSelected(createdGroup, 'owner');
    } catch (err: any) {
      setErrorMsg(err.message || 'Error al crear el grupo.');
    } finally {
      setLoading(false);
    }
  };

  // Unirse a un grupo internacional existente mediante invitación o ID
  const handleJoinGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) {
      setErrorMsg('Primero debes iniciar sesión con Google para unirte a un grupo.');
      return;
    }

    const input = joinInput.trim();
    if (!input) {
      setErrorMsg('Ingresa el enlace de invitación o el ID del grupo.');
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    try {
      const res = await GroupService.joinGroup(input, currentUser);
      if (res.success && res.group) {
        GroupService.saveUserGroup(res.group, res.role || 'player');
        setMyGroups(GroupService.getUserGroups());
        localStorage.setItem('hostshift_active_group', JSON.stringify(res.group));
        onGroupSelected(res.group, res.role || 'player');
      } else {
        setErrorMsg(res.reason || 'No se pudo unir al grupo. Verifica el enlace.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Fallo al unirse al grupo.');
    } finally {
      setLoading(false);
    }
  };

  // Desloguear de la cuenta de Google
  const handleLogout = async () => {
    try {
      await GroupService.logout();
    } catch (err) {
      console.warn('Error en GroupService.logout():', err);
    }
    localStorage.removeItem('hostshift_user');
    localStorage.removeItem('hostshift_active_group');
    onUserChanged(null);
  };

  return (
    <div className="min-h-screen w-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6 relative overflow-hidden">
      {/* Luces y degradados decorativos de fondo */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-cyan-600/10 rounded-full blur-3xl pointer-events-none" />

      <div className={`w-full ${currentUser ? 'max-w-4xl' : 'max-w-md'} bg-slate-900/90 border border-slate-800 rounded-3xl p-8 shadow-2xl backdrop-blur relative z-10 animate-fadeIn transition-all duration-300`}>
        
        {/* Cabecera / Marca */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 mb-2">
            <span className="text-3xl font-black bg-gradient-to-r from-indigo-400 via-cyan-400 to-emerald-400 bg-clip-text text-transparent">
              HostShift
            </span>
            <span className="text-[11px] bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-2.5 py-0.5 rounded-full font-mono">
              v0.1.0
            </span>
          </div>
          <p className="text-xs text-slate-400">
            Comparte y aloja servidores dedicados de juegos entre amigos sin host 24/7.
          </p>
        </div>

        {/* Mensaje de Error si surge */}
        {errorMsg && (
          <div className="mb-6 p-3 bg-rose-500/15 border border-rose-500/30 rounded-xl text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* PASO 1: AUTENTICACIÓN CON GOOGLE */}
        {!currentUser ? (
          <div className="space-y-4">
            <div className="p-4 bg-slate-950 border border-slate-800 rounded-2xl text-center space-y-3">
              <div className="w-12 h-12 mx-auto rounded-full bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-slate-200">Identifícate con Google</h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Para poder crear un grupo privado y registrarte como <strong>Propietario</strong> legítimo del servidor.
                </p>
              </div>

              {isBrowser ? (
                /* En el navegador web oficial */
                <button
                  onClick={async () => {
                    setLoading(true);
                    try {
                      const user = await GroupService.loginWithGoogle();
                      onUserChanged(user);
                    } catch (err: any) {
                      setErrorMsg(err.message || 'Error con Google Sign-In');
                    } finally {
                      setLoading(false);
                    }
                  }}
                  disabled={loading}
                  className="w-full py-3 px-4 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white rounded-xl text-xs font-bold shadow-lg shadow-indigo-900/30 flex items-center justify-center gap-2 transition-all hover:scale-[1.02]"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />}
                  {loading ? 'Conectando...' : 'Iniciar Sesión con Google'}
                </button>
              ) : (
                /* En la aplicación de escritorio */
                <div className="space-y-2 pt-1">
                  <button
                    onClick={handleOpenBrowserLogin}
                    className="w-full py-3 px-4 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white rounded-xl text-xs font-bold shadow-lg shadow-indigo-900/30 flex items-center justify-center gap-2 transition-all hover:scale-[1.02]"
                  >
                    <ExternalLink className="w-4 h-4" />
                    Iniciar Sesión con Google (Navegador)
                  </button>

                  {!showCodeInput ? (
                    <button
                      onClick={() => setShowCodeInput(true)}
                      className="text-xs text-emerald-400 hover:text-emerald-300 font-medium py-1 flex items-center justify-center gap-1.5 mx-auto transition-colors"
                    >
                      <KeyRound className="w-3.5 h-3.5" />
                      ¿Ya iniciaste en Chrome/Edge? Pegar código
                    </button>
                  ) : (
                    <form onSubmit={handleApplySessionCode} className="pt-2 space-y-2 text-left">
                      <input
                        type="text"
                        required
                        placeholder="Pega el código copiado aquí..."
                        value={sessionCodeInput}
                        onChange={(e) => setSessionCodeInput(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 text-xs font-mono text-slate-200 px-3 py-2 rounded-xl outline-none focus:border-emerald-500"
                      />
                      <div className="flex gap-2">
                        <button
                          type="submit"
                          className="flex-1 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition-all"
                        >
                          Vincular Sesión
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowCodeInput(false)}
                          className="px-3 py-1.5 bg-slate-800 text-slate-400 rounded-lg text-xs"
                        >
                          Cancelar
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              )}
            </div>
          </div>
        ) : (
          /* PASO 2: USUARIO AUTENTICADO ➔ DISTRIBUCIÓN EN 2 COLUMNAS */
          <div className="space-y-6">
            {/* Barra superior del usuario logueado */}
            <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400 font-black text-sm uppercase">
                  {currentUser.displayName.charAt(0)}
                </div>
                <div>
                  <span className="text-xs font-bold text-slate-200 block">
                    {currentUser.displayName}
                  </span>
                  <span className="text-[11px] text-emerald-400 font-mono">
                    {currentUser.email || currentUser.uid.slice(0, 14)}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {isBrowser && (
                  <button
                    onClick={handleCopyBrowserSession}
                    title="Copiar código para llevarlo a la app de escritorio"
                    className="px-2.5 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/30 rounded-lg text-[10px] font-bold flex items-center gap-1.5 transition-all"
                  >
                    <Copy className="w-3 h-3" />
                    {copiedCode ? '¡Copiado!' : 'Copiar a la App'}
                  </button>
                )}
                <button
                  onClick={handleLogout}
                  title="Cerrar sesión de Google"
                  className="px-2.5 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded-lg text-[10px] font-bold flex items-center gap-1 transition-all"
                >
                  <LogOut className="w-3 h-3" />
                  Salir
                </button>
              </div>
            </div>

            {/* CUERPO PRINCIPAL: IZQUIERDA (CREAR O UNIRSE) | DERECHA (GRUPOS CREADOS POR EL PROPIETARIO) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
              
              {/* COLUMNA IZQUIERDA: CREAR NUEVO GRUPO O UNIRSE A UNO */}
              <div className="space-y-4">
                {/* Selector de Pestaña */}
                <div className="flex bg-slate-950 p-1 rounded-2xl border border-slate-800">
                  <button
                    type="button"
                    onClick={() => { setActiveTab('create'); setErrorMsg(null); }}
                    className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 ${
                      activeTab === 'create'
                        ? 'bg-gradient-to-r from-cyan-600 to-indigo-600 text-white shadow-md'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <PlusCircle className="w-3.5 h-3.5" /> Crear Grupo
                  </button>
                  <button
                    type="button"
                    onClick={() => { setActiveTab('join'); setErrorMsg(null); }}
                    className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 ${
                      activeTab === 'join'
                        ? 'bg-gradient-to-r from-cyan-600 to-indigo-600 text-white shadow-md'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Globe className="w-3.5 h-3.5" /> Unirse a Grupo
                  </button>
                </div>

                {activeTab === 'create' ? (
                  /* Formulario limpio para Crear Grupo */
                  <form onSubmit={handleCreateGroup} className="space-y-4 bg-slate-950/60 p-5 rounded-2xl border border-slate-800/80">
                    <div>
                      <label className="text-xs text-slate-300 font-semibold block mb-1.5 flex items-center gap-1.5">
                        <Users className="w-4 h-4 text-cyan-400" />
                        Nombre del Nuevo Grupo:
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="Ej: Minecraft Survival, Valheim Squad, Palworld..."
                        value={groupNameInput}
                        onChange={(e) => setGroupNameInput(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 text-xs font-semibold text-slate-100 px-3.5 py-2.5 rounded-xl outline-none focus:border-cyan-500 placeholder-slate-600"
                      />
                    </div>

                    <div className="p-3 bg-indigo-950/30 border border-indigo-500/20 rounded-xl text-[11px] text-slate-400 space-y-1">
                      <div className="flex items-center gap-1.5 text-indigo-300 font-semibold">
                        <Sparkles className="w-3.5 h-3.5 text-indigo-400" /> Propietario Legítimo
                      </div>
                      <p>
                        Se creará el grupo en Firebase y serás el <strong>Owner</strong>. Dentro podrás configurar y prender los servidores dedicados.
                      </p>
                    </div>

                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full py-3 bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-cyan-900/30 flex items-center justify-center gap-2 transition-all hover:scale-[1.02] disabled:opacity-50"
                    >
                      {loading ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <PlusCircle className="w-4 h-4" />
                      )}
                      {loading ? 'Creando Grupo en Firebase...' : 'Crear Grupo'}
                    </button>
                  </form>
                ) : (
                  /* Formulario para Unirse a un Grupo */
                  <form onSubmit={handleJoinGroup} className="space-y-4 bg-slate-950/60 p-5 rounded-2xl border border-slate-800/80">
                    <div>
                      <label className="text-xs text-slate-300 font-semibold block mb-1.5 flex items-center gap-1.5">
                        <Globe className="w-4 h-4 text-emerald-400" />
                        Enlace de Invitación o ID de Grupo:
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="https://hostshift.gg/join/hs-12345 o grp-uuid..."
                        value={joinInput}
                        onChange={(e) => setJoinInput(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 text-xs font-mono text-slate-100 px-3.5 py-2.5 rounded-xl outline-none focus:border-emerald-500 placeholder-slate-600"
                      />
                    </div>

                    <div className="p-3 bg-emerald-950/20 border border-emerald-500/20 rounded-xl text-[11px] text-slate-400 space-y-1">
                      <div className="flex items-center gap-1.5 text-emerald-300 font-semibold">
                        <UserPlus className="w-3.5 h-3.5 text-emerald-400" /> Conexión Internacional
                      </div>
                      <p>
                        Te unirás al grupo compartido mediante Firebase para sincronizar archivos y conectarte al host.
                      </p>
                    </div>

                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-emerald-900/30 flex items-center justify-center gap-2 transition-all hover:scale-[1.02] disabled:opacity-50"
                    >
                      {loading ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <UserPlus className="w-4 h-4" />
                      )}
                      {loading ? 'Verificando con Firebase...' : 'Unirse al Grupo'}
                    </button>
                  </form>
                )}
              </div>

              {/* COLUMNA DERECHA: GRUPOS CREADOS POR EL PROPIETARIO Y SUS SERVIDORES */}
              <div className="space-y-3 bg-slate-950/80 p-5 rounded-2xl border border-slate-800">
                <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
                  <div>
                    <h3 className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                      <Server className="w-4 h-4 text-cyan-400" /> Grupos y Servidores ({myGroups.length})
                    </h3>
                    <p className="text-[10px] text-slate-500 mt-0.5">
                      Grupos creados listos para encender
                    </p>
                  </div>
                  <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full font-mono">
                    {currentUser.displayName}
                  </span>
                </div>

                {myGroups.length === 0 ? (
                  <div className="text-center py-8 text-slate-500 space-y-2">
                    <Server className="w-8 h-8 mx-auto text-slate-600 opacity-50" />
                    <p className="text-xs">Aún no tienes grupos creados.</p>
                    <p className="text-[11px] text-slate-600">
                      Usa el panel de la izquierda para crear tu primer grupo.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
                    {myGroups.map(({ group, role }) => {
                      const cfg = GroupService.getGroupServerConfig(group.id);
                      return (
                        <div
                          key={group.id}
                          className="group p-3 rounded-xl bg-slate-900 hover:bg-slate-850 border border-slate-800 hover:border-cyan-500/40 transition-all cursor-pointer shadow-sm hover:shadow-cyan-950/20"
                          onClick={() => {
                            localStorage.setItem('hostshift_active_group', JSON.stringify(group));
                            onGroupSelected(group, role);
                          }}
                        >
                          <div className="flex items-center justify-between mb-1.5">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-slate-100 group-hover:text-cyan-300 transition-colors truncate max-w-[170px]">
                                {group.name}
                              </span>
                              <span className={`text-[9px] px-1.5 py-0.5 rounded font-mono uppercase font-bold tracking-wider ${
                                role === 'owner' 
                                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' 
                                  : 'bg-slate-800 text-slate-400 border border-slate-700'
                              }`}>
                                {role === 'owner' ? '👑 Owner' : role}
                              </span>
                            </div>

                            <button
                              type="button"
                              title="Eliminar de mi lista"
                              onClick={(e) => {
                                e.stopPropagation();
                                const updated = myGroups.filter(item => item.group.id !== group.id);
                                localStorage.setItem('hostshift_my_groups', JSON.stringify(updated));
                                setMyGroups(updated);
                              }}
                              className="p-1 text-slate-600 hover:text-rose-400 opacity-20 group-hover:opacity-100 transition-all rounded hover:bg-rose-500/10"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          {/* Servidor configurado en este grupo */}
                          <div className="bg-slate-950/80 p-2 rounded-lg border border-slate-800/60 mb-2 space-y-1">
                            <div className="flex items-center justify-between text-[10px]">
                              <span className="text-slate-400 flex items-center gap-1 font-mono">
                                <Server className="w-3 h-3 text-cyan-400" /> Servidor:
                              </span>
                              <span className="text-slate-300 font-semibold truncate max-w-[140px]">
                                {cfg.launcherFile ? cfg.launcherFile : 'Listo para asignar'}
                              </span>
                            </div>

                            {cfg.serverFolder && (
                              <div className="text-[10px] text-slate-500 font-mono truncate flex items-center gap-1">
                                <FolderOpen className="w-3 h-3 text-indigo-400 flex-shrink-0" />
                                <span className="truncate">{cfg.serverFolder}</span>
                              </div>
                            )}
                          </div>

                          <div className="flex items-center justify-between pt-1">
                            <span className="text-[10px] text-slate-500 font-mono">
                              ID: {group.id.slice(0, 8)}...
                            </span>
                            <span className="text-xs font-bold text-cyan-400 flex items-center gap-1 group-hover:translate-x-0.5 transition-transform">
                              <span>Abrir y Prender</span>
                              <ChevronRight className="w-3.5 h-3.5" />
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

            </div>
          </div>
        )}

      </div>
    </div>
  );
};
