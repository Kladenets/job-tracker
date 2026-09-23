import { spawn } from "child_process";
import path from "path";
import {
  JobSpyQuery,
  JobSpyBridgeResult,
  JobSpyBridgeResultSchema,
} from "../types/job";

/**
 * Executes python-jobspy via ephemeral child process and returns sanitized, typed job postings.
 */
export async function runJobSpyScraper(
  query: Partial<JobSpyQuery> = {}
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

    const proc = spawn(pythonPath, args, {
      env: { ...process.env },
    });

    const timeout = setTimeout(() => {
      proc.kill("SIGKILL");
      reject(new Error("JobSpy scraper timed out after 60 seconds"));
    }, 60000);

    proc.stdout.on("data", (data: Buffer | string) => {
      stdoutData += data.toString();
    });

    proc.stderr.on("data", (data: Buffer | string) => {
      stderrData += data.toString();
    });

    proc.on("close", (code: number | null) => {
      clearTimeout(timeout);

      if (code !== 0 && !stdoutData.trim()) {
        return resolve({
          success: false,
          requested_sites: sites.split(","),
          total_found: 0,
          errors: {
            process_exit_code: `Process exited with code ${code}`,
            stderr: stderrData.trim(),
          },
          jobs: [],
        });
      }

      try {
        const rawJson = JSON.parse(stdoutData.trim());
        const validated = JobSpyBridgeResultSchema.parse(rawJson);
        resolve(validated);
      } catch (parseErr: unknown) {
        const message = parseErr instanceof Error ? parseErr.message : String(parseErr);
        resolve({
          success: false,
          requested_sites: sites.split(","),
          total_found: 0,
          errors: {
            parse_error: message,
            raw_stdout: stdoutData.slice(0, 500),
            raw_stderr: stderrData.slice(0, 500),
          },
          jobs: [],
        });
      }
    });

    proc.on("error", (err: Error) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}
