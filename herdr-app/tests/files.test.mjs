import { test } from "node:test";
import assert from "node:assert/strict";
import { fileLook, folderLook, gitLook, decorate, pathKey } from "../mods/desktop-files/look.js";
import { LIST } from "../mods/desktop-files/list.js";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("LIST: folders and files with UTF-8 names, no .git, a link is a folder only while its target is", () => {
  const root = mkdtempSync(join(tmpdir(), "files-list-"));
  try {
    mkdirSync(join(root, "Tổng hợp")); mkdirSync(join(root, ".git")); mkdirSync(join(root, "gone"));
    writeFileSync(join(root, "lỗi.md"), "x");
    symlinkSync(join(root, "Tổng hợp"), join(root, "link"), "junction");
    symlinkSync(join(root, "gone"), join(root, "dangling"), "junction");
    rmSync(join(root, "gone"), { recursive: true });
    const got = JSON.parse(execFileSync("node", ["-e", LIST, root], { encoding: "utf8" }));
    assert.deepEqual(got.sort((a, b) => a.name.localeCompare(b.name)), [
      { name: "dangling", dir: false }, { name: "link", dir: true }, { name: "lỗi.md", dir: false }, { name: "Tổng hợp", dir: true }]);
    assert.throws(() => execFileSync("node", ["-e", LIST, join(root, "missing")], { stdio: "pipe" }), /ENOENT/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("fileLook: a whole name wins over its extension, then the extension, then a plain file", () => {
  assert.deepEqual(fileLook("compose.override.yaml"), { icon: "icons/docker.svg", tone: "ansi6" });
  assert.deepEqual(fileLook("Dockerfile"), { icon: "icons/docker.svg", tone: "ansi6" });
  assert.deepEqual(fileLook("package.json"), { icon: "icons/npm.svg", tone: "ansi1" });
  assert.equal(fileLook("package-lock.json").tone, "dim");
  assert.equal(fileLook(".gitignore").icon, "icons/git.svg");
  assert.equal(fileLook("Directory.Build.props").icon, "icons/dotnet.svg");
  assert.equal(fileLook("Demo.slnx").icon, "icons/dotnet.svg");
  assert.equal(fileLook("Program.cs").icon, "icons/dotnet.svg");
  assert.equal(fileLook("tsconfig.app.json").icon, "icons/tsc.svg");
  assert.equal(fileLook("main.tsx").icon, "icons/tsc.svg");
  assert.equal(fileLook("seed.mjs").icon, "icons/node.svg");
  assert.equal(fileLook("native-dev.sh").icon, "icons/shell.svg");
  assert.deepEqual(fileLook(".env.example"), { icon: "mods/desktop-files/file.svg", tone: "ansi3" });
  assert.equal(fileLook("README.md").tone, "ansi4");
  assert.equal(fileLook("Demo.runsettings").tone, "ansi1");
  assert.deepEqual(fileLook("noextension"), { icon: "mods/desktop-files/file.svg", tone: "muted" });
});

test("folderLook: open and closed icons, special folders get their tone", () => {
  assert.deepEqual(folderLook("src", false), { icon: "mods/desktop-files/folder.svg", tone: "ansi2" });
  assert.deepEqual(folderLook("tests", true), { icon: "mods/desktop-files/folder-open.svg", tone: "ansi6" });
  assert.equal(folderLook("_bmad-output", false).tone, "ansi5");
  assert.equal(folderLook("node_modules", false).tone, "dim");
  assert.equal(folderLook("admin-web", false).tone, "muted");
});

test("gitLook: VS Code's letters (U untracked, A added, M modified, D deleted, ! conflict)", () => {
  assert.deepEqual(gitLook("??"), { mark: "U", tone: "ansi2" });
  assert.deepEqual(gitLook("A "), { mark: "A", tone: "ansi2" });
  assert.deepEqual(gitLook(" M"), { mark: "M", tone: "blocked" });
  assert.deepEqual(gitLook(" D"), { mark: "D", tone: "ansi1" });
  assert.deepEqual(gitLook("UU"), { mark: "!", tone: "ansi1" });
});

test("decorate: git's D:/… matches the pane's D:\\…, folders above a change carry its strongest tone", () => {
  const { marks, dirty } = decorate(
    [[" M", "src/Api/Program.cs"], ["??", "src/Api/New.cs"], [" D", "src/Old.cs"], [" M", "other/x.md"]],
    "D:/Work/App",
    "D:\\Work\\App\\src");
  assert.deepEqual(marks["api/program.cs"], { mark: "M", tone: "blocked" });
  assert.deepEqual(marks["api/new.cs"], { mark: "U", tone: "ansi2" });
  assert.deepEqual(marks["old.cs"], { mark: "D", tone: "ansi1" });
  assert.equal(marks["../other/x.md"], undefined); // outside the shown root
  assert.equal(dirty["api"], "blocked"); // modified beats untracked
  assert.equal(pathKey("Api\\Program.cs"), "api/program.cs");
});
