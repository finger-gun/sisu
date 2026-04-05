#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const DEFAULT_EXAMPLES = [
  "ex:ollama:hello",
//   "ex:ollama:rag-vectra",
  "ex:ollama:weather",
//   "ex:ollama:vision",
//   "ex:ollama:stream",
];

const DEFAULT_MODELS = [
  "gemma4:e4b",
  "qwen3.5:35b-a3b-coding-nvfp4",
  "qwen3.5:9b",
//   "qwen3.5:0.8b",
];

const DEFAULT_RUNS = 5;
const VALID_ORDER_MODES = new Set(["grouped", "shuffled"]);

function parseArgs(argv) {
  const args = {
    runs: DEFAULT_RUNS,
    models: DEFAULT_MODELS,
    examples: DEFAULT_EXAMPLES,
    outDir: "benchmark-results",
    dryRun: false,
    timeoutMs: 0,
    cooldownMs: 0,
    order: "grouped",
    resumeFrom: null,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--runs" && argv[i + 1]) {
      args.runs = Number(argv[i + 1]);
      i += 1;
      continue;
    }

    if (arg === "--models" && argv[i + 1]) {
      args.models = argv[i + 1].split(",").map((item) => item.trim()).filter(Boolean);
      i += 1;
      continue;
    }

    if (arg === "--examples" && argv[i + 1]) {
      args.examples = argv[i + 1].split(",").map((item) => item.trim()).filter(Boolean);
      i += 1;
      continue;
    }

    if (arg === "--out-dir" && argv[i + 1]) {
      args.outDir = argv[i + 1];
      i += 1;
      continue;
    }

    if (arg === "--dry-run") {
      args.dryRun = true;
    }

    if (arg === "--timeout-ms" && argv[i + 1]) {
      args.timeoutMs = Number(argv[i + 1]);
      i += 1;
      continue;
    }

    if (arg === "--cooldown-ms" && argv[i + 1]) {
      args.cooldownMs = Number(argv[i + 1]);
      i += 1;
      continue;
    }

    if (arg === "--shuffle") {
      args.order = "shuffled";
      continue;
    }

    if (arg === "--order" && argv[i + 1]) {
      args.order = argv[i + 1];
      i += 1;
      continue;
    }

    if (arg === "--resume-from" && argv[i + 1]) {
      args.resumeFrom = argv[i + 1];
      i += 1;
      continue;
    }
  }

  if (!Number.isInteger(args.runs) || args.runs <= 0) {
    throw new Error(`Invalid --runs value: ${String(args.runs)}. Use a positive integer.`);
  }

  if (args.models.length === 0) {
    throw new Error("No models provided. Use --models=modelA,modelB");
  }

  if (args.examples.length === 0) {
    throw new Error("No examples provided. Use --examples=ex:ollama:hello,...");
  }

  if (!Number.isInteger(args.timeoutMs) || args.timeoutMs < 0) {
    throw new Error(`Invalid --timeout-ms value: ${String(args.timeoutMs)}. Use an integer >= 0.`);
  }

  if (!Number.isInteger(args.cooldownMs) || args.cooldownMs < 0) {
    throw new Error(`Invalid --cooldown-ms value: ${String(args.cooldownMs)}. Use an integer >= 0.`);
  }

  if (!VALID_ORDER_MODES.has(args.order)) {
    throw new Error(`Invalid --order value: ${String(args.order)}. Use one of: grouped, shuffled.`);
  }

  return args;
}

function shuffleInPlace(items) {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = items[i];
    items[i] = items[j];
    items[j] = temp;
  }
}

function sleepMs(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function toRunKey(model, example, run) {
  return `${model}|||${example}|||${String(run)}`;
}

function formatDuration(ms) {
  return `${ms} ms (${(ms / 1000).toFixed(2)}s)`;
}

function sanitizeFileName(input) {
  return input.replace(/[^a-zA-Z0-9._-]+/g, "_");
}

function toCsv(records) {
  const header = [
    "model",
    "example",
    "run",
    "success",
    "timedOut",
    "exitCode",
    "errorCode",
    "durationMs",
    "startIso",
    "endIso",
    "loadAvg1",
    "memUsedPct",
    "logFile",
  ];

  const lines = records.map((record) => {
    const values = [
      record.model,
      record.example,
      String(record.run),
      String(record.success),
      String(record.timedOut || false),
      String(record.exitCode ?? ""),
      String(record.errorCode ?? ""),
      String(record.durationMs),
      record.startIso,
      record.endIso,
      String(record.loadAvg1 ?? ""),
      String(record.memUsedPct ?? ""),
      record.logFile,
    ];

    return values
      .map((value) => `"${String(value).replaceAll('"', '""')}"`)
      .join(",");
  });

  return [header.join(","), ...lines].join("\n");
}

function groupBy(records, keyFn) {
  const map = new Map();

  for (const item of records) {
    const key = keyFn(item);
    const bucket = map.get(key) || [];
    bucket.push(item);
    map.set(key, bucket);
  }

  return map;
}

function calcStats(records) {
  const successful = records.filter((record) => record.success);
  const durations = successful.map((record) => record.durationMs);

  if (durations.length === 0) {
    return {
      successRate: 0,
      count: records.length,
      successCount: 0,
      trimmedCount: 0,
      droppedExtremes: false,
      minMs: null,
      maxMs: null,
      avgMs: null,
      medianMs: null,
    };
  }

  const sorted = [...durations].sort((a, b) => a - b);
  const trimmed = sorted.length >= 3 ? sorted.slice(1, -1) : sorted;
  const sum = trimmed.reduce((acc, cur) => acc + cur, 0);
  const mid = Math.floor(trimmed.length / 2);
  const medianMs =
    trimmed.length % 2 === 0
      ? Math.round((trimmed[mid - 1] + trimmed[mid]) / 2)
      : trimmed[mid];

  return {
    successRate: (successful.length / records.length) * 100,
    count: records.length,
    successCount: successful.length,
    trimmedCount: trimmed.length,
    droppedExtremes: sorted.length >= 3,
    minMs: sorted[0],
    maxMs: sorted[sorted.length - 1],
    avgMs: Math.round(sum / trimmed.length),
    medianMs,
  };
}

function buildMarkdownSummary({ args, records, startedIso, finishedIso }) {
  const lines = [];
  lines.push("# Ollama Example Benchmark Summary");
  lines.push("");
  lines.push(`- Started: ${startedIso}`);
  lines.push(`- Finished: ${finishedIso}`);
  lines.push(`- Examples: ${args.examples.join(", ")}`);
  lines.push(`- Models: ${args.models.join(", ")}`);
  lines.push(`- Runs per example/model: ${args.runs}`);
  lines.push(`- Timeout per run: ${args.timeoutMs > 0 ? `${args.timeoutMs} ms` : "disabled"}`);
  lines.push(`- Cooldown between runs: ${args.cooldownMs} ms`);
  lines.push(`- Execution order: ${args.order}`);
  lines.push("- Stats rule: when there are at least 3 successful runs, the fastest and slowest successful run are excluded from avg/median.");
  if (args.resumeFrom) {
    lines.push(`- Resumed from: ${args.resumeFrom}`);
  }
  lines.push("");

  const byExampleModel = groupBy(records, (record) => `${record.example}|||${record.model}`);

  lines.push("## Per Example Comparison");
  lines.push("");

  for (const example of args.examples) {
    lines.push(`### ${example}`);
    lines.push("");
    lines.push("| Model | Success | Used | Avg (trimmed) | Median (trimmed) | Min (raw) | Max (raw) |");
    lines.push("| --- | --- | --- | --- | --- | --- | --- |");

    const rows = args.models.map((model) => {
      const key = `${example}|||${model}`;
      const stats = calcStats(byExampleModel.get(key) || []);
      return {
        model,
        stats,
      };
    });

    rows.sort((a, b) => {
      if (a.stats.avgMs === null && b.stats.avgMs === null) return 0;
      if (a.stats.avgMs === null) return 1;
      if (b.stats.avgMs === null) return -1;
      return a.stats.avgMs - b.stats.avgMs;
    });

    for (const row of rows) {
      const { model, stats } = row;
      const successCell = `${stats.successCount}/${stats.count} (${stats.successRate.toFixed(0)}%)`;
      const usedCell = `${stats.trimmedCount}/${stats.successCount}`;
      const avgCell = stats.avgMs === null ? "n/a" : formatDuration(stats.avgMs);
      const medianCell = stats.medianMs === null ? "n/a" : formatDuration(stats.medianMs);
      const minCell = stats.minMs === null ? "n/a" : formatDuration(stats.minMs);
      const maxCell = stats.maxMs === null ? "n/a" : formatDuration(stats.maxMs);
      lines.push(`| ${model} | ${successCell} | ${usedCell} | ${avgCell} | ${medianCell} | ${minCell} | ${maxCell} |`);
    }

    lines.push("");
  }

  const byModel = groupBy(records, (record) => record.model);
  const overallRows = args.models.map((model) => {
    const stats = calcStats(byModel.get(model) || []);
    return { model, stats };
  });

  overallRows.sort((a, b) => {
    if (a.stats.avgMs === null && b.stats.avgMs === null) return 0;
    if (a.stats.avgMs === null) return 1;
    if (b.stats.avgMs === null) return -1;
    return a.stats.avgMs - b.stats.avgMs;
  });

  lines.push("## Overall Benchmark Ranking");
  lines.push("");
  lines.push("| Rank | Model | Success | Used | Avg (trimmed) | Median (trimmed) | Min (raw) | Max (raw) |");
  lines.push("| --- | --- | --- | --- | --- | --- | --- | --- |");

  let rank = 1;
  for (const row of overallRows) {
    const { model, stats } = row;
    const successCell = `${stats.successCount}/${stats.count} (${stats.successRate.toFixed(0)}%)`;
    const usedCell = `${stats.trimmedCount}/${stats.successCount}`;
    const avgCell = stats.avgMs === null ? "n/a" : formatDuration(stats.avgMs);
    const medianCell = stats.medianMs === null ? "n/a" : formatDuration(stats.medianMs);
    const minCell = stats.minMs === null ? "n/a" : formatDuration(stats.minMs);
    const maxCell = stats.maxMs === null ? "n/a" : formatDuration(stats.maxMs);
    lines.push(`| ${rank} | ${model} | ${successCell} | ${usedCell} | ${avgCell} | ${medianCell} | ${minCell} | ${maxCell} |`);
    rank += 1;
  }

  lines.push("");
  return lines.join("\n");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const started = new Date();
  const startedIso = started.toISOString();
  const runStamp = startedIso.replaceAll(":", "-").replaceAll(".", "-");

  let existingRecords = [];
  let outputDir;

  if (args.resumeFrom) {
    const resumePath = path.resolve(process.cwd(), args.resumeFrom);
    if (!existsSync(resumePath)) {
      throw new Error(`--resume-from file not found: ${resumePath}`);
    }

    const prior = JSON.parse(readFileSync(resumePath, "utf8"));
    existingRecords = Array.isArray(prior.records) ? prior.records : [];
    outputDir = path.dirname(resumePath);
    args.resumeFrom = resumePath;
  } else {
    outputDir = path.resolve(process.cwd(), args.outDir, `ollama-benchmark-${runStamp}`);
  }

  mkdirSync(outputDir, { recursive: true });

  console.log("Running benchmark with configuration:");
  console.log(`  outputDir: ${outputDir}`);
  console.log(`  runs: ${args.runs}`);
  console.log(`  examples: ${args.examples.join(", ")}`);
  console.log(`  models: ${args.models.join(", ")}`);
  console.log(`  dryRun: ${args.dryRun}`);
  console.log(`  timeoutMs: ${args.timeoutMs}`);
  console.log(`  cooldownMs: ${args.cooldownMs}`);
  console.log(`  order: ${args.order}`);
  console.log(`  resumeFrom: ${args.resumeFrom || "none"}`);
  console.log("");

  const records = [...existingRecords];
  const completed = new Set(
    existingRecords.map((record) => toRunKey(record.model, record.example, record.run)),
  );
  const allJobs = [];
  for (const model of args.models) {
    for (const example of args.examples) {
      for (let run = 1; run <= args.runs; run += 1) {
        allJobs.push({ model, example, run });
      }
    }
  }

  const pendingJobs = allJobs.filter((job) => !completed.has(toRunKey(job.model, job.example, job.run)));
  if (args.order === "shuffled") {
    shuffleInPlace(pendingJobs);
  }

  const totalRuns = allJobs.length;
  let runIndex = records.length;
  const checkpointPath = path.join(outputDir, "checkpoint.ndjson");

  const writeOutputs = (finishedIso) => {
    const rawJsonPath = path.join(outputDir, "raw-results.json");
    const csvPath = path.join(outputDir, "raw-results.csv");
    const summaryPath = path.join(outputDir, "summary.md");

    writeFileSync(
      rawJsonPath,
      JSON.stringify(
        {
          config: {
            startedIso,
            finishedIso,
            runs: args.runs,
            models: args.models,
            examples: args.examples,
            timeoutMs: args.timeoutMs,
            cooldownMs: args.cooldownMs,
            order: args.order,
            resumeFrom: args.resumeFrom,
          },
          records,
        },
        null,
        2,
      ),
      "utf8",
    );

    writeFileSync(csvPath, toCsv(records), "utf8");

    const summaryMd = buildMarkdownSummary({
      args,
      records,
      startedIso,
      finishedIso,
    });

    writeFileSync(summaryPath, summaryMd, "utf8");

    return { rawJsonPath, csvPath, summaryPath };
  };

  if (pendingJobs.length === 0) {
    console.log("No pending runs found. Writing refreshed summary from existing records.");
    const { rawJsonPath, csvPath, summaryPath } = writeOutputs(new Date().toISOString());
    console.log(`- Raw JSON: ${rawJsonPath}`);
    console.log(`- Raw CSV: ${csvPath}`);
    console.log(`- Summary: ${summaryPath}`);
    return;
  }

  for (const job of pendingJobs) {
    const { model, example, run } = job;
    runIndex += 1;

    const startMs = Date.now();
    const startIso = new Date(startMs).toISOString();
    const loadAvg1 = os.loadavg()[0];
    const memUsedPct = ((os.totalmem() - os.freemem()) / os.totalmem()) * 100;

    console.log(`[${runIndex}/${totalRuns}] ${example} | model=${model} | run=${run}`);

    let result;
    if (args.dryRun) {
      result = {
        status: 0,
        signal: null,
        stdout: "",
        stderr: "",
        error: null,
      };
    } else {
      result = spawnSync("pnpm", [example], {
        cwd: process.cwd(),
        env: {
          ...process.env,
          MODEL: model,
        },
        encoding: "utf8",
        maxBuffer: 10 * 1024 * 1024,
        timeout: args.timeoutMs > 0 ? args.timeoutMs : undefined,
        killSignal: "SIGKILL",
      });
    }

    const endMs = Date.now();
    const endIso = new Date(endMs).toISOString();
    const durationMs = endMs - startMs;
    const errorCode = result.error?.code || null;
    const timedOut = errorCode === "ETIMEDOUT";
    const success = result.status === 0 && !timedOut;

    const safeModel = sanitizeFileName(model);
    const safeExample = sanitizeFileName(example);
    const logFile = `${safeExample}__${safeModel}__run-${run}.log`;
    const logPath = path.join(outputDir, logFile);

    const stdout = result.stdout || "";
    const stderr = result.stderr || "";
    const outputText = [
      `example=${example}`,
      `model=${model}`,
      `run=${run}`,
      `start=${startIso}`,
      `end=${endIso}`,
      `durationMs=${durationMs}`,
      `exitCode=${String(result.status ?? "")}`,
      `signal=${String(result.signal ?? "")}`,
      `timedOut=${String(timedOut)}`,
      `errorCode=${String(errorCode ?? "")}`,
      `loadAvg1=${loadAvg1.toFixed(2)}`,
      `memUsedPct=${memUsedPct.toFixed(2)}`,
      "",
      "--- stdout ---",
      stdout,
      "",
      "--- stderr ---",
      stderr,
    ].join("\n");

    writeFileSync(logPath, outputText, "utf8");

    const record = {
      model,
      example,
      run,
      startMs,
      endMs,
      startIso,
      endIso,
      durationMs,
      exitCode: result.status,
      signal: result.signal,
      timedOut,
      errorCode,
      success,
      loadAvg1: Number(loadAvg1.toFixed(2)),
      memUsedPct: Number(memUsedPct.toFixed(2)),
      logFile,
    };

    records.push(record);
    appendFileSync(checkpointPath, `${JSON.stringify(record)}\n`, "utf8");
    writeOutputs(new Date().toISOString());

    const statusLabel = timedOut ? "TIMEOUT" : success ? "OK" : "FAIL";
    console.log(`  -> ${statusLabel} in ${formatDuration(durationMs)}`);

    if (args.cooldownMs > 0 && runIndex < totalRuns) {
      await sleepMs(args.cooldownMs);
    }
  }

  const finishedIso = new Date().toISOString();
  const { rawJsonPath, csvPath, summaryPath } = writeOutputs(finishedIso);

  console.log("\nBenchmark complete.");
  console.log(`- Raw JSON: ${rawJsonPath}`);
  console.log(`- Raw CSV: ${csvPath}`);
  console.log(`- Summary: ${summaryPath}`);
}

try {
  await main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Benchmark failed: ${message}`);
  process.exit(1);
}
