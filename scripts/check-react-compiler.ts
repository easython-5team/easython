// Runs the React Compiler over every client component and hook and fails if
// any function is skipped or bails out, so "reactCompiler: true" is known to
// actually optimize this code rather than silently fall back.
import { transformSync } from "@babel/core";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

interface CompilerEvent {
  kind: string;
  fnName?: string | null;
  reason?: string;
  detail?: { reason?: string; options?: { reason?: string } } | string;
}

const files = readdirSync("components").filter(f => /\.tsx?$/.test(f)).map(f => join("components", f));
const compiled: string[] = [];
const problems: string[] = [];

for (const file of files) {
  const code = readFileSync(file, "utf8");
  transformSync(code, {
    filename: file,
    babelrc: false,
    configFile: false,
    parserOpts: { plugins: file.endsWith(".tsx") ? ["typescript", "jsx"] : ["typescript"] },
    plugins: [
      ["babel-plugin-react-compiler", {
        panicThreshold: "none",
        logger: {
          logEvent(_filename: string | null, event: CompilerEvent) {
            const name = `${file} › ${event.fnName ?? "(anonymous)"}`;
            if (event.kind === "CompileSuccess") compiled.push(name);
            else if (event.kind === "CompileError" || event.kind === "PipelineError" || event.kind === "CompileSkip") {
              const detail = typeof event.detail === "string" ? event.detail
                : event.detail?.reason ?? event.detail?.options?.reason ?? event.reason ?? "";
              problems.push(`${event.kind}: ${name} ${detail}`);
            }
          },
        },
      }],
    ],
  });
}

for (const name of compiled) console.log("✓ compiled", name);
if (problems.length) {
  for (const problem of problems) console.error("✗", problem);
  process.exit(1);
}
console.log(`React Compiler optimized ${compiled.length} components/hooks with no bail-outs.`);
