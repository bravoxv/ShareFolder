// Prevents additional console window on Windows in release, DO NOT REMOVE!!
// Evita que las compilaciones de desarrollo abran una consola negra al iniciar
// HostShift. La salida de diagnóstico se conserva en los logs de la aplicación.
#![cfg_attr(windows, windows_subsystem = "windows")]

fn main() {
    hostshift_lib::run()
}
