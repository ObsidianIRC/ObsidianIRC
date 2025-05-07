# Installing Native Obsidian IRC
Grab the latest version for your platform from https://github.com/ObsidianIRC/ObsidianIRC/releases

The following platforms are supported:
- `ObsidianIRC-*.*-1.x86_64.rpm` for Fedora, CentOS, and RHEL
- `ObsidianIRC-*.*-1.x86_64.deb` for Debian and Ubuntu
- `ObsidianIRC-*.*-1.x86_64.AppImage` for other Linux distributions
- `ObsidianIRC-*.*-1.x86_64.dmg` for macOS Intel platforms
- `ObsidianIRC_*.*_aarch64.dmg` for macOS Apple Silicon platforms
- `ObsidianIRC_*.*_x64-setup.exe` for Windows
- `ObsidianIRC-*.*.apk` for Android (Non signed apk) Follorw [this guide](https://developer.android.com/studio/run/install-apk) to install it on your device
- `ObsidianIRC-*.*.ipa` for iOS (Non signed ipa, use [LiveContainer](https://github.com/LiveContainer/LiveContainer) or [AltStore](https://altstore.io/) to install it on your device)
- `ObsidianIRC-*-web.zip` for the web version (Unzip and open `dist/index.html` in your browser or put that in your web server root directory)

## Google Playstore
Coming soon.

## Apple App Store
Not available yet.

## Arch Linux AUR
Use the AUR helper of your choice to install ObsidianIRC. For example, using `yay`:
```sh
yay -S obsidianirc
```

## Docker
```sh
docker run -p 8080:80 mattfly/obdisianirc:latest
```

## Manual Build
Refer to [BUILD.md](BUILD.md) for instructions on how to build ObsidianIRC from source.
