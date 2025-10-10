# Compile ObsidianIRC
This covers instructions for how to manually build ObsidianIRC from source for different platforms. If you are willing
to simply install it, maybe take a look at [Install instructions](INSTALL.md) first.

## Clone Repo
```sh
cd ~
git clone https://github.com/ObsidianIRC/ObsidianIRC
cd ObsidianIRC
npm install
```

### Web
```sh
npm run build
cp -R dist/* /var/www/html/
```

#### Building for a specific server
You can build the frontend by setting the following environment variables before running the `npm build` command.
```sh
# Required server URL
VITE_DEFAULT_IRC_SERVER=ws://localhost:8097
# Required server name
VITE_DEFAULT_IRC_SERVER_NAME="Local"
# Optional default channels to join
VITE_DEFAULT_IRC_CHANNELS="#lobby,#bots,#test"
# Optionally hide the server list
VITE_HIDE_SERVER_LIST=true
```

### Docker
```sh
docker build -t obsidianirc .
docker run -p 80:80 obsidianirc
```

#### Building Docker with custom configuration
You can pass build arguments to customize the IRC server settings:
```sh
docker build \
  --build-arg VITE_DEFAULT_IRC_SERVER=ws://your-server:port \
  --build-arg VITE_DEFAULT_IRC_SERVER_NAME="Your Server" \
  --build-arg VITE_DEFAULT_IRC_CHANNELS="#general,#random" \
  --build-arg VITE_HIDE_SERVER_LIST=false \
  -t obsidianirc .
```

### MACOS
```sh
npm run tauri build -- --bundles dmg
```

### LINUX
```sh
npm run tauri build -- --bundles appimage
```

## ⚠️ IMPORTANT: Linux Build Compatibility

**For maximum compatibility:** Build on Ubuntu 20.04 or 22.04 LTS to ensure the binary works on older systems with older glibc versions. 

### Why This Matters
- **Ubuntu 24.04** uses glibc 2.39
- **Ubuntu 22.04** uses glibc 2.35 (recommended for releases)
- **Ubuntu 20.04** uses glibc 2.31 (maximum compatibility)

Building on Ubuntu 24.04 will create binaries that **fail to run** on Ubuntu 22.04, Debian 12, and other systems with glibc < 2.38 with errors like:
```
ObsidianIRC: /lib/x86_64-linux-gnu/libc.so.6: version `GLIBC_2.39' not found
```

### Recommended Build Approach

1. **Use GitHub Actions (Automatic)**: Our CI/CD automatically builds on Ubuntu 22.04 for compatibility
2. **Use Docker** (see below) with Ubuntu 22.04 base
3. **Use a VM** running Ubuntu 22.04

### Building in Docker for Compatibility
```sh
docker run --rm -v $(pwd):/workspace -w /workspace \
  ubuntu:22.04 bash -c "
    apt-get update && 
    apt-get install -y curl build-essential libwebkit2gtk-4.1-dev \
      libssl-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev \
      patchelf libfuse2 file nodejs npm && 
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y && 
    source \$HOME/.cargo/env && 
    npm install && 
    npm run tauri build -- --bundles appimage
  "
```

For distribution packages:
```sh
# Build .deb for Debian/Ubuntu
npm run tauri build -- --bundles deb

# Build .rpm for Fedora/RHEL
npm run tauri build -- --bundles rpm

# Build AppImage (recommended - works everywhere)
npm run tauri build -- --bundles appimage
```

### WINDOWS
```sh
npm run build -- --bundles nsis
```

### Android
```sh
npm run tauri android build -- --apk
```

### IOS
First open xcode with the tauri ws config server running:
```sh
npm run tauri ios build -- --open
```

Set the signing team in the xcode project settings and then build the app:
```sh
npm run tauri ios build
```

## Tauri
Follow the Tauri docs for more info on native builds https://tauri.app/distribute/

