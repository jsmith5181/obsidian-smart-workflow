// WebSocket 服务器实现
use tokio::net::TcpListener;
use tokio_tungstenite::{accept_async, tungstenite::Message};
use futures_util::{StreamExt, SinkExt};
use serde::{Deserialize, Serialize};
use crate::pty_session::PtySession;
use tokio::sync::Mutex as TokioMutex;
use std::sync::{Arc, Mutex};

/// 简单的日志宏
macro_rules! log_info {
    ($($arg:tt)*) => {
        eprintln!("[INFO] {}", format!($($arg)*));
    };
}

macro_rules! log_error {
    ($($arg:tt)*) => {
        eprintln!("[ERROR] {}", format!($($arg)*));
    };
}

macro_rules! log_debug {
    ($($arg:tt)*) => {
        if cfg!(debug_assertions) {
            eprintln!("[DEBUG] {}", format!($($arg)*));
        }
    };
}

/// WebSocket 命令消息
#[derive(Debug, Deserialize, Serialize)]
#[serde(tag = "type")]
pub enum Command {
    #[serde(rename = "resize")]
    Resize { cols: u16, rows: u16 },
    
    #[serde(rename = "env")]
    Env {
        #[serde(skip_serializing_if = "Option::is_none")]
        cwd: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        env: Option<std::collections::HashMap<String, String>>,
    },
    
    #[serde(rename = "init")]
    Init {
        #[serde(skip_serializing_if = "Option::is_none")]
        shell_type: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        shell_args: Option<Vec<String>>,
        #[serde(skip_serializing_if = "Option::is_none")]
        cwd: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        env: Option<std::collections::HashMap<String, String>>,
    },
}

/// WebSocket 服务器配置
pub struct ServerConfig {
    pub port: u16,
}

/// WebSocket 服务器
pub struct Server {
    config: ServerConfig,
}

impl Server {
    pub fn new(config: ServerConfig) -> Self {
        Self { config }
    }

    /// 启动服务器
    pub async fn start(&self) -> Result<u16, Box<dyn std::error::Error>> {
        let addr = format!("127.0.0.1:{}", self.config.port);
        let listener = TcpListener::bind(&addr).await?;
        let local_addr = listener.local_addr()?;
        let port = local_addr.port();

        log_info!("服务器绑定到 {}", local_addr);

        // 输出端口信息到 stdout（JSON 格式）
        println!(
            r#"{{"port": {}, "pid": {}}}"#,
            port,
            std::process::id()
        );

        // 主循环：接受 WebSocket 连接
        tokio::spawn(async move {
            log_info!("开始监听 WebSocket 连接...");
            while let Ok((stream, addr)) = listener.accept().await {
                log_debug!("接受来自 {} 的连接", addr);
                tokio::spawn(async move {
                    if let Err(e) = handle_connection(stream).await {
                        log_error!("连接处理错误: {}", e);
                    }
                });
            }
        });

        Ok(port)
    }
}

/// 处理单个 WebSocket 连接
async fn handle_connection(
    stream: tokio::net::TcpStream,
) -> Result<(), Box<dyn std::error::Error>> {
    // 升级到 WebSocket
    let ws_stream = accept_async(stream).await?;
    
    log_info!("WebSocket 连接已建立");
    
    // 分离读写流
    let (ws_sender, mut ws_receiver) = ws_stream.split();
    let ws_sender = Arc::new(TokioMutex::new(ws_sender));
    
    // 等待第一条消息（应该是 init 命令）
    let mut shell_type: Option<String> = None;
    let mut shell_args: Option<Vec<String>> = None;
    let mut cwd: Option<String> = None;
    let mut env: Option<std::collections::HashMap<String, String>> = None;
    let mut first_msg_processed = false;
    
    if let Some(Ok(Message::Text(text))) = ws_receiver.next().await {
        if let Ok(Command::Init { shell_type: st, shell_args: sa, cwd: c, env: e }) = serde_json::from_str::<Command>(&text) {
            log_info!("收到初始化命令，shell_type: {:?}, shell_args: {:?}, cwd: {:?}", st, sa, c);
            shell_type = st;
            shell_args = sa;
            cwd = c;
            env = e;
            first_msg_processed = true;
        }
    }
    
    if !first_msg_processed {
        log_info!("未收到初始化命令，使用默认配置");
    }
    
    // 创建 PTY 会话（reader 和 writer 是独立的，不需要锁）
    let (pty_session, pty_reader, pty_writer) = PtySession::new(
        80, 
        24, 
        shell_type.as_deref(), 
        shell_args.as_ref().map(|v| v.as_slice()),
        cwd.as_deref(),
        env.as_ref()
    )?;
    let pty_session = Arc::new(TokioMutex::new(pty_session));
    
    // 将 reader 和 writer 包装在 Arc<Mutex<>> 中以便在任务间共享
    let pty_reader = Arc::new(Mutex::new(pty_reader));
    let pty_writer = Arc::new(Mutex::new(pty_writer));
    
    log_info!("PTY 会话已创建，shell_type: {:?}", shell_type);
    
    // 克隆用于读取任务
    let ws_sender_for_read = Arc::clone(&ws_sender);
    let pty_reader_for_read = Arc::clone(&pty_reader);
    
    // 启动 PTY 输出读取任务
    let read_task = tokio::spawn(async move {
        loop {
            // 在阻塞任务中读取 PTY 输出
            let reader = Arc::clone(&pty_reader_for_read);
            let result = tokio::task::spawn_blocking(move || -> Result<(Vec<u8>, usize), String> {
                let mut reader = reader.lock().unwrap();
                let mut local_buf = vec![0u8; 8192];
                match reader.read(&mut local_buf) {
                    Ok(n) => Ok((local_buf, n)),
                    Err(e) => Err(e.to_string()),
                }
            }).await;
            
            match result {
                Ok(Ok((data, n))) if n > 0 => {
                    log_debug!("读取到 PTY 输出: {} 字节", n);
                    // 发送到 WebSocket
                    let mut sender = ws_sender_for_read.lock().await;
                    if let Err(e) = sender.send(Message::Binary(data[..n].to_vec())).await {
                        log_error!("发送 PTY 输出失败: {}", e);
                        break;
                    }
                }
                Ok(Ok(_)) => {
                    // EOF
                    log_info!("PTY 输出结束");
                    break;
                }
                Ok(Err(e)) => {
                    log_error!("读取 PTY 输出错误: {}", e);
                    break;
                }
                Err(e) => {
                    log_error!("PTY 读取任务错误: {}", e);
                    break;
                }
            }
        }
    });
    
    // 克隆用于写入
    let pty_writer_for_write = Arc::clone(&pty_writer);
    
    // 消息处理循环
    while let Some(msg_result) = ws_receiver.next().await {
        match msg_result {
            Ok(msg) => {
                log_debug!("收到消息类型: {:?}", std::mem::discriminant(&msg));
                
                match msg {
                    Message::Text(text) => {
                        // 尝试解析为 JSON 命令
                        if let Ok(cmd) = serde_json::from_str::<Command>(&text) {
                            log_debug!("解析到命令: {:?}", cmd);
                            handle_command(cmd, &pty_session).await?;
                        } else {
                            // 普通文本输入，写入 PTY
                            log_debug!("收到文本输入: {} 字节", text.len());
                            let mut writer = pty_writer_for_write.lock().unwrap();
                            if let Err(e) = writer.write(text.as_bytes()) {
                                log_error!("写入 PTY 失败: {}", e);
                            }
                        }
                    }
                    Message::Binary(data) => {
                        // 二进制输入，写入 PTY
                        log_debug!("收到二进制输入: {} 字节", data.len());
                        let mut writer = pty_writer_for_write.lock().unwrap();
                        if let Err(e) = writer.write(&data) {
                            log_error!("写入 PTY 失败: {}", e);
                        }
                    }
                    Message::Close(_) => {
                        log_info!("客户端关闭连接");
                        break;
                    }
                    Message::Ping(data) => {
                        // 响应 Ping
                        let mut sender = ws_sender.lock().await;
                        sender.send(Message::Pong(data)).await?;
                    }
                    Message::Pong(_) => {
                        // 忽略 Pong
                    }
                    _ => {
                        log_debug!("忽略的消息类型");
                    }
                }
            }
            Err(e) => {
                log_error!("接收消息错误: {}", e);
                break;
            }
        }
    }
    
    log_info!("WebSocket 连接已关闭");
    
    // 终止 PTY 进程
    let mut pty = pty_session.lock().await;
    let _ = pty.kill();
    drop(pty); // 释放锁
    
    // 等待读取任务结束
    let _ = read_task.await;
    
    Ok(())
}

/// 处理命令消息
async fn handle_command(
    cmd: Command,
    pty_session: &Arc<TokioMutex<PtySession>>,
) -> Result<(), Box<dyn std::error::Error>> {
    match cmd {
        Command::Resize { cols, rows } => {
            log_info!("收到 resize 命令: {}x{}", cols, rows);
            let mut pty = pty_session.lock().await;
            pty.resize(cols, rows)?;
        }
        Command::Env { cwd, env } => {
            log_info!("收到 env 命令: cwd={:?}, env={:?}", cwd, env);
            // 注意：环境变量和工作目录应该在 PTY 创建时设置
            // 这里只是记录，实际实现需要在创建时处理
        }
        Command::Init { .. } => {
            log_info!("收到 init 命令（已在连接建立时处理）");
            // Init 命令在连接建立时已处理，这里忽略
        }
    }
    Ok(())
}
