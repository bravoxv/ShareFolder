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
}
