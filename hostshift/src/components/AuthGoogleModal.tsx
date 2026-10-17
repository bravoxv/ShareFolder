import React, { useState, useEffect } from 'react';
import { 
  LogIn, 
  LogOut, 
  CheckCircle2, 
  AlertCircle,
  Loader2,
  Mail,
  UserPlus
} from 'lucide-react';
import { UserDocument } from '../types/schema';
import { auth, db, googleProvider } from '../services/firebase';
import { 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword 
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';

interface AuthGoogleModalProps {
  currentUser: UserDocument | null;
  onUserChanged: (user: UserDocument | null) => void;
}

export const AuthGoogleModal: React.FC<AuthGoogleModalProps> = ({
  currentUser,
  onUserChanged
}) => {
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showEmailFallback, setShowEmailFallback] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  useEffect(() => {
    // Escuchar estado real de autenticación de Firebase
    const unsubscribe = onAuthStateChanged(auth, async (fireUser) => {
      if (fireUser) {
        try {
          const userRef = doc(db, 'users', fireUser.uid);
          const snap = await getDoc(userRef);

          let userDoc: UserDocument;
          if (snap.exists()) {
            userDoc = snap.data() as UserDocument;
          } else {
            userDoc = {
              uid: fireUser.uid,
              displayName: fireUser.displayName || fireUser.email?.split('@')[0] || 'Usuario',
              email: fireUser.email || undefined,
              createdAt: Date.now()
            };
            await setDoc(userRef, userDoc, { merge: true });
          }

          onUserChanged(userDoc);
          localStorage.setItem('hostshift_user', JSON.stringify(userDoc));
        } catch (e: any) {
          console.warn('Error sincronizando perfil en Firestore:', e);
          const fallbackUser: UserDocument = {
            uid: fireUser.uid,
            displayName: fireUser.displayName || fireUser.email?.split('@')[0] || 'Usuario',
            email: fireUser.email || undefined,
            createdAt: Date.now()
          };
          onUserChanged(fallbackUser);
          localStorage.setItem('hostshift_user', JSON.stringify(fallbackUser));
        }
      }
    });

    return () => unsubscribe();
  }, [onUserChanged]);

  const handleGoogleSignIn = async () => {
    setErrorMsg(null);
    setLoading(true);

    try {
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;

      const userDoc: UserDocument = {
        uid: user.uid,
        displayName: user.displayName || user.email?.split('@')[0] || 'Usuario',
        email: user.email || undefined,
        createdAt: Date.now()
      };

      try {
        await setDoc(doc(db, 'users', user.uid), userDoc, { merge: true });
      } catch (err) {
        console.warn('Firestore setDoc user info warning:', err);
      }

      onUserChanged(userDoc);
      localStorage.setItem('hostshift_user', JSON.stringify(userDoc));
    } catch (error: any) {
      console.error('Error durante Google Sign-In:', error);
      if (error.code === 'auth/popup-blocked') {
        setErrorMsg('El WebView de Windows bloqueó la ventana emergente. Usa el formulario de abajo.');
        setShowEmailFallback(true);
      } else if (error.code === 'auth/popup-closed-by-user') {
        setErrorMsg('Ventana cerrada antes de completar el inicio de sesión.');
      } else if (error.code === 'auth/unauthorized-domain') {
        setErrorMsg('Dominio no autorizado en Firebase. Añade localhost a los dominios autorizados de Auth.');
      } else {
        setErrorMsg(error.message || 'Error al autenticarse con Google');
        setShowEmailFallback(true);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    setErrorMsg(null);
    setLoading(true);

    try {
      let userCredential;
      if (authMode === 'login') {
        userCredential = await signInWithEmailAndPassword(auth, email.trim(), password);
      } else {
        userCredential = await createUserWithEmailAndPassword(auth, email.trim(), password);
      }

      const user = userCredential.user;
      const userDoc: UserDocument = {
        uid: user.uid,
        displayName: email.split('@')[0],
        email: user.email || email,
        createdAt: Date.now()
      };

      await setDoc(doc(db, 'users', user.uid), userDoc, { merge: true });
      onUserChanged(userDoc);
      localStorage.setItem('hostshift_user', JSON.stringify(userDoc));
      setShowEmailFallback(false);
    } catch (err: any) {
      console.error('Email Auth Error:', err);
      if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        setErrorMsg('Contraseña incorrecta o credencial inválida.');
      } else if (err.code === 'auth/email-already-in-use') {
        setErrorMsg('Ese correo ya está registrado. Cambia a "Iniciar Sesión" con tu contraseña.');
        setAuthMode('login');
      } else if (err.code === 'auth/user-not-found') {
        setErrorMsg('El usuario no existe. Cambia a la pestaña "Registrarse".');
        setAuthMode('register');
      } else if (err.code === 'auth/weak-password') {
        setErrorMsg('La contraseña debe tener al menos 6 caracteres.');
      } else {
        setErrorMsg(err.message || 'Error de autenticación');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (e) {
      console.error(e);
    }
    localStorage.removeItem('hostshift_user');
    onUserChanged(null);
  };

  return (
    <div>
      {currentUser ? (
        <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400 font-bold text-xs uppercase">
              {currentUser.displayName ? currentUser.displayName.charAt(0) : 'U'}
            </div>
            <div>
              <span className="text-xs font-bold text-slate-200 block truncate max-w-[130px]">
                {currentUser.displayName}
              </span>
              <span className="text-[10px] text-emerald-400 flex items-center gap-1 font-mono truncate max-w-[130px]">
                <CheckCircle2 className="w-2.5 h-2.5 flex-shrink-0" /> {currentUser.email || currentUser.uid.slice(0, 10)}
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
        <div className="space-y-2">
          <button
            onClick={handleGoogleSignIn}
            disabled={loading}
            className="w-full py-2.5 px-3 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-lg shadow-indigo-900/30 flex items-center justify-center gap-2 transition-all hover:scale-[1.02]"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin text-white" />
            ) : (
              <LogIn className="w-4 h-4" />
            )}
            {loading ? 'Conectando...' : 'Iniciar Sesión con Google'}
          </button>

          {!showEmailFallback && (
            <button
              onClick={() => setShowEmailFallback(true)}
              className="w-full text-center text-[10px] text-slate-500 hover:text-slate-400 transition-colors py-0.5"
            >
              ¿Ventana emergente bloqueada? Iniciar con Correo / Firebase
            </button>
          )}
        </div>
      )}

      {errorMsg && (
        <div className="mt-2 p-2 bg-rose-500/20 border border-rose-500/30 rounded-lg text-rose-300 text-[11px] flex items-center gap-1.5">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {showEmailFallback && !currentUser && (
        <div className="mt-3 p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-2.5 animate-fadeIn">
          <div className="flex items-center justify-between text-xs font-bold text-slate-300">
            <span className="flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5 text-indigo-400" /> Firebase Auth
            </span>
            <div className="flex items-center gap-1 bg-slate-900 p-0.5 rounded-lg border border-slate-800 text-[10px]">
              <button
                type="button"
                onClick={() => { setAuthMode('login'); setErrorMsg(null); }}
                className={`px-2 py-0.5 rounded ${authMode === 'login' ? 'bg-indigo-600 text-white font-bold' : 'text-slate-400 hover:text-white'}`}
              >
                Entrar
              </button>
              <button
                type="button"
                onClick={() => { setAuthMode('register'); setErrorMsg(null); }}
                className={`px-2 py-0.5 rounded ${authMode === 'register' ? 'bg-indigo-600 text-white font-bold' : 'text-slate-400 hover:text-white'}`}
              >
                Crear
              </button>
            </div>
          </div>
          <form onSubmit={handleEmailAuth} className="space-y-2">
            <input
              type="email"
              required
              placeholder="tu-correo@gmail.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 text-xs text-slate-200 px-2.5 py-1.5 rounded-lg outline-none focus:border-indigo-500"
            />
            <input
              type="password"
              required
              placeholder="Contraseña"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 text-xs text-slate-200 px-2.5 py-1.5 rounded-lg outline-none focus:border-indigo-500"
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold transition-all disabled:opacity-50 flex items-center justify-center gap-1.5"
            >
              {loading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : authMode === 'login' ? (
                <LogIn className="w-3.5 h-3.5" />
              ) : (
                <UserPlus className="w-3.5 h-3.5" />
              )}
              {loading ? 'Procesando...' : authMode === 'login' ? 'Iniciar Sesión' : 'Registrar Cuenta'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
};
