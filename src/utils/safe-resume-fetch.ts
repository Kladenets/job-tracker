import { lookup } from "node:dns/promises";
import https from "node:https";
import { BlockList, isIP } from "node:net";

type AddressFamily = 4 | 6;

export interface ResolvedResumeAddress {
  address: string;
  family: AddressFamily;
}

export interface ResumeFetchResponse {
  ok: boolean;
  status: number;
  statusText: string;
  text: string;
  url: string;
}

export interface ResumeHttpResponse {
  statusCode: number;
  statusMessage?: string;
  headers: { location?: string | string[] };
  body: string;
}

export interface ResumeFetchDependencies {
  resolveAddresses?: (hostname: string) => Promise<ResolvedResumeAddress[]>;
  request?: (url: URL, addresses: ResolvedResumeAddress[]) => Promise<ResumeHttpResponse>;
}

export class UnsafeResumeUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeResumeUrlError";
  }
}

const MAX_REDIRECTS = 5;
const MAX_RESPONSE_BYTES = 1_000_000;
const REQUEST_TIMEOUT_MS = 10_000;

const globallyRoutableIpv6 = new BlockList();
globallyRoutableIpv6.addSubnet("2000::", 3, "ipv6");

const blockedAddresses = new BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  blockedAddresses.addSubnet(network, prefix, "ipv4");
}
for (const [network, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["64:ff9b::", 96],
  ["64:ff9b:1::", 48],
  ["100::", 64],
  ["2001::", 23],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["3fff::", 20],
  ["fc00::", 7],
  ["fe80::", 10],
  ["fec0::", 10],
  ["ff00::", 8],
] as const) {
  blockedAddresses.addSubnet(network, prefix, "ipv6");
}

function normalizeHostname(url: URL): string {
  const hostname = url.hostname.startsWith("[") && url.hostname.endsWith("]")
    ? url.hostname.slice(1, -1)
    : url.hostname;
  return hostname.toLowerCase().replace(/\.$/, "");
}

function assertAllowedUrl(url: URL): void {
  if (url.protocol !== "https:") {
    throw new UnsafeResumeUrlError("Resume source URLs must use HTTPS.");
  }
  if (url.username || url.password || (url.port && url.port !== "443")) {
    throw new UnsafeResumeUrlError("Resume source URLs cannot contain credentials or use a non-standard port.");
  }

  const hostname = normalizeHostname(url);
  const localSuffixes = ["localhost", "local", "internal", "home.arpa", "onion"];
  if (!hostname || localSuffixes.some((suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`))) {
    throw new UnsafeResumeUrlError("Local and private network destinations are not allowed.");
  }
}

function isPublicAddress({ address, family }: ResolvedResumeAddress): boolean {
  if (isIP(address) !== family) return false;
  if (family === 6 && !globallyRoutableIpv6.check(address, "ipv6")) return false;
  return !blockedAddresses.check(address, family === 4 ? "ipv4" : "ipv6");
}

async function resolveDestination(hostname: string): Promise<ResolvedResumeAddress[]> {
  const family = isIP(hostname);
  if (family === 4 || family === 6) {
    return [{ address: hostname, family }];
  }

  const addresses = await lookup(hostname, { all: true, verbatim: true });
  return addresses.map(({ address, family: addressFamily }) => ({
    address,
    family: addressFamily as AddressFamily,
  }));
}

function requestText(url: URL, addresses: ResolvedResumeAddress[]): Promise<ResumeHttpResponse> {
  return new Promise((resolve, reject) => {
    const request = https.request(url, {
      method: "GET",
      headers: {
        "User-Agent": "JobTrackerApp/1.0 (ResumeSync)",
        Accept: "application/json",
      },
      lookup: (_hostname, options, callback) => {
        const matching = addresses.filter(({ family }) => !options.family || family === options.family);
        if (matching.length === 0) {
          const error = Object.assign(new Error("No validated address matches the requested IP family."), { code: "ENOTFOUND" });
          callback(error, "");
        } else if (options.all) {
          callback(null, matching);
        } else {
          callback(null, matching[0].address, matching[0].family);
        }
      },
    }, (response) => {
      const chunks: Buffer[] = [];
      let size = 0;
      response.on("data", (chunk: Buffer | string) => {
        const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        size += bytes.length;
        if (size > MAX_RESPONSE_BYTES) {
          response.destroy(new Error("Remote resume exceeds the 1 MB size limit."));
          return;
        }
        chunks.push(bytes);
      });
      response.on("end", () => resolve({
        statusCode: response.statusCode || 0,
        statusMessage: response.statusMessage,
        headers: response.headers,
        body: Buffer.concat(chunks).toString("utf8"),
      }));
      response.on("error", reject);
    });

    request.setTimeout(REQUEST_TIMEOUT_MS, () => request.destroy(new Error("Remote resume request timed out.")));
    request.on("error", reject);
    request.end();
  });
}

export async function fetchSafeResumeText(
  input: string,
  dependencies: ResumeFetchDependencies = {}
): Promise<ResumeFetchResponse> {
  let currentUrl: URL;
  try {
    currentUrl = new URL(input);
  } catch {
    throw new UnsafeResumeUrlError("Resume source URL is invalid.");
  }

  const resolveAddresses = dependencies.resolveAddresses ?? resolveDestination;
  const makeRequest = dependencies.request ?? requestText;

  for (let redirects = 0; ; redirects += 1) {
    assertAllowedUrl(currentUrl);
    const hostname = normalizeHostname(currentUrl);
    let addresses: ResolvedResumeAddress[];
    try {
      addresses = await resolveAddresses(hostname);
    } catch {
      throw new UnsafeResumeUrlError("Resume source hostname could not be resolved safely.");
    }
    if (addresses.length === 0 || addresses.some((address) => !isPublicAddress(address))) {
      throw new UnsafeResumeUrlError("Resume source must resolve only to public IP addresses.");
    }

    const response = await makeRequest(currentUrl, addresses);
    const isRedirect = [301, 302, 303, 307, 308].includes(response.statusCode);
    if (!isRedirect) {
      return {
        ok: response.statusCode >= 200 && response.statusCode < 300,
        status: response.statusCode,
        statusText: response.statusMessage || "",
        text: response.body,
        url: currentUrl.href,
      };
    }

    if (redirects >= MAX_REDIRECTS) {
      throw new UnsafeResumeUrlError("Resume source exceeded the redirect limit.");
    }
    const location = Array.isArray(response.headers.location)
      ? response.headers.location[0]
      : response.headers.location;
    if (!location) {
      throw new UnsafeResumeUrlError("Resume source returned a redirect without a destination.");
    }
    try {
      currentUrl = new URL(location, currentUrl);
    } catch {
      throw new UnsafeResumeUrlError("Resume source returned an invalid redirect destination.");
    }
  }
}