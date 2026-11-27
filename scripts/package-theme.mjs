import { execFileSync } from "node:child_process";
import fs from "node:fs";

const themeYaml = fs.readFileSync("theme.yaml", "utf8");
const version =
  themeYaml.match(/^\s*version:\s*["']?([^"'\s]+)["']?/m)?.[1] || "release";
const name =
  themeYaml.match(/^\s*name:\s*["']?([^"'\s]+)["']?/m)?.[1] || "theme-mote";

const outDir = "dist";
const outFile = `${outDir}/${name}-${version}.zip`;

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

const entries = [
  "theme.yaml",
  "settings.yaml",
  "annotation-setting.yaml",
  "README.md",
  "templates",
].filter((entry) => fs.existsSync(entry));

execFileSync("zip", ["-rq", outFile, ...entries], { stdio: "inherit" });

const sizeKb = (fs.statSync(outFile).size / 1024).toFixed(1);
console.log(`Packed: ${outFile} (${sizeKb} KB)`);
