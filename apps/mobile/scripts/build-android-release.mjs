import { spawn, spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const mobileDirectory = join(scriptDirectory, "..");
const androidDirectory = join(mobileDirectory, "android");
const isWindows = process.platform === "win32";
const gradleCommand = isWindows ? process.env.ComSpec ?? "cmd.exe" : "./gradlew";
const gradleArgs = isWindows
  ? ["/d", "/s", "/c", "gradlew.bat assembleRelease"]
  : ["assembleRelease"];

const expoCli = join(mobileDirectory, "node_modules", "expo", "bin", "cli");
const prebuild = spawnSync(
  process.execPath,
  [expoCli, "prebuild", "--platform", "android", "--no-install"],
  {
    cwd: mobileDirectory,
    env: {
      ...process.env,
      NODE_ENV: "production",
    },
    stdio: "inherit",
  },
);
if (prebuild.status !== 0) {
  process.exit(prebuild.status ?? 1);
}

const child = spawn(gradleCommand, gradleArgs, {
  cwd: androidDirectory,
  env: {
    ...process.env,
    NODE_ENV: "production",
  },
  shell: false,
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
