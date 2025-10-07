Run the backend:
```shell
npm install
npx rbt dev run
```

Run the frontend:
```shell
cd web
npm install
npm run dev
```

Open two browser windows and try it out!

Known issues:
- [ ] Because we start listening on the document before we have a snapshot we add large snapshot diffs when the window reloads (WIP branch: [listen-after-loading-snapshot](https://github.com/reboot-dev/reboot-tldraw/tree/listen-after-loading-snapshot)).
- [ ] Current directory structure causes tldraw to complain about multiple instances of its library being loaded.
