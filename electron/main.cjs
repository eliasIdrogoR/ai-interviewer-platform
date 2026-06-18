const { app, BrowserWindow } = require("electron");
const fs = require("fs");
const http = require("http");
const path = require("path");
const url = require("url");

let staticServer;

function getStaticRoot() {
  return path.join(app.getAppPath(), "out");
}

function createWindow(port) {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 920,
    minHeight: 700,
    title: "AI Interviewer Platform",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.loadURL(`http://127.0.0.1:${port}/`);
}

function startStaticServer(root) {
  staticServer = http.createServer((request, response) => {
    if (!request.url) {
      response.writeHead(400);
      response.end("Bad request");
      return;
    }

    const parsedUrl = url.parse(request.url);
    const pathname = decodeURIComponent(parsedUrl.pathname || "/");

    if (pathname.startsWith("/api/")) {
      response.writeHead(404, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: "Server-side LLM routes are unavailable in the offline Mac wrapper." }));
      return;
    }

    const filePath = resolveStaticPath(root, pathname);
    if (!filePath) {
      response.writeHead(404, { "Content-Type": "text/plain" });
      response.end("Not found");
      return;
    }

    response.writeHead(200, { "Content-Type": getContentType(filePath) });
    fs.createReadStream(filePath).pipe(response);
  });

  return new Promise((resolve, reject) => {
    staticServer.once("error", reject);
    staticServer.listen(0, "127.0.0.1", () => {
      const address = staticServer.address();
      if (!address || typeof address === "string") {
        reject(new Error("Unable to bind local static server."));
        return;
      }

      resolve(address.port);
    });
  });
}

function resolveStaticPath(root, pathname) {
  const candidates = [];
  const cleanPath = pathname === "/" ? "/index.html" : pathname;
  candidates.push(path.join(root, cleanPath));
  candidates.push(path.join(root, `${cleanPath}.html`));
  candidates.push(path.join(root, cleanPath, "index.html"));

  for (const candidate of candidates) {
    const normalized = path.normalize(candidate);
    if (!normalized.startsWith(root)) {
      continue;
    }

    if (fs.existsSync(normalized) && fs.statSync(normalized).isFile()) {
      return normalized;
    }
  }

  const fallback = path.join(root, "index.html");
  return fs.existsSync(fallback) ? fallback : null;
}

function getContentType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  switch (extension) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".js":
      return "text/javascript; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    case ".png":
      return "image/png";
    case ".ico":
      return "image/x-icon";
    default:
      return "application/octet-stream";
  }
}

app.whenReady().then(async () => {
  const port = await startStaticServer(getStaticRoot());
  createWindow(port);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow(port);
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  if (staticServer) {
    staticServer.close();
  }
});
