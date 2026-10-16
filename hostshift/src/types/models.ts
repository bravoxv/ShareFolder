// Tipos de datos para el Coordinador y Turnos

export type Role = 'owner' | 'admin' | 'host' | 'player';

export interface UserProfile {
  uid: string;
  displayName: string;
  photoURL?: string;
  email?: string;
}

export interface GroupMember {
  uid: string;
  role: Role;
  joinedAt: number;
  addedBy: string;
}

export interface Group {
  id: string;
  name: string;
  ownerId: string;
  createdAt: number;
}

export interface ServerLease {
  currentHostId: string | null;
  currentHostName: string | null;
  leaseExpiresAt: number; // Unix timestamp en ms
  epoch: number;          // Monótonamente creciente en cada nuevo encendido
  leaseToken: string | null;
}

export interface ServerState {
  id: string;
  groupId: string;
  gameId: string; // ej: 'minecraft-paper'
  name: string;
  status: 'offline' | 'starting' | 'online' | 'saving' | 'stopping';
  lease: ServerLease;
  lastSnapshotId: string | null;
  lastSnapshotHash: string | null;
  tunnelAddress: string | null; // ej: playit.gg o túnel
  updatedAt: number;
}

export interface SnapshotMeta {
  id: string;
  epoch: number;
  authorId: string;
  authorName: string;
  timestamp: number;
  branch: string; // 'main' o 'recovery-<timestamp>'
  fileHash: string; // SHA-256 del bundle/manifest
  sizeBytes: number;
  confirmedByUids: string[]; // Candidatos que confirmaron tener la copia completa
  signature: string; // Firma Ed25519 del host
}

export interface AuditLogEntry {
  id: string;
  timestamp: number;
  actorId: string;
  actorName: string;
  action: 'START_SERVER' | 'STOP_SERVER' | 'FORCE_RELEASE' | 'SNAPSHOT_SAVED' | 'ROLE_CHANGED' | 'FORK_RESOLVED';
  details: Record<string, any>;
}
