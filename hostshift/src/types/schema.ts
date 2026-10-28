/**
 * ESQUEMA DE DATOS FORMAL - COORDINADOR HOSTSHIFT
 * Todos los modelos residen y se validan en el coordinador (Firestore).
 */

// 1. Roles de usuario dentro de un grupo privado
export type GroupRole = 'owner' | 'admin' | 'host' | 'player';

// 2. Perfil de Usuario Central
export interface UserDocument {
  uid: string;                 // ID único inmutable de Auth
  email?: string;
  displayName: string;        // Nombre decorativo
  createdAt: number;
}

// 3. Grupo Privado (Espacio aislado de juego)
export interface GroupDocument {
  id: string;                 // UUID del grupo
  name: string;               // Nombre del grupo (ej: "Los Pibes Survival")
  ownerId: string;            // UID del propietario legítimo
  ownerName?: string;         // Nombre visible del creador del grupo
  createdAt: number;
  maxMembers: number;         // Límite de miembros por cuota (ej: 10)
  activeServerId?: string;    // ID del servidor actualmente configurado
}

export interface SyncDeviceDocument {
  deviceId: string;
  userId: string;
  displayName: string;
  updatedAt: number;
  isHosting?: boolean;
  serverStatus?: 'offline' | 'starting' | 'online' | 'saving';
  consoleLogs?: string[];
  pendingCommand?: {
    id: string;
    text: string;
    senderName: string;
    timestamp: number;
  };
}

// 4. Membresía (Colección anidada: /groups/{groupId}/members/{userId})
export interface MemberDocument {
  userId: string;
  role: GroupRole;
  joinedAt: number;
  addedBy: string;            // UID del admin/owner que aprobó la entrada
  inviteId?: string;
}

// 5. Invitación privada (/groups/{groupId}/invites/{inviteId})
export interface InviteDocument {
  id: string;                 // Código o token criptográfico
  groupId: string;
  createdBy: string;
  createdAt: number;
  expiresAt: number;          // Timestamp de caducidad
  maxUses: number;            // Usos máximos permitidos (ej: 1 o 5)
  usedCount: number;
  roleToAssign: GroupRole;    // Por defecto 'player'
}

// 6. Turno de Host Atómico (Lease) (/groups/{groupId}/servers/{serverId})
export interface ServerLease {
  currentHostId: string | null;     // UID del host activo o null si está libre
  currentHostName: string | null;
  leaseExpiresAt: number;          // Expiración por latido (ahora + 15s)
  epoch: number;                   // Número de época monótono creciente (#1, #2, ...)
  leaseToken: string | null;       // UUID efímero generado por sesión
}

// 7. Servidor Dedicado
export interface ServerDocument {
  id: string;
  groupId: string;
  gameId: string;                  // Inicialmente 'minecraft-paper'
  name: string;
  status: 'offline' | 'starting' | 'online' | 'saving' | 'stopping';
  lease: ServerLease;
  lastSnapshotId: string | null;   // ID del último snapshot válido aceptado
  lastSnapshotHash: string | null; // SHA-256 del último guardado
  tunnelAddress: string | null;    // Dominio persistente (playit.gg)
  updatedAt: number;
}

// 8. Metadatos de Snapshots P2P (/groups/{groupId}/servers/{serverId}/snapshots/{snapshotId})
export interface SnapshotDocument {
  id: string;
  epoch: number;
  authorId: string;                // UID del host que produjo el guardado
  authorName: string;
  timestamp: number;
  branch: string;                  // 'main' o 'recovery-<timestamp>' si hubo fork
  fileHash: string;                // SHA-256 del árbol de archivos
  totalSizeBytes: number;
  signature: string;               // Firma digital Ed25519 del host
  confirmedByUids: string[];       // UIDs de candidatos que confirmaron tener la copia
}

// 9. Registro de Auditoría (/groups/{groupId}/servers/{serverId}/audit_logs/{logId})
export interface AuditLogDocument {
  id: string;
  timestamp: number;
  actorId: string;
  actorName: string;
  action: 
    | 'START_SERVER' 
    | 'STOP_SERVER' 
    | 'FORCE_RELEASE' 
    | 'SNAPSHOT_SAVED' 
    | 'MEMBER_PROMOTED' 
    | 'MEMBER_REMOVED'
    | 'BRANCH_CREATED';
  details: Record<string, any>;
}
