import { execFileSync } from "child_process";
import * as path from "path";

const CLI_PATH = path.resolve(__dirname, "../dist/cli.js");

function runCli(args: string): string {
  const argv = args.split(/\s+/).filter((a) => a.length > 0);
  try {
    return execFileSync(process.execPath, [CLI_PATH, ...argv], {
      encoding: "utf-8",
      timeout: 5000,
    });
  } catch (e: unknown) {
    // Commander exits with code 0 for --help, but some shells treat it as error
    const err = e as { stdout?: string; stderr?: string };
    return (err.stdout ?? "") + (err.stderr ?? "");
  }
}

describe("CLI", () => {
  it("should display help with command groups", () => {
    const output = runCli("--help");

    expect(output).toContain("secret-stash");
    expect(output).toContain("key");
    expect(output).toContain("variables");
    expect(output).toContain("environments");
    expect(output).toContain("envelope");
    expect(output).toContain("applications");
    expect(output).toContain("--application");
  });

  it("should display version", () => {
    const output = runCli("--version");
    expect(output.trim()).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("should display key subcommands", () => {
    const output = runCli("key --help");

    expect(output).toContain("init");
    expect(output).toContain("status");
    expect(output).toContain("sync");
    expect(output).toContain("recovery");
  });

  it("should display variables subcommands", () => {
    const output = runCli("variables --help");

    expect(output).toContain("list");
    expect(output).toContain("pull");
    expect(output).toContain("push");
  });

  it("should display environments subcommands", () => {
    const output = runCli("environments --help");

    expect(output).toContain("list");
    expect(output).toContain("create");
  });

  it("should display envelope subcommands", () => {
    const output = runCli("envelope --help");

    expect(output).toContain("rewrap");
    expect(output).toContain("reset");
    expect(output).toContain("repair");
  });

  it("should display applications subcommands", () => {
    const output = runCli("applications --help");

    expect(output).toContain("list");
  });

  it("should show global --application option in key init help", () => {
    const output = runCli("key init --help");

    expect(output).toContain("--label");
    expect(output).toContain("--force");
    expect(output).toContain("--temporary");
    expect(output).toContain("--ttl");
  });
});
