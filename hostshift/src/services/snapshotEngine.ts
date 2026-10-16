import { invoke } from '@tauri-apps/api/core';

export interface GameProfileTrigger {
  watchPaths: string[];
  logPatterns: string[];
  debounceMs: number;
  minIntervalSec: number;
  preCopyCommands: string[];
  postCopyCommands: string[];
}

export interface GameProfile {
  id: string;
  name: string;
  executable: string;
  defaultArgs: string[];
  workingDir: string;
  stopCommand?: string;
  ports: { port: number; protocol: 'tcp' | 'udp' }[];
  syncFolders: string[];
  ignoredPatterns: string[];
  saveTriggers: GameProfileTrigger;
}

export interface SnapshotManifest {
  snapshotId: string;
  epoch: number;
  timestamp: number;
  branch: string;
  authorId: string;
  files: {
    relativePath: string;
    sizeBytes: number;
    hashSha256: string;
  }[];
  totalSizeBytes: number;
  manifestHash: string;
}

export class SnapshotEngine {
  private profile: GameProfile;
  private lastSaveTime: number = 0;
  private debounceTimer: any = null;

  constructor(profile: GameProfile) {
    this.profile = profile;
  }

  /**
   * Ejecuta la rutina previa de guardado del juego (ej: save-off, save-all flush)
   */
  async prepareSave(): Promise<void> {
    for (const cmd of this.profile.saveTriggers.preCopyCommands) {
      await invoke('send_server_command', { command: cmd }).catch(() => {
        console.warn(`[SnapshotEngine] No se pudo enviar comando previo: ${cmd}`);
      });
    }
  }

  /**
   * Ejecuta la rutina posterior (ej: save-on)
   */
  async finishSave(): Promise<void> {
    for (const cmd of this.profile.saveTriggers.postCopyCommands) {
      await invoke('send_server_command', { command: cmd }).catch(() => {
        console.warn(`[SnapshotEngine] No se pudo enviar comando posterior: ${cmd}`);
      });
    }
  }

  /**
   * Dispara una solicitud de guardado con control de debounce y ventana mínima de intervalo
   */
  triggerSave(_reason: string, onExecute: () => Promise<void>) {
    const now = Date.now();
    const minIntervalMs = this.profile.saveTriggers.minIntervalSec * 1000;

    const elapsed = now - this.lastSaveTime;
    if (elapsed < minIntervalMs) {
      // Si aún no ha pasado el intervalo mínimo, programar para cuando se cumpla
      const remainingThrottle = minIntervalMs - elapsed;
      const delay = Math.max(remainingThrottle, this.profile.saveTriggers.debounceMs);

      if (this.debounceTimer) clearTimeout(this.debounceTimer);
      this.debounceTimer = setTimeout(async () => {
        this.lastSaveTime = Date.now();
        await onExecute();
      }, delay);
      return;
    }

    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(async () => {
      this.lastSaveTime = Date.now();
      await onExecute();
    }, this.profile.saveTriggers.debounceMs);
  }

  /**
   * Limpia temporizadores pendientes
   */
  dispose() {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }
}
