/// Presents the iOS native share sheet for a file (Save to Files, Photos, AirDrop, …).
#[cfg(target_os = "ios")]
pub fn share_file(path: &str) {
    extern "C" {
        fn ios_share_file(path: *const std::ffi::c_char);
    }
    if let Ok(c_path) = std::ffi::CString::new(path) {
        unsafe { ios_share_file(c_path.as_ptr()) };
    }
}
