import { describe, it, expect, beforeEach } from 'vitest';

// Modelo simulado de Firestore en memoria
class MockFirestore {
  private store: Map<string, any> = new Map();

  get(path: string) {
    return this.store.get(path) || null;
  }

  set(path: string, val: any) {
    this.store.set(path, JSON.parse(JSON.stringify(val)));
  }

  async runTransaction<T>(updateFn: (tx: any) => Promise<T>): Promise<T> {
    const tx = {
      get: async (path: string) => ({
        exists: () => this.store.has(path),
        data: () => this.store.get(path)
      }),
      update: (path: string, data: any) => {
        const prev = this.store.get(path) || {};
        this.store.set(path, { ...prev, ...data });
      }
    };
    return await updateFn(tx);
  }
}

describe('Protocolo de Turno de Host (Lease & Epocas)', () => {
  let db: MockFirestore;
  const serverPath = 'groups/group-1/servers/server-1';

  beforeEach(() => {
    db = new MockFirestore();
    db.set(serverPath, {
      id: 'server-1',
      status: 'offline',
      lease: {
        currentHostId: null,
        currentHostName: null,
        leaseExpiresAt: 0,
        epoch: 1,
        leaseToken: null
      }
    });
  });

  it('debe permitir a un candidato adquirir el turno si el servidor está libre e incrementar la época', async () => {
    const userId = 'user-alice';
    const now = 10000;
    const leaseDuration = 15000;

    const res = await db.runTransaction(async (tx) => {
      const snap = await tx.get(serverPath);
      const data = snap.data();
      const nextEpoch = data.lease.epoch + 1;

      tx.update(serverPath, {
        lease: {
          currentHostId: userId,
          currentHostName: 'Alice',
          leaseExpiresAt: now + leaseDuration,
          epoch: nextEpoch,
          leaseToken: 'token-abc'
        },
        status: 'online'
      });
      return { success: true, epoch: nextEpoch };
    });

    expect(res.success).toBe(true);
    expect(res.epoch).toBe(2);

    const updated = db.get(serverPath);
    expect(updated.lease.currentHostId).toBe(userId);
    expect(updated.lease.epoch).toBe(2);
    expect(updated.status).toBe('online');
  });

  it('debe BLOQUEAR a otro candidato si el turno actual sigue vigente', async () => {
    const now = 10000;
    // Alice tiene el turno hasta t = 25000
    db.set(serverPath, {
      lease: {
        currentHostId: 'user-alice',
        currentHostName: 'Alice',
        leaseExpiresAt: 25000,
        epoch: 2,
        leaseToken: 'token-alice'
      }
    });

    // Bob intenta tomar el turno en t = 12000
    const bobAttempt = await db.runTransaction(async (tx) => {
      const snap = await tx.get(serverPath);
      const data = snap.data();
      if (data.lease.currentHostId && data.lease.leaseExpiresAt > now) {
        return { success: false, reason: 'Servidor ocupado por ' + data.lease.currentHostName };
      }
      return { success: true };
    });

    expect(bobAttempt.success).toBe(false);
    expect(bobAttempt.reason).toContain('Alice');
  });

  it('debe permitir tomar el turno si el latido del host expiró (failover)', async () => {
    // Turno expiró en t = 8000
    db.set(serverPath, {
      lease: {
        currentHostId: 'user-alice',
        currentHostName: 'Alice',
        leaseExpiresAt: 8000,
        epoch: 2,
        leaseToken: 'token-alice'
      }
    });

    const now = 10000; // 2 segundos después de expirar
    const bobTakeover = await db.runTransaction(async (tx) => {
      const snap = await tx.get(serverPath);
      const data = snap.data();
      
      // La verificación de expiración
      const isExpired = data.lease.leaseExpiresAt < now;
      expect(isExpired).toBe(true);

      const nextEpoch = data.lease.epoch + 1;
      tx.update(serverPath, {
        lease: {
          currentHostId: 'user-bob',
          currentHostName: 'Bob',
          leaseExpiresAt: now + 15000,
          epoch: nextEpoch,
          leaseToken: 'token-bob'
        }
      });
      return { success: true, epoch: nextEpoch };
    });

    expect(bobTakeover.success).toBe(true);
    expect(bobTakeover.epoch).toBe(3);
    expect(db.get(serverPath).lease.currentHostId).toBe('user-bob');
  });
});
