import fs from "node:fs/promises";
const root = new URL("../", import.meta.url);
const dist = new URL("../dist/", import.meta.url);
await fs.rm(dist, { recursive: true, force: true });
await fs.mkdir(dist, { recursive: true });
for (const name of ["index.html", "assets", "data"]) await fs.cp(new URL(name, root), new URL(name, dist), { recursive: true });
await fs.writeFile(new URL(".nojekyll", dist), "");
console.log("静态网站已生成到 dist/");
