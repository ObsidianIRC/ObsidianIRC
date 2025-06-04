[![Docker Hub](https://img.shields.io/badge/Docker%20Hub-mattfly%2Fobsidian-blue?logo=docker&style=flat-square)](https://hub.docker.com/r/mattfly/obsidian)
[![Cloudflare Pages](https://img.shields.io/endpoint?url=https://cloudflare-pages-badges.mattf.workers.dev//?projectName=obsidianirc)](https://obsidianirc.pages.dev/)
[![pages-build-deployment](https://github.com/ObsidianIRC/obsidianirc.github.io/actions/workflows/pages/pages-build-deployment/badge.svg)](https://obsidianirc.github.io/)
<a href="https://www.irccloud.com/invite?channel=%23obsidianirc-dev&amp;hostname=irc.h4ks.com&amp;port=6697&amp;ssl=1" target="_blank"><img src="https://img.shields.io/badge/IRC-%23obsidianirc--dev-1e72ff.svg?style=flat"  height="20"></a>
## <img src="https://cdn-icons-png.freepik.com/512/8999/8999462.png" alt="description" width="70"> ObsidianIRC - Next Generation IRC Client
### React + TypeScript + TailwindCSS
 
*Important:* Only websockets are supported

This IRC client and its related software are designed to be:
- Modern and innovative
- Comfortable for people switching from other messaging software
- Easy to implement
- Easy to expand

![](https://i.ibb.co/Gvbx4wpN/Screenshot-2025-05-01-at-06-27-04.png)

For now, all you need to do to get this running is the following:
```
cd ~
git clone https://github.com/ObsidianIRC/ObsidianIRC
cd ObsidianIRC
npm install
npm run build
cp -R dist/* /var/www/html/
```
Replace `/var/www/html/` with the web directory you want to contain your webclient.

### Contribuiting

If you want to contribute to this project, please read the [CONTRIBUTING.md](CONTRIBUTING.md) file. It contains all the information you need to get started.

### Live Demo
You can demo the bleeding-edge version of ObsidianIRC, all you need to do is connect to an IRC server which uses websockets!
- [Demo on GitHub Pages](https://obsidianirc.github.io/)
- [Demo on CloudFlare Pages](https://obsidianirc.pages.dev/)
