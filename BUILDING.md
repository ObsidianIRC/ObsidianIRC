## Docker
```sh
docker run -p 8080:80 mattfly/obdisianirc:latest
```

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
??

### Android
```sh
npm run tauri android build -- --apk
```
