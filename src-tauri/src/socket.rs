use serde::Serialize;
use std::{io::Error as IoError, sync::Mutex};
use tauri::{Manager, State};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::TcpStream,
    task,
};

/// Shared state: holds an Option<TcpStream> inside a Mutex.
pub struct SocketState(pub(crate) Mutex<Option<TcpStream>>);

/// Payload we send back to TS whenever we receive data.
#[derive(Serialize)]
struct ReceivedPayload {
    data: String,
}

/// Attempt to connect to the given address:port and store the TcpStream in shared state.
#[tauri::command]
pub async fn connect(
    address: String,
    port: u16,
    state: State<'_, SocketState>,
) -> Result<(), String> {
    let addr = format!("{}:{}", address, port);
    match TcpStream::connect(addr).await {
        Ok(stream) => {
            // Put the stream into state. If there was already one, we drop it.
            let mut guard = state.0.lock().unwrap();
            *guard = Some(stream);
            Ok(())
        }
        Err(e) => Err(format!("Failed to connect: {}", e)),
    }
}

/// Disconnect the socket (if any) and clear the state.
#[tauri::command]
pub async fn disconnect(state: State<'_, SocketState>) -> Result<(), String> {
    let mut guard = state.0.lock().unwrap();
    if let Some(mut s) = guard.take() {
        // Attempt to cleanly shut down
        if let Err(e) = s.shutdown().await {
            eprintln!("Error shutting down socket: {}", e);
        }
    }
    Ok(())
}

/// Start a background task that continuously reads from the socket.
/// Whenever data arrives, emit a Tauri event “tcp-message” with the payload.
#[tauri::command]
pub async fn listen(
    state: State<'_, SocketState>,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    // We clone the AppHandle so that the spawned task can emit events.
    let app_handle_clone = app_handle.clone();

    // Spawn a tokio task that loops on reading from the stream.
    task::spawn(async move {
        loop {
            // Lock the mutex and clone the stream handle if present.
            let maybe_stream = {
                let guard = state.0.lock().unwrap();
                guard.as_ref().map(|s| s.clone())
            };

            // If no stream is present, we break out of the loop.
            let mut stream = match maybe_stream {
                Some(s) => s,
                None => break,
            };

            let mut buf = vec![0u8; 1024];
            match stream.read(&mut buf).await {
                Ok(0) => {
                    // Connection closed by peer.
                    let _ = app_handle_clone.emit_all(
                        "tcp-message",
                        ReceivedPayload {
                            data: "__CLOSED__".into(),
                        },
                    );
                    break;
                }
                Ok(n) => {
                    buf.truncate(n);
                    // Convert to UTF-8; if invalid, send raw bytes hex or base64. Here we try UTF-8:
                    let text = match String::from_utf8(buf.clone()) {
                        Ok(s) => s,
                        Err(_) => {
                            // fallback: base64-encode
                            base64::encode(&buf)
                        }
                    };
                    let _ =
                        app_handle_clone.emit_all("tcp-message", ReceivedPayload { data: text });
                }
                Err(e) => {
                    eprintln!("Error reading from socket: {}", e);
                    let _ = app_handle_clone.emit_all(
                        "tcp-message",
                        ReceivedPayload {
                            data: format!("__ERROR__: {}", e),
                        },
                    );
                    break;
                }
            }
        }
    });

    Ok(())
}

/// Write the given UTF-8 string into the socket. Returns Err if no socket or write fails.
#[tauri::command]
pub async fn send(data: String, state: State<'_, SocketState>) -> Result<(), String> {
    // Lock, grab a mutable reference to the stream.
    let mut guard = state.0.lock().unwrap();
    if let Some(stream) = guard.as_mut() {
        if let Err(e) = stream.write_all(data.as_bytes()).await {
            return Err(format!("Failed to send: {}", e));
        }
        Ok(())
    } else {
        Err("No active connection".into())
    }
}
