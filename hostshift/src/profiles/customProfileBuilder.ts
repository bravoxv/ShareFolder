export interface CustomGameProfileDefinition {
  id: string;
  name: string;
  gameCategory: string; // ej: 'Survival', 'Shooter', 'Simulación'
  executable: string;    // ej: 'srcds.exe', 'PalServer.exe', 'TerrariaServer.exe'
  defaultArgs: string[]; // argumentos de arranque
  stopCommand?: string;  // comando de apagado limpio por consola (ej: 'quit', 'exit', 'stop') o vacío para señal
  ports: {
    port: number;
    protocol: 'tcp' | 'udp';
    label: string;
  }[];
  syncFolders: string[]; // carpetas de guardados/mundo (ej: 'Saved', 'ShooterGame/Saved', 'world')
  ignoredPatterns: string[]; // '*.tmp', '*.log', etc.
  saveTriggers: {
    watchPaths: string[];
    logPatterns: string[]; // frases de log que indican guardado (ej: 'World saved', 'Auto-saving complete')
    debounceMs: number;
    minIntervalSec: number;
    preCopyCommands: string[];
    postCopyCommands: string[];
  };
}

export const COMMUNITY_PRESETS: CustomGameProfileDefinition[] = [
  {
    id: 'palworld-dedicated',
    name: 'Palworld Dedicated Server',
    gameCategory: 'Survival Open World',
    executable: 'PalServer.exe',
    defaultArgs: ['-port=8211', '-players=32', '-useperfthreads', '-NoAsyncLoadingThread'],
    stopCommand: 'DoExit',
    ports: [{ port: 8211, protocol: 'udp', label: 'Conexión Juego' }],
    syncFolders: ['Pal/Saved/SaveGames'],
    ignoredPatterns: ['Pal/Saved/Logs/*'],
    saveTriggers: {
      watchPaths: ['Pal/Saved/SaveGames'],
      logPatterns: ['World saved successfully'],
      debounceMs: 5000,
      minIntervalSec: 600,
      preCopyCommands: ['Save'],
      postCopyCommands: []
    }
  },
  {
    id: 'ark-survival',
    name: 'ARK: Survival Evolved / Ascended',
    gameCategory: 'Survival Sandbox',
    executable: 'ShooterGameServer.exe',
    defaultArgs: ['TheIsland?listen?SessionName=HostShiftARK', '-server', '-log'],
    stopCommand: 'doexit',
    ports: [
      { port: 7777, protocol: 'udp', label: 'Game Port' },
      { port: 27015, protocol: 'udp', label: 'Query Port' }
    ],
    syncFolders: ['ShooterGame/Saved/SavedArks'],
    ignoredPatterns: ['ShooterGame/Saved/Logs/*'],
    saveTriggers: {
      watchPaths: ['ShooterGame/Saved/SavedArks'],
      logPatterns: ['World Save Complete'],
      debounceMs: 4000,
      minIntervalSec: 900,
      preCopyCommands: ['saveworld'],
      postCopyCommands: []
    }
  },
  {
    id: 'terraria-tshock',
    name: 'Terraria (TShock / Vanilla)',
    gameCategory: '2D Adventure',
    executable: 'TerrariaServer.exe',
    defaultArgs: ['-config', 'serverconfig.txt'],
    stopCommand: 'exit',
    ports: [{ port: 7777, protocol: 'tcp', label: 'Multiplayer Port' }],
    syncFolders: ['Worlds'],
    ignoredPatterns: ['*.bak', '*.bad'],
    saveTriggers: {
      watchPaths: ['Worlds'],
      logPatterns: ['Saving world...', 'Validating world save'],
      debounceMs: 3000,
      minIntervalSec: 300,
      preCopyCommands: ['save'],
      postCopyCommands: []
    }
  },
  {
    id: 'project-zomboid',
    name: 'Project Zomboid Dedicated',
    gameCategory: 'Zombie Survival',
    executable: 'ProjectZomboid64.exe',
    defaultArgs: ['-batchmode', '-adminpassword', 'secret'],
    stopCommand: 'quit',
    ports: [
      { port: 16261, protocol: 'udp', label: 'UDP Direct' },
      { port: 16262, protocol: 'tcp', label: 'RCON / Query' }
    ],
    syncFolders: ['Saves/Multiplayer'],
    ignoredPatterns: ['Logs/*'],
    saveTriggers: {
      watchPaths: ['Saves/Multiplayer'],
      logPatterns: ['Saved world'],
      debounceMs: 5000,
      minIntervalSec: 600,
      preCopyCommands: ['save'],
      postCopyCommands: []
    }
  },
  {
    id: '7days-to-die',
    name: '7 Days to Die Dedicated Server',
    gameCategory: 'Survival Horror',
    executable: '7DaysToDieServer.exe',
    defaultArgs: ['-configfile=serverconfig.xml', '-nographics', '-batchmode'],
    stopCommand: 'shutdown',
    ports: [{ port: 26900, protocol: 'udp', label: 'Main Port' }],
    syncFolders: ['Saves'],
    ignoredPatterns: ['7DaysToDieServer_Data/output_log*.txt'],
    saveTriggers: {
      watchPaths: ['Saves'],
      logPatterns: ['World saved'],
      debounceMs: 5000,
      minIntervalSec: 600,
      preCopyCommands: ['saveworld'],
      postCopyCommands: []
    }
  }
];
