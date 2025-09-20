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

