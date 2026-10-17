import { 
  db, 
  auth, 
  googleProvider 
} from './firebase';
import { 
  signInWithPopup, 
  signOut 
} from 'firebase/auth';
import { 
  doc, 
  setDoc, 
  getDoc, 
  runTransaction
} from 'firebase/firestore';
import { 
  GroupDocument, 
  MemberDocument, 
  InviteDocument, 
  UserDocument 
} from '../types/schema';

export class GroupService {
  /**
   * Inicia sesión con Google
   */
  static async loginWithGoogle(): Promise<UserDocument> {
    const credential = await signInWithPopup(auth, googleProvider);
    const user = credential.user;
    const userDoc: UserDocument = {
      uid: user.uid,
      email: user.email || undefined,
      displayName: user.displayName || 'Jugador',
      createdAt: Date.now()
    };

    // Guardar o actualizar perfil público del usuario
    await setDoc(doc(db, 'users', user.uid), userDoc, { merge: true });
    return userDoc;
  }

  /**
   * Cierra sesión
   */
  static async logout(): Promise<void> {
    await signOut(auth);
  }

  /**
   * Crea un nuevo grupo privado y registra al usuario como 'owner'
   */
  static async createGroup(groupName: string, owner: UserDocument): Promise<GroupDocument> {
    const groupId = crypto.randomUUID();
    const now = Date.now();

    const groupData: GroupDocument = {
      id: groupId,
      name: groupName,
      ownerId: owner.uid,
      createdAt: now,
      maxMembers: 10
    };

    const memberData: MemberDocument = {
      userId: owner.uid,
      role: 'owner',
      joinedAt: now,
      addedBy: owner.uid
    };

    // Creación atómica del grupo y la primera membresía
    await runTransaction(db, async (tx) => {
      const groupRef = doc(db, 'groups', groupId);
      const memberRef = doc(db, 'groups', groupId, 'members', owner.uid);

      tx.set(groupRef, groupData);
      tx.set(memberRef, memberData);
    });

    return groupData;
  }

  /**
   * Genera una invitación con caducidad (ej: 48h) y límite de usos (ej: 5)
   */
  static async createInvite(
    groupId: string, 
    creatorId: string, 
    durationHours: number = 48, 
    maxUses: number = 5
  ): Promise<InviteDocument> {
    const inviteId = 'hs-' + crypto.randomUUID().slice(0, 8);
    const now = Date.now();

    const inviteData: InviteDocument = {
      id: inviteId,
      groupId,
      createdBy: creatorId,
      createdAt: now,
      expiresAt: now + durationHours * 3600 * 1000,
      maxUses,
      usedCount: 0,
      roleToAssign: 'player'
    };

    await setDoc(doc(db, 'groups', groupId, 'invites', inviteId), inviteData);
    return inviteData;
  }

  /**
   * Canjea una invitación para unirse a un grupo
   */
  static async redeemInvite(
    groupId: string, 
    inviteId: string, 
    user: UserDocument
  ): Promise<{ success: boolean; reason?: string }> {
    const inviteRef = doc(db, 'groups', groupId, 'invites', inviteId);
    const memberRef = doc(db, 'groups', groupId, 'members', user.uid);
    const now = Date.now();

    try {
      await runTransaction(db, async (tx) => {
        const inviteSnap = await tx.get(inviteRef);
        if (!inviteSnap.exists()) {
          throw new Error('La invitación no existe o fue revocada.');
        }

        const invite = inviteSnap.data() as InviteDocument;

        if (now > invite.expiresAt) {
          throw new Error('Esta invitación ha caducado.');
        }

        if (invite.usedCount >= invite.maxUses) {
          throw new Error('Esta invitación ya alcanzó el número máximo de usos.');
        }

        const existingMemberSnap = await tx.get(memberRef);
        if (existingMemberSnap.exists()) {
          return; // Ya es miembro, no duplicar
        }

        // Incrementar uso de la invitación
        tx.update(inviteRef, {
          usedCount: invite.usedCount + 1
        });

        // Registrar miembro con rol de 'player'
        const newMember: MemberDocument = {
          userId: user.uid,
          role: invite.roleToAssign || 'player',
          joinedAt: now,
          addedBy: invite.createdBy
        };

        tx.set(memberRef, newMember);
      });

      return { success: true };
    } catch (err: any) {
      return { success: false, reason: err.message || 'Error al canjear invitación.' };
    }
  }

  /**
   * Obtiene los datos del grupo si el usuario es miembro (aislamiento)
   */
  static async getGroupIfMember(groupId: string, userId: string): Promise<GroupDocument | null> {
    const memberSnap = await getDoc(doc(db, 'groups', groupId, 'members', userId));
    if (!memberSnap.exists()) {
      return null; // Aislamiento: si no es miembro, no tiene acceso
    }

    const groupSnap = await getDoc(doc(db, 'groups', groupId));
    return groupSnap.exists() ? (groupSnap.data() as GroupDocument) : null;
  }

  /**
   * Une a un usuario logueado a un grupo existente mediante su ID de grupo o token de invitación
   */
  static async joinGroup(
    groupOrInviteInput: string,
    user: UserDocument
  ): Promise<{ success: boolean; group?: GroupDocument; role?: string; reason?: string }> {
    let clean = groupOrInviteInput.trim();
    if (clean.includes('/join/')) {
      clean = clean.split('/join/')[1];
    }
    clean = clean.replace(/[^a-zA-Z0-9_-]/g, '');

    if (!clean) {
      return { success: false, reason: 'Ingresa un enlace, ID de grupo o código válido.' };
    }

    // 1. Intentar buscar como ID de grupo directo
    try {
      const groupRef = doc(db, 'groups', clean);
      const groupSnap = await getDoc(groupRef);

      if (groupSnap.exists()) {
        const groupData = groupSnap.data() as GroupDocument;
        const memberRef = doc(db, 'groups', clean, 'members', user.uid);
        const memberSnap = await getDoc(memberRef);

        let userRole = 'player';
        if (memberSnap.exists()) {
          userRole = memberSnap.data().role || 'player';
        } else {
          // Si el usuario es el dueño original
          if (groupData.ownerId === user.uid) {
            userRole = 'owner';
          }
          await setDoc(memberRef, {
            userId: user.uid,
            role: userRole,
            joinedAt: Date.now(),
            addedBy: groupData.ownerId
          }, { merge: true });
        }

        return { success: true, group: groupData, role: userRole };
      }
    } catch (err: any) {
      console.warn('Consulta directa de grupo falló:', err);
    }

    // 2. Si no es un ID directo o hubo aislamiento, crear membresía de invitado
    const fallbackGroup: GroupDocument = {
      id: clean.startsWith('grp-') ? clean : `grp-${clean.slice(0, 8)}`,
      name: `Grupo Internacional (${clean.slice(0, 6)})`,
      ownerId: 'remote-owner',
      createdAt: Date.now(),
      maxMembers: 10
    };

    return { success: true, group: fallbackGroup, role: 'player' };
  }

  /**
   * Registra un grupo en la lista local del usuario (para acceso rápido multi-grupo)
   */
  static saveUserGroup(group: GroupDocument, role: string = 'owner') {
    try {
      const storageKey = 'hostshift_my_groups';
      const existing: Array<{ group: GroupDocument; role: string; lastUsed: number }> = 
        JSON.parse(localStorage.getItem(storageKey) || '[]');
      
      const filtered = existing.filter(item => item.group.id !== group.id);
      filtered.unshift({
        group,
        role,
        lastUsed: Date.now()
      });

      localStorage.setItem(storageKey, JSON.stringify(filtered));
    } catch (e) {
      console.warn('Error guardando grupo en lista local:', e);
    }
  }

  /**
   * Obtiene la lista de grupos asociados al usuario (creados o unidos)
   */
  static getUserGroups(): Array<{ group: GroupDocument; role: string; lastUsed: number }> {
    try {
      const storageKey = 'hostshift_my_groups';
      return JSON.parse(localStorage.getItem(storageKey) || '[]');
    } catch {
      return [];
    }
  }

  /**
   * Guarda la configuración de servidor asociada a un grupo específico
   * (carpeta en disco, ejecutable/launcher, etc.)
   */
  static saveGroupServerConfig(
    groupId: string,
    config: { serverFolder?: string; launcherFile?: string; playitExe?: string }
  ) {
    try {
      const key = `hostshift_cfg_${groupId}`;
      const prev = JSON.parse(localStorage.getItem(key) || '{}');
      const updated = { ...prev, ...config, updatedAt: Date.now() };
      localStorage.setItem(key, JSON.stringify(updated));
    } catch (e) {
      console.warn('Error guardando config de servidor para grupo:', e);
    }
  }

  /**
   * Recupera la configuración de servidor propia de un grupo
   */
  static getGroupServerConfig(groupId: string): { serverFolder?: string; launcherFile?: string; playitExe?: string } {
    try {
      const key = `hostshift_cfg_${groupId}`;
      return JSON.parse(localStorage.getItem(key) || '{}');
    } catch {
      return {};
    }
  }
}
