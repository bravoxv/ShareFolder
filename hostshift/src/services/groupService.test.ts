import { describe, it, expect, beforeEach } from 'vitest';
import { GroupDocument, MemberDocument, InviteDocument, UserDocument } from '../types/schema';

// Simulador en memoria del coordinador Firestore con aislamiento de seguridad
class MockCoordinatorFirestore {
  private store: Map<string, any> = new Map();

  get(path: string) {
    return this.store.get(path) || null;
  }

  set(path: string, val: any) {
    this.store.set(path, JSON.parse(JSON.stringify(val)));
  }

  has(path: string) {
    return this.store.has(path);
  }

  async runTransaction<T>(updateFn: (tx: any) => Promise<T>): Promise<T> {
    const tx = {
      get: async (path: string) => ({
        exists: () => this.store.has(path),
        data: () => this.store.get(path)
      }),
      set: (path: string, data: any) => {
        this.store.set(path, JSON.parse(JSON.stringify(data)));
      },
      update: (path: string, data: any) => {
        const prev = this.store.get(path) || {};
        this.store.set(path, { ...prev, ...data });
      }
    };
    return await updateFn(tx);
  }
}

describe('FASE 1 · Cuentas, Grupos, Invitaciones y Aislamiento', () => {
  let db: MockCoordinatorFirestore;

  const userOwner: UserDocument = {
    uid: 'uid-alice-owner',
    displayName: 'Alice (Propietaria)',
    createdAt: 1000
  };

  const userInvited: UserDocument = {
    uid: 'uid-bob-player',
    displayName: 'Bob (Amigo Invitado)',
    createdAt: 2000
  };

  const userIntruder: UserDocument = {
    uid: 'uid-charlie-intruder',
    displayName: 'Charlie (Sin Invitación)',
    createdAt: 3000
  };

  beforeEach(() => {
    db = new MockCoordinatorFirestore();
  });

  it('1. Debe crear un grupo atómicamente asignando al creador como Owner', async () => {
    const groupId = 'group-123';
    const groupData: GroupDocument = {
      id: groupId,
      name: 'Squad Survival',
      ownerId: userOwner.uid,
      createdAt: 10000,
      maxMembers: 10
    };

    const memberData: MemberDocument = {
      userId: userOwner.uid,
      role: 'owner',
      joinedAt: 10000,
      addedBy: userOwner.uid
    };

    await db.runTransaction(async (tx) => {
      tx.set(`groups/${groupId}`, groupData);
      tx.set(`groups/${groupId}/members/${userOwner.uid}`, memberData);
    });

    const storedGroup = db.get(`groups/${groupId}`);
    const storedMember = db.get(`groups/${groupId}/members/${userOwner.uid}`);

    expect(storedGroup).not.toBeNull();
    expect(storedGroup.ownerId).toBe(userOwner.uid);
    expect(storedMember.role).toBe('owner');
  });

  it('2. Un segundo usuario debe poder unirse con un token de invitación válido', async () => {
    const groupId = 'group-123';
    const inviteId = 'hs-invite-abc';
    const now = 20000;

    // Crear invitación válida por 48 horas para 3 usos
    const invite: InviteDocument = {
      id: inviteId,
      groupId,
      createdBy: userOwner.uid,
      createdAt: now,
      expiresAt: now + 48 * 3600 * 1000,
      maxUses: 3,
      usedCount: 0,
      roleToAssign: 'player'
    };
    db.set(`groups/${groupId}/invites/${inviteId}`, invite);

    // Bob canjea la invitación
    await db.runTransaction(async (tx) => {
      const invSnap = await tx.get(`groups/${groupId}/invites/${inviteId}`);
      expect(invSnap.exists()).toBe(true);
      const invData = invSnap.data() as InviteDocument;

      expect(now <= invData.expiresAt).toBe(true);
      expect(invData.usedCount < invData.maxUses).toBe(true);

      tx.update(`groups/${groupId}/invites/${inviteId}`, {
        usedCount: invData.usedCount + 1
      });

      tx.set(`groups/${groupId}/members/${userInvited.uid}`, {
        userId: userInvited.uid,
        role: 'player',
        joinedAt: now,
        addedBy: invData.createdBy
      });
    });

    // Validar que Bob es miembro con rol 'player' y que se contó el uso
    const bobMember = db.get(`groups/${groupId}/members/${userInvited.uid}`);
    const updatedInvite = db.get(`groups/${groupId}/invites/${inviteId}`);

    expect(bobMember).not.toBeNull();
    expect(bobMember.role).toBe('player');
    expect(updatedInvite.usedCount).toBe(1);
  });

  it('3. Debe rechazar invitaciones expiradas o con límite de usos agotado', async () => {
    const groupId = 'group-123';
    const expiredInviteId = 'hs-invite-expired';
    const exhaustedInviteId = 'hs-invite-exhausted';
    const now = 50000;

    // Invitación expirada
    db.set(`groups/${groupId}/invites/${expiredInviteId}`, {
      id: expiredInviteId,
      groupId,
      createdBy: userOwner.uid,
      createdAt: 10000,
      expiresAt: 20000, // En el pasado
      maxUses: 5,
      usedCount: 0,
      roleToAssign: 'player'
    });

    // Invitación con usos agotados
    db.set(`groups/${groupId}/invites/${exhaustedInviteId}`, {
      id: exhaustedInviteId,
      groupId,
      createdBy: userOwner.uid,
      createdAt: 10000,
      expiresAt: 100000,
      maxUses: 1,
      usedCount: 1, // Ya usada
      roleToAssign: 'player'
    });

    // Intento 1: Expirada
    const checkExpired = async () => {
      const inv = db.get(`groups/${groupId}/invites/${expiredInviteId}`);
      if (now > inv.expiresAt) throw new Error('Invitación caducada');
    };
    await expect(checkExpired()).rejects.toThrow('Invitación caducada');

    // Intento 2: Agotada
    const checkExhausted = async () => {
      const inv = db.get(`groups/${groupId}/invites/${exhaustedInviteId}`);
      if (inv.usedCount >= inv.maxUses) throw new Error('Usos agotados');
    };
    await expect(checkExhausted()).rejects.toThrow('Usos agotados');
  });

  it('4. Aislamiento estricto: un tercero no invitado no puede ver el grupo', () => {
    const groupId = 'group-123';
    
    // Configurar miembros legítimos
    db.set(`groups/${groupId}/members/${userOwner.uid}`, { role: 'owner' });
    db.set(`groups/${groupId}/members/${userInvited.uid}`, { role: 'player' });

    // Regla de seguridad de Firestore simulada:
    // exists(/databases/$(database)/documents/groups/$(groupId)/members/$(request.auth.uid))
    const isMember = (uid: string) => {
      return db.has(`groups/${groupId}/members/${uid}`);
    };

    expect(isMember(userOwner.uid)).toBe(true);
    expect(isMember(userInvited.uid)).toBe(true);
    // Charlie nunca fue invitado ni agregado
    expect(isMember(userIntruder.uid)).toBe(false);
  });
});
