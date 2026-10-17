import React, { useState, useEffect } from 'react';
import { 
  LogIn, 
  LogOut, 
  ShieldCheck, 
  CheckCircle2, 
  AlertCircle,
  Loader2
} from 'lucide-react';
import { UserDocument } from '../types/schema';
import { auth, db, googleProvider } from '../services/firebase';
import { signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';
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

  useEffect(() => {
    // Escuchar estado real de autenticación de Firebase
    const unsubscribe = onAuthStateChanged(auth, async (fireUser) => {
      if (fireUser) {
        try {
          // Consultar o registrar usuario en Firestore
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
      if (error.code === 'auth/popup-closed-by-user') {
        setErrorMsg('Ventana cerrada antes de completar el inicio de sesión.');
      } else if (error.code === 'auth/unauthorized-domain') {
        setErrorMsg('Dominio no autorizado en Firebase. Añade localhost a los dominios autorizados de Auth.');
      } else {
        setErrorMsg(error.message || 'Error al autenticarse con Google');
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
          {loading ? 'Conectando con Google...' : 'Iniciar Sesión con Google'}
        </button>
      )}

      {errorMsg && (
        <div className="mt-2 p-2 bg-rose-500/20 border border-rose-500/30 rounded-lg text-rose-300 text-[11px] flex items-center gap-1.5">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}
    </div>
  );
};
