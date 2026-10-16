import { describe, it, expect } from 'vitest';
import { SnapshotEngine, GameProfile } from './snapshotEngine';

const TEST_PROFILE: GameProfile = {
  id: 'test-game',
  name: 'Test Game Profile',
  executable: 'test.exe',
  defaultArgs: [],
  workingDir: './',
  ports: [{ port: 1234, protocol: 'tcp' }],
  syncFolders: ['world'],
  ignoredPatterns: ['*.tmp'],
  saveTriggers: {
    watchPaths: ['world'],
    logPatterns: ['World saved'],
    debounceMs: 50,
    minIntervalSec: 1, // 1 segundo para pruebas unitarias
    preCopyCommands: ['save-off'],
    postCopyCommands: ['save-on']
  }
};

describe('SnapshotEngine (Debounce, Throttling & Consistencia)', () => {
  it('debe agrupar ráfagas de guardados frecuentes (debounce)', async () => {
    const engine = new SnapshotEngine(TEST_PROFILE);
    let executions = 0;

    // Disparar 5 eventos seguidos rápidamente
    for (let i = 0; i < 5; i++) {
      engine.triggerSave('evento-rafaga', async () => {
        executions++;
      });
    }

    // Esperar a que el debounce se resuelva
    await new Promise((resolve) => setTimeout(resolve, 150));

    // Solo se debe haber ejecutado 1 vez gracias al debounce
    expect(executions).toBe(1);
    engine.dispose();
  });

  it('debe respetar el intervalo mínimo entre snapshots consecutivos', async () => {
    const engine = new SnapshotEngine(TEST_PROFILE);
    let executions = 0;

    // Primer guardado
    engine.triggerSave('primer-guardado', async () => {
      executions++;
    });
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(executions).toBe(1);

    // Intentar segundo guardado antes de que pase minIntervalSec (1s)
    engine.triggerSave('segundo-prematuro', async () => {
      executions++;
    });

    // En el instante 200ms no debe haberse ejecutado aún
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(executions).toBe(1);

    engine.dispose();
  });
});
