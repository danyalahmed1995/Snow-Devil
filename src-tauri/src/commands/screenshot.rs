use serde::Serialize;
use tauri::Window;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CapturedRegion {
    width: u32,
    height: u32,
}

#[tauri::command]
pub fn capture_region_to_clipboard(
    window: Window,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> Result<CapturedRegion, String> {
    if !x.is_finite() || !y.is_finite() || !width.is_finite() || !height.is_finite() {
        return Err("invalid capture coordinates".into());
    }
    if width < 1.0 || height < 1.0 {
        return Err("capture region is empty".into());
    }

    let scale = window.scale_factor().map_err(|error| error.to_string())?;
    let origin = window.inner_position().map_err(|error| error.to_string())?;
    let screen_x = origin.x + (x * scale).round() as i32;
    let screen_y = origin.y + (y * scale).round() as i32;
    let pixel_width = (width * scale).round().max(1.0) as u32;
    let pixel_height = (height * scale).round().max(1.0) as u32;

    capture_native_region(screen_x, screen_y, pixel_width, pixel_height)?;
    Ok(CapturedRegion {
        width: pixel_width,
        height: pixel_height,
    })
}

#[cfg(target_os = "windows")]
fn capture_native_region(x: i32, y: i32, width: u32, height: u32) -> Result<(), String> {
    use arboard::{Clipboard, ImageData};
    use std::borrow::Cow;
    use windows::Win32::Graphics::Gdi::{
        BitBlt, CreateCompatibleBitmap, CreateCompatibleDC, DeleteDC, DeleteObject, GetDC,
        GetDIBits, ReleaseDC, SelectObject, BITMAPINFO, BITMAPINFOHEADER, BI_RGB, CAPTUREBLT,
        DIB_RGB_COLORS, SRCCOPY,
    };

    if width > i32::MAX as u32 || height > i32::MAX as u32 {
        return Err("capture region is too large".into());
    }
    let width_i32 = width as i32;
    let height_i32 = height as i32;
    let byte_count = (width as usize)
        .checked_mul(height as usize)
        .and_then(|pixels| pixels.checked_mul(4))
        .ok_or_else(|| "capture region is too large".to_string())?;

    // GDI samples the composed desktop, which includes native child webviews as well as React UI.
    let mut bgra = vec![0u8; byte_count];
    unsafe {
        let screen_dc = GetDC(None);
        if screen_dc.is_invalid() {
            return Err("could not access the screen".into());
        }
        let memory_dc = CreateCompatibleDC(Some(screen_dc));
        if memory_dc.is_invalid() {
            ReleaseDC(None, screen_dc);
            return Err("could not create the capture surface".into());
        }
        let bitmap = CreateCompatibleBitmap(screen_dc, width_i32, height_i32);
        if bitmap.is_invalid() {
            let _ = DeleteDC(memory_dc);
            ReleaseDC(None, screen_dc);
            return Err("could not create the capture bitmap".into());
        }
        let previous = SelectObject(memory_dc, bitmap.into());
        let copied = BitBlt(
            memory_dc,
            0,
            0,
            width_i32,
            height_i32,
            Some(screen_dc),
            x,
            y,
            SRCCOPY | CAPTUREBLT,
        );

        let mut info = BITMAPINFO::default();
        info.bmiHeader = BITMAPINFOHEADER {
            biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
            biWidth: width_i32,
            // A negative height requests top-down pixels, matching browser image orientation.
            biHeight: -height_i32,
            biPlanes: 1,
            biBitCount: 32,
            biCompression: BI_RGB.0,
            ..Default::default()
        };
        let scan_lines = if copied.is_ok() {
            GetDIBits(
                memory_dc,
                bitmap,
                0,
                height,
                Some(bgra.as_mut_ptr().cast()),
                &mut info,
                DIB_RGB_COLORS,
            )
        } else {
            0
        };

        SelectObject(memory_dc, previous);
        let _ = DeleteObject(bitmap.into());
        let _ = DeleteDC(memory_dc);
        ReleaseDC(None, screen_dc);

        copied.map_err(|error| error.to_string())?;
        if scan_lines != height_i32 {
            return Err("screen pixels could not be read".into());
        }
    }

    // GDI returns BGRA; arboard expects RGBA.
    for pixel in bgra.chunks_exact_mut(4) {
        pixel.swap(0, 2);
        pixel[3] = 255;
    }
    Clipboard::new()
        .and_then(|mut clipboard| {
            clipboard.set_image(ImageData {
                width: width as usize,
                height: height as usize,
                bytes: Cow::Owned(bgra),
            })
        })
        .map_err(|error| error.to_string())
}

#[cfg(not(target_os = "windows"))]
fn capture_native_region(_x: i32, _y: i32, _width: u32, _height: u32) -> Result<(), String> {
    Err("region capture is currently available on Windows only".into())
}
