import { GameProfile } from '../services/snapshotEngine';

export const MINECRAFT_PAPER_PROFILE: GameProfile = {
  id: 'minecraft-paper',
  name: 'Minecraft Java (PaperMC)',
  executable: 'java',
  defaultArgs: ['-Xms2G', '-Xmx4G', '-jar', 'paper.jar', 'nogui'],
  workingDir: './server/minecraft',
  stopCommand: 'stop',
  ports: [
    { port: 25565, protocol: 'tcp' }
  ],
  syncFolders: [
    'world',
    'world_nether',
    'world_the_end'
  ],
  ignoredPatterns: [
    '*.log.gz',
    'crash-reports/*',
    'session.lock'
  ],
  saveTriggers: {
    watchPaths: ['world'],
    logPatterns: [
      'Saved the game',
      'ThreadedAnvilChunkStorage: All dimensions are saved'
    ],
    debounceMs: 3000,
    minIntervalSec: 300, // 5 minutos entre réplicas periódicas
    preCopyCommands: [
      'save-off',
      'save-all flush'
    ],
    postCopyCommands: [
      'save-on'
    ]
  }
};

export const VALHEIM_DEDICATED_PROFILE: GameProfile = {
  id: 'valheim-dedicated',
  name: 'Valheim Dedicated Server',
  executable: 'valheim_server.exe',
  defaultArgs: ['-nographics', '-batchmode', '-name', 'HostShiftValheim', '-port', '2456', '-world', 'Dedicated'],
  workingDir: './server/valheim',
  stopCommand: '', // Sin stdin interactivo, requiere señal de proceso
  ports: [
    { port: 2456, protocol: 'udp' },
    { port: 2457, protocol: 'udp' }
  ],
  syncFolders: [
    'worlds_local'
  ],
  ignoredPatterns: [
    '*.old',
    '*.bak'
  ],
  saveTriggers: {
    watchPaths: ['worlds_local'],
    logPatterns: [
      'World saved'
    ],
    debounceMs: 5000,
    minIntervalSec: 600, // 10 minutos
    preCopyCommands: [],
    postCopyCommands: []
  }
};
