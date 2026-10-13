import { spawn } from "child_process";
import path from "path";
import {
  JobSpyQuery,
  JobSpyBridgeResult,
  JobSpyBridgeResultSchema,
} from "../types/job.js";

/**
 * Executes python-jobspy via ephemeral child process and returns sanitized, typed job postings.
 */
export async function runJobSpyScraper(
  query: Partial<JobSpyQuery> = {},
  options: { signal?: AbortSignal; timeoutMs?: number } = {}
): Promise<JobSpyBridgeResult> {
  const pythonPath = process.env.PYTHON_PATH || "python3";
  const scriptPath = path.resolve(process.cwd(), "scripts/jobspy_cli.py");

  const searchTerm = query.searchTerm ?? "Software Engineer";
  const location = query.location ?? "Doylestown, PA";
  const distance = String(query.distance ?? 35);
  const resultsWanted = String(query.resultsWanted ?? 5);
  const sites = (query.sites && query.sites.length > 0)
    ? query.sites.join(",")
    : "indeed,google";
  const countryCode = query.countryCode ?? "USA";
  const hoursOld = String(query.hoursOld ?? 72);

  const args: string[] = [
    scriptPath,
    "--search-term",
    searchTerm,
    "--location",
    location,
    "--distance",
    distance,
    "--results-wanted",
    resultsWanted,
    "--sites",
    sites,
    "--country-code",
    countryCode,
    "--hours-old",
    hoursOld,
  ];

  if (query.isRemote) {
    args.push("--is-remote");
  }

  return new Promise<JobSpyBridgeResult>((resolve, reject) => {
    let stdoutData = "";
    let stderrData = "";
    let settled = false;

    const proc = spawn(pythonPath, args, {
      env: { ...process.env },
    });

    const finish = (action: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      options.signal?.removeEventListener("abort", abort);
      action();
    };
    const abort = () => {
      proc.kill("SIGKILL");
      finish(() => reject(
        options.signal?.reason instanceof Error
          ? options.signal.reason
          : new Error("JobSpy scraper aborted")
      ));
    };
    const timeout = setTimeout(() => {
      proc.kill("SIGKILL");
      finish(() => reject(new Error(`JobSpy scraper timed out after ${options.timeoutMs ?? 60_000}ms`)));
    }, options.timeoutMs ?? 60_000);

    if (options.signal?.aborted) {
      abort();
      return;
    }
    options.signal?.addEventListener("abort", abort, { once: true });

    proc.stdout.on("data", (data: Buffer | string) => {
      stdoutData += data.toString();
    });

    proc.stderr.on("data", (data: Buffer | string) => {
      stderrData += data.toString();
    });

    proc.on("close", (code: number | null) => {
      if (settled) return;

      if (code !== 0 && !stdoutData.trim()) {
        return finish(() => resolve({
          success: false,
          requested_sites: sites.split(","),
          total_found: 0,
          errors: {
            process_exit_code: `Process exited with code ${code}`,
            stderr: stderrData.trim(),
          },
          jobs: [],
        }));
      }

      try {
        const rawJson = JSON.parse(stdoutData.trim());
        const validated = JobSpyBridgeResultSchema.parse(rawJson);
        finish(() => resolve(validated));
      } catch (parseErr: unknown) {
        const message = parseErr instanceof Error ? parseErr.message : String(parseErr);
        finish(() => resolve({
          success: false,
          requested_sites: sites.split(","),
          total_found: 0,
          errors: {
            parse_error: message,
            raw_stdout: stdoutData.slice(0, 500),
            raw_stderr: stderrData.slice(0, 500),
          },
          jobs: [],
        }));
      }
    });

    proc.on("error", (err: Error) => {
      finish(() => reject(err));
    });
  });
}
