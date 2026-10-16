import { db } from './firebase';
import { 
  doc, 
  runTransaction, 
  collection,
  addDoc 
} from 'firebase/firestore';
import { ServerState, ServerLease } from '../types/models';

export const HEARTBEAT_INTERVAL_MS = 5000;
export const LEASE_DURATION_MS = 15000;

export class LeaseManager {
  private groupId: string;
  private serverId: string;
  private currentUserId: string;
  private currentUserName: string;
  private heartbeatTimer: any = null;
  private activeToken: string | null = null;
  private onRevokedCallback?: () => void;

  constructor(
    groupId: string, 
    serverId: string, 
    userId: string, 
    userName: string,
    onRevoked?: () => void
  ) {
    this.groupId = groupId;
    this.serverId = serverId;
    this.currentUserId = userId;
    this.currentUserName = userName;
    this.onRevokedCallback = onRevoked;
  }

  private getServerRef() {
    return doc(db, 'groups', this.groupId, 'servers', this.serverId);
  }

  /**
   * Intenta adquirir el turno de host atómicamente mediante una transacción.
   */
  async acquireLease(): Promise<{ success: boolean; reason?: string; epoch?: number }> {
    const serverRef = this.getServerRef();
    const generatedToken = crypto.randomUUID();
    const now = Date.now();

    try {
      const result = await runTransaction(db, async (tx) => {
        const serverSnap = await tx.get(serverRef);
        if (!serverSnap.exists()) {
          throw new Error("El servidor no existe en la base de datos.");
        }

        const data = serverSnap.data() as ServerState;
        const currentLease = data.lease || {
          currentHostId: null,
          currentHostName: null,
          leaseExpiresAt: 0,
          epoch: 0,
          leaseToken: null
        };

        // Si hay un host activo cuyo turno no ha expirado y no es el usuario actual
        if (
          currentLease.currentHostId &&
          currentLease.currentHostId !== this.currentUserId &&
          currentLease.leaseExpiresAt > now
        ) {
          const remainingSec = Math.ceil((currentLease.leaseExpiresAt - now) / 1000);
          return {
            success: false,
            reason: `El servidor está ocupado por ${currentLease.currentHostName}. Expira en ${remainingSec}s si no renueva.`
          };
        }

        // Adquisición exitosa: incrementamos la época si es un nuevo host o ciclo
        const nextEpoch = (currentLease.epoch || 0) + 1;
        const updatedLease: ServerLease = {
          currentHostId: this.currentUserId,
          currentHostName: this.currentUserName,
          leaseExpiresAt: now + LEASE_DURATION_MS,
          epoch: nextEpoch,
          leaseToken: generatedToken
        };

        tx.update(serverRef, {
          lease: updatedLease,
          status: 'starting',
          updatedAt: now
        });

        return { success: true, epoch: nextEpoch };
      });

      if (result.success && result.epoch) {
        this.activeToken = generatedToken;
        this.startHeartbeat(result.epoch);
      }

      return result;
    } catch (err: any) {
      return { success: false, reason: err.message || "Error al solicitar turno." };
    }
  }

  /**
   * Inicia el bucle de latidos (heartbeat) cada 5 segundos para mantener el turno vivo.
   */
  private startHeartbeat(epoch: number) {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);

    this.heartbeatTimer = setInterval(async () => {
      const serverRef = this.getServerRef();
      const now = Date.now();

      try {
        await runTransaction(db, async (tx) => {
          const serverSnap = await tx.get(serverRef);
          if (!serverSnap.exists()) return;

          const data = serverSnap.data() as ServerState;
          // Validar que seguimos siendo el host legítimo de esta época
          if (
            data.lease?.currentHostId !== this.currentUserId ||
            data.lease?.leaseToken !== this.activeToken ||
            data.lease?.epoch !== epoch
          ) {
            throw new Error("El turno fue revocado o tomado por otra instancia.");
          }

          tx.update(serverRef, {
            'lease.leaseExpiresAt': now + LEASE_DURATION_MS,
            updatedAt: now
          });
        });
      } catch (err) {
        console.warn("Fallo al renovar latido de host:", err);
        this.stopHeartbeat();
        if (this.onRevokedCallback) {
          this.onRevokedCallback();
        }
      }
    }, HEARTBEAT_INTERVAL_MS);
  }

  /**
   * Libera el turno de forma limpia cuando el servidor se apaga.
   */
  async releaseLease(): Promise<void> {
    this.stopHeartbeat();
    const serverRef = this.getServerRef();
    const now = Date.now();

    try {
      await runTransaction(db, async (tx) => {
        const serverSnap = await tx.get(serverRef);
        if (!serverSnap.exists()) return;

        const data = serverSnap.data() as ServerState;
        if (data.lease?.leaseToken === this.activeToken) {
          tx.update(serverRef, {
            'lease.currentHostId': null,
            'lease.currentHostName': null,
            'lease.leaseExpiresAt': 0,
            'lease.leaseToken': null,
            status: 'offline',
            updatedAt: now
          });
        }
      });
    } catch (err) {
      console.error("Error al liberar turno:", err);
    } finally {
      this.activeToken = null;
    }
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * Forzar liberación por un Admin (desbloqueo de emergencia)
   */
  static async forceReleaseByAdmin(groupId: string, serverId: string, adminId: string, adminName: string) {
    const serverRef = doc(db, 'groups', groupId, 'servers', serverId);
    const now = Date.now();

    await runTransaction(db, async (tx) => {
      tx.update(serverRef, {
        'lease.currentHostId': null,
        'lease.currentHostName': null,
        'lease.leaseExpiresAt': 0,
        'lease.leaseToken': null,
        status: 'offline',
        updatedAt: now
      });
    });

    // Registrar en auditoría
    const auditRef = collection(db, 'groups', groupId, 'servers', serverId, 'audit_logs');
    await addDoc(auditRef, {
      timestamp: now,
      actorId: adminId,
      actorName: adminName,
      action: 'FORCE_RELEASE',
      details: { note: 'Liberación forzada por administrador' }
    });
  }
}
