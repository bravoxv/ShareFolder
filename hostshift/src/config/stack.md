# Justificación Técnica del Stack - HostShift

## 1. Interfaz y Runtime de Escritorio: Tauri v2 (Rust + React/TypeScript)
- **Motivo de elección**: A diferencia de Electron (que consume más de 150-200 MB de RAM en reposo por instanciar un Chromium completo y Node.js), Tauri v2 utiliza WebView2 nativo de Windows y un backend compilado en Rust. La huella en reposo es de ~25-35 MB de RAM.
- **Seguridad**: Node.js no está expuesto directamente en el frontend. Los procesos de servidor se lanzan como procesos hijos en Rust usando flags nativos de Win32 (`CREATE_NO_WINDOW`), aislando la consola y evitando ejecución de scripts no verificados.

## 2. Coordinador Central: Firebase Spark (Plan Gratuito Permanente)
- **Componentes**:
  - **Firebase Authentication**: Inicio de sesión federado (Google) con ID de usuario criptográfico (`uid`).
  - **Cloud Firestore**: Base de datos de documentos en tiempo real para leases, metadatos de snapshots y membresías.
- **Límites gratuitos**: 50.000 lecturas/día y 20.000 escrituras/día. Con latidos espaciados a 5s durante partidas activas, un grupo consume menos del 2% del límite diario.
- **Regla de seguridad fundamental**: Los permisos nunca se delegan a la app; se aplican mediante `firestore.rules` evaluando `request.auth.uid`.

## 3. Replicación P2P: Motor Basado en Fragmentos / Syncthing Core
- **Motivo de elección**: Los mundos de videojuegos contienen múltiples archivos binarios y bases de datos por regiones (ej. formato Anvil en Minecraft). Transferir archivos enteros satura la conexión.
- **Estrategia**: Se computan hashes SHA-256 por bloque y manifiesto. Para el intercambio directo entre PCs residenciales se utiliza NAT traversal (STUN/TURN) y replicación incremental por bloques.

## 4. Túnel con Dirección Fija: playit.gg CLI
- **Motivo**: Permite a jugadores externos conectarse a un host residencial dinámico mediante un dominio persistente (ej: `squad.playit.gg`) sin que el host tenga que abrir puertos en su router (UPnP desactivado por seguridad) y sin exponer la dirección IP pública real del usuario.
- **Condiciones y límites**: Gratuito para tráfico TCP/UDP de juegos con túneles comunitarios.

## 5. Juego Piloto Seleccionado para Fases 0 a 8: Minecraft Java (PaperMC)
- **Justificación**: Servidor dedicado estándar de la industria, ejecutable autónomo (`paper.jar`), soporta comandos estándar por stdin (`save-off`, `save-all flush`, `save-on`, `stop`) y emite patrones de log claros de guardado para la detección por eventos.
