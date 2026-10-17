# Tauri + React + Typescript

This template should help get you started developing with Tauri, React and Typescript in Vite.

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

## Archivos compartidos de grupos

Los miembros comparten archivos mediante Firebase Storage en bloques de 8 MB, sin un límite artificial de tamaño por archivo. El tamaño total está sujeto a la cuota, configuración y costos del proyecto Firebase. Antes de usar la sincronización, publica las reglas de Firestore y Storage del proyecto:

```sh
firebase deploy --only firestore:rules,storage
```

Desde Cloud Storage Rules, habilita el acceso de las reglas de Storage a los documentos de Firestore cuando Firebase lo solicite. El bucket del proyecto `sharefolder-7dccf` debe estar habilitado.
