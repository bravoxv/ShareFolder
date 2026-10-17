# Tauri + React + Typescript

This template should help get you started developing with Tauri, React and Typescript in Vite.

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

## Sincronización de archivos de grupos

HostShift usa Syncthing para transmitir archivos directamente entre las PCs del grupo. Los datos de servidor no se suben a Firebase; Firestore conserva roles, permisos y los IDs públicos de dispositivos bajo `groups/{groupId}/sync_devices/{deviceId}`. El motor Syncthing para Windows x64 se incluye en el paquete de escritorio.

Antes de conectar las PCs, publica las reglas de Firestore:

```sh
firebase deploy --only firestore:rules
```

Abre Archivos en cada PC, selecciona la carpeta del servidor y pulsa **Conectar / actualizar dispositivos**. El primer inicio de Syncthing puede mostrar el aviso de Firewall de Windows. Ambas PCs deben ejecutar HostShift y Syncthing; Syncthing usa conexión directa cuando puede y relays cuando la red impide la conexión directa. Los jugadores reciben los archivos; owner, admin y host pueden compartir cambios.
