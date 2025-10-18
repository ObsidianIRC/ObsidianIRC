use serde::Serialize;
use std::{collections::HashMap, sync::Arc};
use tauri::{Emitter, State};
use tokio::net::TcpStream;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio_native_tls::{TlsConnector, TlsStream};
use native_tls::TlsConnector as NativeTlsConnector;
use tokio::sync::Mutex;
use tokio::task;

/// Connection types that we can manage
pub enum Connection {
    Plain(TcpStream),
    Tls(TlsStream<TcpStream>),
}

impl Connection {
    pub async fn write_all(&mut self, buf: &[u8]) -> Result<(), std::io::Error> {
        match self {
            Connection::Plain(stream) => stream.write_all(buf).await,
            Connection::Tls(stream) => stream.write_all(buf).await,
        }
    }

    pub async fn read(&mut self, buf: &mut [u8]) -> Result<usize, std::io::Error> {
        match self {
            Connection::Plain(stream) => stream.read(buf).await,
            Connection::Tls(stream) => stream.read(buf).await,
        }
    }

    pub async fn flush(&mut self) -> Result<(), std::io::Error> {
        match self {
            Connection::Plain(stream) => stream.flush().await,
            Connection::Tls(stream) => stream.flush().await,
        }
    }

    pub async fn shutdown(&mut self) -> Result<(), std::io::Error> {
        match self {
            Connection::Plain(stream) => stream.shutdown().await,
            Connection::Tls(stream) => stream.shutdown().await,
        }
    }
}

/// Socket state to manage multiple connections
pub struct SocketState(pub(crate) Arc<Mutex<HashMap<String, Arc<Mutex<Connection>>>>>);

/// Payload we send back to TS whenever we receive data.
#[derive(Serialize, Clone)]
struct ReceivedPayload {
    id: String,
    event: MessageEvent,
}

#[derive(Serialize, Clone)]
struct MessageEvent {
    message: Option<MessageData>,
    error: Option<String>,
    connected: Option<bool>,
}

#[derive(Serialize, Clone)]
struct MessageData {
    data: Vec<u8>,
}

/// Connect to IRC server with real TCP/TLS implementation
#[tauri::command]
pub async fn connect(
    client_id: String,
    address: String,
    state: State<'_, SocketState>,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {

    // Parse the address to determine protocol and extract host:port
    let (use_tls, host, port) = parse_address(&address)?;


    // Create TCP connection
    let tcp_stream = TcpStream::connect(format!("{}:{}", host, port))
        .await
        .map_err(|e| format!("Failed to connect to {}:{}: {}", host, port, e))?;


    let connection = if use_tls {
        // Create TLS connection
        let connector = TlsConnector::from(
            NativeTlsConnector::builder()
                .build()
                .map_err(|e| format!("Failed to create TLS connector: {}", e))?
        );

        let tls_stream = connector
            .connect(&host, tcp_stream)
            .await
            .map_err(|e| format!("TLS handshake failed: {}", e))?;

        Connection::Tls(tls_stream)
    } else {
        Connection::Plain(tcp_stream)
    };

    // Store the connection and start background reader for both TCP and TLS
    let connection_arc = Arc::new(Mutex::new(connection));
    let mut connections = state.0.lock().await;
    connections.insert(client_id.clone(), connection_arc.clone());
    drop(connections);

    // Start background reader for this connection
    let client_id_clone = client_id.clone();
    let app_handle_clone = app_handle;
    let state_clone = state.0.clone();

    task::spawn(async move {
        let mut buf = vec![0u8; 4096];

        loop {
            // Get connection reference from state
            let connection_ref = {
                let conns = state_clone.lock().await;
                conns.get(&client_id_clone).cloned()
            };

            if let Some(conn_arc) = connection_ref {
                let mut conn = conn_arc.lock().await;
                match conn.read(&mut buf).await {
                    Ok(0) => {
                        // Connection closed by server
                        let _ = app_handle_clone.emit("tcp-message", ReceivedPayload {
                            id: client_id_clone.clone(),
                            event: MessageEvent {
                                message: None,
                                error: None,
                                connected: Some(false),
                            },
                        });

                        // Remove connection from state
                        let mut conns = state_clone.lock().await;
                        conns.remove(&client_id_clone);
                        break;
                    }
                    Ok(n) => {
                        // Data received - emit message event
                        let data = buf[..n].to_vec();

                        let _ = app_handle_clone.emit("tcp-message", ReceivedPayload {
                            id: client_id_clone.clone(),
                            event: MessageEvent {
                                message: Some(MessageData { data }),
                                error: None,
                                connected: None,
                            },
                        });
                    }
                    Err(e) => {
                        // Read error - emit error event and stop
                        let _ = app_handle_clone.emit("tcp-message", ReceivedPayload {
                            id: client_id_clone.clone(),
                            event: MessageEvent {
                                message: None,
                                error: Some(format!("Read error: {}", e)),
                                connected: Some(false),
                            },
                        });

                        // Remove connection from state
                        let mut conns = state_clone.lock().await;
                        conns.remove(&client_id_clone);
                        break;
                    }
                }
            } else {
                // Connection not found, stop reader
                break;
            }

            // Small delay to prevent busy waiting
            tokio::time::sleep(tokio::time::Duration::from_millis(10)).await;
        }
    });

    Ok(())
}

/// Parse address string to extract protocol, host, and port
fn parse_address(address: &str) -> Result<(bool, String, u16), String> {

    if let Some(stripped) = address.strip_prefix("ircs://") {
        let (host, port) = parse_host_port(stripped, 6697)?;
        Ok((true, host, port))
    } else if let Some(stripped) = address.strip_prefix("irc://") {
        let (host, port) = parse_host_port(stripped, 6667)?;
        Ok((false, host, port))
    } else {
        // Assume plain IRC if no protocol specified
        let (host, port) = parse_host_port(address, 6667)?;
        Ok((false, host, port))
    }
}

/// Parse host:port string with default port fallback
fn parse_host_port(host_port: &str, default_port: u16) -> Result<(String, u16), String> {

    if let Some((host, port_str)) = host_port.rsplit_once(':') {

        // Check if this is actually a valid port number
        if let Ok(port) = port_str.parse::<u16>() {
            Ok((host.to_string(), port))
        } else {
            // If port parsing fails, treat the whole thing as hostname
            Ok((host_port.to_string(), default_port))
        }
    } else {
        Ok((host_port.to_string(), default_port))
    }
}

/// Disconnect a specific client connection
#[tauri::command]
pub async fn disconnect(client_id: String, state: State<'_, SocketState>) -> Result<(), String> {
    let mut connections = state.0.lock().await;
    if let Some(connection_arc) = connections.remove(&client_id) {
        drop(connections); // Release the lock before async operation

        // Try to cleanly shutdown the connection
        let mut connection = connection_arc.lock().await;
        let _ = connection.shutdown().await;

        Ok(())
    } else {
        Err(format!("No connection found for client_id: {}", client_id))
    }
}

/// Start listening for messages from all active connections
#[tauri::command]
pub async fn listen(
    _state: State<'_, SocketState>,
    _app_handle: tauri::AppHandle,
) -> Result<(), String> {
    // This is a simple placeholder - we implement per-connection listening
    // when connections are established in the connect function
    Ok(())
}

/// Send data to a specific client connection
#[tauri::command]
pub async fn send(
    client_id: String,
    data: String,
    state: State<'_, SocketState>,
) -> Result<(), String> {
    let connections = state.0.lock().await;

    if let Some(connection_arc) = connections.get(&client_id) {
        let connection_arc = connection_arc.clone();
        drop(connections); // Release the state lock before async operations

        let mut connection = connection_arc.lock().await;

        // Add IRC line ending if not present
        let data_with_crlf = if data.ends_with("\r\n") {
            data
        } else {
            format!("{}\r\n", data)
        };

        match connection.write_all(data_with_crlf.as_bytes()).await {
            Ok(()) => {
                // Flush the TCP stream to ensure data is sent immediately
                match connection.flush().await {
                    Ok(()) => Ok(()),
                    Err(e) => Err(format!("Failed to flush TCP stream: {}", e))
                }
            }
            Err(e) => Err(format!("Failed to send data: {}", e))
        }
    } else {
        Err(format!("No connection found for client_id: {}", client_id))
    }
}
