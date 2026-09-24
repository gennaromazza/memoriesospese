// Used by the Windows smoke test to confirm the packaged renderer has mounted.
// Requires Node 24 (the version installed by the GitHub workflow).
const port = Number(process.argv[2]);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("Pass the Electron debugging port");
}

const deadline = Date.now() + 30000;
let lastError = "No renderer response";

while (Date.now() < deadline) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/json/list`);
    if (!response.ok) throw new Error(`DevTools HTTP ${response.status}`);
    const pages = await response.json();
    const page = pages.find(target => target.type === "page" && target.url.startsWith("app://image-studio/"));
    if (page?.webSocketDebuggerUrl) {
      const text = await new Promise((resolve, reject) => {
        const socket = new WebSocket(page.webSocketDebuggerUrl);
        const timeout = setTimeout(() => {
          socket.close();
          reject(new Error("Renderer evaluation timed out"));
        }, 4000);
        socket.onopen = () => socket.send(JSON.stringify({
          id: 1,
          method: "Runtime.evaluate",
          params: { expression: "document.querySelector('#root')?.innerText || ''", returnByValue: true },
        }));
        socket.onmessage = event => {
          const message = JSON.parse(event.data);
          if (message.id !== 1) return;
          clearTimeout(timeout);
          socket.close();
          resolve(message.result?.result?.value || "");
        };
        socket.onerror = () => {
          clearTimeout(timeout);
          reject(new Error("Could not connect to Electron DevTools"));
        };
      });
      if (text.includes("Login Gestione Desktop")) {
        console.log("Packaged renderer displays the login screen");
        process.exit(0);
      }
      lastError = `Rendered content: ${text.slice(0, 200) || "(empty)"}`;
    }
  } catch (error) {
    lastError = error.message;
  }
  await new Promise(resolve => setTimeout(resolve, 1000));
}

throw new Error(`Packaged app did not show the login screen: ${lastError}`);