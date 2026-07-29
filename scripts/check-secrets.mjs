import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const files = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" }).split("\0").filter(Boolean);
const patterns = [
  { name: "private key", pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u },
  { name: "GitHub token", pattern: /\bgh[pousr]_[A-Za-z0-9_]{30,}\b/u },
  { name: "AWS access key", pattern: /\bAKIA[0-9A-Z]{16}\b/u },
  { name: "database credential", pattern: /(?:postgres(?:ql)?:\/\/)[^\s:@]+:[^\s@]+@/iu },
  { name: "bearer token", pattern: /\bBearer\s+[A-Za-z0-9._~-]{24,}\b/u }
];
const findings = [];

for (const file of files) {
  if (/\.(?:png|jpg|jpeg|gif|ico|pdf|woff2?|zip|gz|lock)$/iu.test(file)) continue;
  let content;
  try {
    content = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  for (const { name, pattern } of patterns) {
    for (const match of content.matchAll(new RegExp(pattern.source, `${pattern.flags}g`))) {
      const lineStart = content.lastIndexOf("\n", match.index ?? 0) + 1;
      const lineEnd = content.indexOf("\n", match.index ?? 0);
      const line = content.slice(lineStart, lineEnd === -1 ? content.length : lineEnd);
      const safeFixture =
        /example|placeholder|dummy|test-secret|do-not-leak|private-password|127\.0\.0\.1:9|replace@/iu.test(line);
      if (!safeFixture) findings.push(`${file}: ${name}`);
    }
  }
}

if (findings.length > 0) {
  console.error(`Potential secrets found (${findings.length}):`);
  for (const finding of findings) console.error(`- ${finding}`);
  process.exitCode = 1;
} else {
  console.log(`secret scan passed (${files.length} tracked files; values redacted)`);
}
