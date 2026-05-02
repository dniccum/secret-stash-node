export class VariableUtility {
  static readonly RESERVED_PREFIX = "SECRET_STASH_";

  private ignoredVariables: string[];

  constructor(ignoredVariables: string[] = []) {
    this.ignoredVariables = ignoredVariables;
  }

  filter(variables: Record<string, string>): Record<string, string> {
    return VariableUtility.filterVariables(variables, this.ignoredVariables);
  }

  isIgnored(name: string): boolean {
    return VariableUtility.isIgnoredVariable(name, this.ignoredVariables);
  }

  static filterVariables(variables: Record<string, string>, ignoredVariables: string[] = []): Record<string, string> {
    const filtered: Record<string, string> = {};
    for (const [name, value] of Object.entries(variables)) {
      if (VariableUtility.isIgnoredVariable(name, ignoredVariables)) {
        continue;
      }
      filtered[name] = value;
    }
    return filtered;
  }

  static isIgnoredVariable(name: string, ignoredVariables: string[] = []): boolean {
    if (name.startsWith(VariableUtility.RESERVED_PREFIX)) {
      return true;
    }
    return ignoredVariables.includes(name);
  }

  static parseEnvContent(content: string): Record<string, string> {
    const lines = content.split(/\r\n|\n|\r/);
    const variables: Record<string, string> = {};

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed === "" || trimmed.startsWith("#")) {
        continue;
      }

      const match = line.match(/^\s*(?:export\s+)?([^=\s]+)\s*=\s*(.*?)\s*$/);
      if (!match) {
        continue;
      }

      variables[match[1]] = match[2];
    }

    return variables;
  }

  static mergeEnvContent(content: string, variables: Record<string, string>): string {
    const lineEnding = content.includes("\r\n") ? "\r\n" : "\n";
    const rawLines = content === "" ? [] : content.split(/\r\n|\n|\r/);
    const lines = rawLines.length > 0 && rawLines[rawLines.length - 1] === ""
      ? rawLines.slice(0, -1)
      : rawLines;
    const used: Record<string, boolean> = {};

    for (let index = 0; index < lines.length; index++) {
      const match = lines[index].match(/^\s*(?:export\s+)?([^=\s]+)\s*=\s*(.*)\s*$/);
      if (!match) {
        continue;
      }

      const name = match[1];
      if (!(name in variables)) {
        continue;
      }

      lines[index] = `${name}=${variables[name]}`;
      used[name] = true;
    }

    for (const [name, value] of Object.entries(variables)) {
      if (used[name]) {
        continue;
      }
      lines.push(`${name}=${value}`);
    }

    let merged = lines.join(lineEnding);
    if (content !== "" && content.endsWith(lineEnding) && !merged.endsWith(lineEnding)) {
      merged += lineEnding;
    }

    return merged;
  }
}
