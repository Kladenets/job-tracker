const fs = require("node:fs");
const path = require("node:path");

const sourceDir = path.resolve(process.cwd(), "src/db/migrations");
const outputDir = path.resolve(process.cwd(), "dist/db/migrations");
const migrationFiles = fs.readdirSync(sourceDir).filter((file) => file.endsWith(".sql"));

if (migrationFiles.length === 0) {
  throw new Error(`No SQL migrations found in ${sourceDir}`);
}

fs.mkdirSync(outputDir, { recursive: true });
for (const file of migrationFiles) {
  fs.copyFileSync(path.join(sourceDir, file), path.join(outputDir, file));
}