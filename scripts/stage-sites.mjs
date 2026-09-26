import fs from "node:fs";

fs.rmSync("dist", { recursive: true, force: true });
fs.cpSync(".open-next", "dist/server", { recursive: true, dereference: true });
fs.copyFileSync("dist/server/worker.js", "dist/server/index.js");
if (fs.existsSync(".open-next/assets")) {
  fs.cpSync(".open-next/assets", "dist/client", { recursive: true });
}
