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
TBD Build for specific default server

```sh
npm run build
cp -R dist/* /var/www/html/
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

