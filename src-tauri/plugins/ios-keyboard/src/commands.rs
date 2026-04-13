use tauri::{command, AppHandle, Runtime};

use crate::models::*;
use crate::KeyboardExt;
use crate::Result;

#[command]
pub(crate) async fn ping<R: Runtime>(
    app: AppHandle<R>,
    payload: PingRequest,
) -> Result<PingResponse> {
    app.keyboard().ping(payload)
}
