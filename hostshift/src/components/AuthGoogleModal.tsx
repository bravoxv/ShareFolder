import React, { useState } from 'react';
import { 
  LogIn, 
  LogOut, 
  ShieldCheck, 
  CheckCircle2, 
  AlertCircle,
  Mail,
  UserCheck
} from 'lucide-react';
import { UserDocument } from '../types/schema';

interface AuthGoogleModalProps {
  currentUser: UserDocument | null;
  onUserChanged: (user: UserDocument | null) => void;
}

export const AuthGoogleModal: React.FC<AuthGoogleModalProps> = ({
  currentUser,
  onUserChanged
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [emailInput, setEmailInput] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleAuthorizeAccount = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const email = emailInput.trim();
    if (!email || !email.includes('@')) {
      setErrorMsg('Por favor ingresa un correo de Google válido (ej: tu_nombre@gmail.com).');
      return;
    }

    const displayName = nameInput.trim() || email.split('@')[0];
    const capitalizedName = displayName.charAt(0).toUpperCase() + displayName.slice(1);

    // Identidad persistente generada para el coordinador
    const user: UserDocument = {
      uid: 'usr-' + btoa(email.toLowerCase()).replace(/[^a-zA-Z0-9]/g, '').slice(0, 16),
      displayName: capitalizedName,
      email: email.toLowerCase(),
      createdAt: Date.now()
    };

    onUserChanged(user);
    localStorage.setItem('hostshift_user', JSON.stringify(user));
    setIsOpen(false);
    setEmailInput('');
    setNameInput('');
  };

  const handleLogout = () => {
    localStorage.removeItem('hostshift_user');
    onUserChanged(null);
  };

  return (
    <div>
      {currentUser ? (
        <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400 font-bold text-xs uppercase">
              {currentUser.displayName.charAt(0)}
            </div>
            <div>
              <span className="text-xs font-bold text-slate-200 block truncate max-w-[130px]">
                {currentUser.displayName}
              </span>
              <span className="text-[10px] text-emerald-400 flex items-center gap-1 font-mono truncate max-w-[130px]">
                <CheckCircle2 className="w-2.5 h-2.5 flex-shrink-0" /> {currentUser.email}
              </span>
            </div>
          </div>
          <button
            onClick={handleLogout}
            title="Cerrar Sesión"
            className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-slate-900 rounded-lg transition-colors"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <button
          onClick={() => setIsOpen(true)}
          className="w-full py-2.5 px-3 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white rounded-xl text-xs font-bold shadow-lg shadow-indigo-900/30 flex items-center justify-center gap-2 transition-all hover:scale-[1.02]"
        >
          <LogIn className="w-4 h-4" />
          Identificarse con Cuenta Google
        </button>
      )}

      {/* Modal Directo e Instantáneo */}
      {isOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-sm w-full p-6 shadow-2xl text-slate-100 animate-fadeIn">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 bg-indigo-600/20 text-indigo-400 rounded-xl border border-indigo-500/30">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-base text-white">Identidad del Propietario</h3>
                <p className="text-xs text-slate-400">Vinculación de cuenta para el grupo</p>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed mb-4">
              Ingresa el correo de tu cuenta de Google para registrarte como <strong>Propietario Legítimo</strong> y poder firmar configuraciones y compartir el servidor:
            </p>

            {errorMsg && (
              <div className="mb-4 p-3 bg-rose-500/20 border border-rose-500/30 rounded-xl text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <form onSubmit={handleAuthorizeAccount} className="space-y-3">
              <div>
                <label className="text-xs text-slate-400 block mb-1 font-medium flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-indigo-400" /> Correo de Google (Gmail):
                </label>
                <input
                  type="email"
                  required
                  placeholder="ej: tu_nombre@gmail.com"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 text-xs font-mono text-slate-200 px-3 py-2 rounded-lg outline-none focus:border-indigo-500 placeholder-slate-600"
                />
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1 font-medium flex items-center gap-1.5">
                  <UserCheck className="w-3.5 h-3.5 text-indigo-400" /> Nombre visible (opcional):
                </label>
                <input
                  type="text"
                  placeholder="ej: Matias"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 text-xs text-slate-200 px-3 py-2 rounded-lg outline-none focus:border-indigo-500 placeholder-slate-600"
                />
              </div>

              <button
                type="submit"
                className="w-full mt-2 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-2 shadow-xl transition-all"
              >
                <CheckCircle2 className="w-4 h-4" />
                Autorizar y Guardar Cuenta
              </button>
            </form>

            <button
              onClick={() => setIsOpen(false)}
              className="w-full mt-3 py-2 text-slate-500 hover:text-slate-300 text-xs font-semibold transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
