import { VariableUtility } from "../../src/support/VariableUtility";

describe("VariableUtility", () => {
  describe("isIgnoredVariable", () => {
    it("should ignore variables with SECRET_STASH_ prefix", () => {
      expect(VariableUtility.isIgnoredVariable("SECRET_STASH_API_TOKEN")).toBe(true);
      expect(VariableUtility.isIgnoredVariable("SECRET_STASH_APPLICATION_ID")).toBe(true);
    });

    it("should ignore variables in the ignored list", () => {
      expect(VariableUtility.isIgnoredVariable("APP_KEY", ["APP_KEY"])).toBe(true);
      expect(VariableUtility.isIgnoredVariable("APP_ENV", ["APP_KEY", "APP_ENV"])).toBe(true);
    });

    it("should not ignore normal variables", () => {
      expect(VariableUtility.isIgnoredVariable("DB_HOST")).toBe(false);
      expect(VariableUtility.isIgnoredVariable("DB_HOST", ["APP_KEY"])).toBe(false);
    });
  });

  describe("filterVariables", () => {
    it("should filter out ignored variables", () => {
      const variables = {
        "DB_HOST": "localhost",
        "DB_PORT": "3306",
        "APP_KEY": "base64:abc",
        "SECRET_STASH_API_TOKEN": "token123",
      };

      const filtered = VariableUtility.filterVariables(variables, ["APP_KEY"]);

      expect(filtered).toEqual({
        "DB_HOST": "localhost",
        "DB_PORT": "3306",
      });
    });

    it("should return all variables when no ignored list", () => {
      const variables = {
        "DB_HOST": "localhost",
        "DB_PORT": "3306",
      };

      const filtered = VariableUtility.filterVariables(variables);
      expect(filtered).toEqual(variables);
    });
  });

  describe("instance filter", () => {
    it("should filter using instance ignored list", () => {
      const utility = new VariableUtility(["APP_KEY", "APP_ENV"]);
      const variables = {
        "DB_HOST": "localhost",
        "APP_KEY": "base64:abc",
        "APP_ENV": "local",
      };

      const filtered = utility.filter(variables);
      expect(filtered).toEqual({ "DB_HOST": "localhost" });
    });

    it("should check if a variable is ignored via instance", () => {
      const utility = new VariableUtility(["APP_KEY"]);
      expect(utility.isIgnored("APP_KEY")).toBe(true);
      expect(utility.isIgnored("DB_HOST")).toBe(false);
      expect(utility.isIgnored("SECRET_STASH_TOKEN")).toBe(true);
    });
  });

  describe("parseEnvContent", () => {
    it("should parse simple key=value pairs", () => {
      const content = "DB_HOST=localhost\nDB_PORT=3306";
      const result = VariableUtility.parseEnvContent(content);
      expect(result).toEqual({
        "DB_HOST": "localhost",
        "DB_PORT": "3306",
      });
    });

    it("should skip comments", () => {
      const content = "# This is a comment\nDB_HOST=localhost\n# Another comment";
      const result = VariableUtility.parseEnvContent(content);
      expect(result).toEqual({ "DB_HOST": "localhost" });
    });

    it("should skip empty lines", () => {
      const content = "DB_HOST=localhost\n\n\nDB_PORT=3306";
      const result = VariableUtility.parseEnvContent(content);
      expect(result).toEqual({
        "DB_HOST": "localhost",
        "DB_PORT": "3306",
      });
    });

    it("should handle export prefix", () => {
      const content = "export DB_HOST=localhost\nexport DB_PORT=3306";
      const result = VariableUtility.parseEnvContent(content);
      expect(result).toEqual({
        "DB_HOST": "localhost",
        "DB_PORT": "3306",
      });
    });

    it("should handle values with equals signs", () => {
      const content = "DATABASE_URL=postgres://user:pass@host:5432/db?sslmode=require";
      const result = VariableUtility.parseEnvContent(content);
      expect(result).toEqual({
        "DATABASE_URL": "postgres://user:pass@host:5432/db?sslmode=require",
      });
    });

    it("should handle empty content", () => {
      expect(VariableUtility.parseEnvContent("")).toEqual({});
    });

    it("should handle CRLF line endings", () => {
      const content = "DB_HOST=localhost\r\nDB_PORT=3306\r\n";
      const result = VariableUtility.parseEnvContent(content);
      expect(result).toEqual({
        "DB_HOST": "localhost",
        "DB_PORT": "3306",
      });
    });

    it("should handle quoted values", () => {
      const content = "APP_NAME=\"My App\"\nAPP_KEY='secret'";
      const result = VariableUtility.parseEnvContent(content);
      expect(result).toEqual({
        "APP_NAME": "\"My App\"",
        "APP_KEY": "'secret'",
      });
    });
  });

  describe("mergeEnvContent", () => {
    it("should update existing variables", () => {
      const content = "DB_HOST=localhost\nDB_PORT=3306\n";
      const variables = { "DB_HOST": "production.host" };
      const result = VariableUtility.mergeEnvContent(content, variables);
      expect(result).toContain("DB_HOST=production.host");
      expect(result).toContain("DB_PORT=3306");
    });

    it("should append new variables", () => {
      const content = "DB_HOST=localhost\n";
      const variables = { "DB_PORT": "5432" };
      const result = VariableUtility.mergeEnvContent(content, variables);
      expect(result).toContain("DB_HOST=localhost");
      expect(result).toContain("DB_PORT=5432");
    });

    it("should handle empty content", () => {
      const variables = { "DB_HOST": "localhost", "DB_PORT": "3306" };
      const result = VariableUtility.mergeEnvContent("", variables);
      expect(result).toContain("DB_HOST=localhost");
      expect(result).toContain("DB_PORT=3306");
    });

    it("should preserve comments and blank lines", () => {
      const content = "# Database config\nDB_HOST=localhost\n\n# Port\nDB_PORT=3306\n";
      const variables = { "DB_HOST": "new-host" };
      const result = VariableUtility.mergeEnvContent(content, variables);
      expect(result).toContain("# Database config");
      expect(result).toContain("DB_HOST=new-host");
      expect(result).toContain("# Port");
      expect(result).toContain("DB_PORT=3306");
    });

    it("should preserve trailing newline when original has one", () => {
      const content = "DB_HOST=localhost\n";
      const variables = { "DB_HOST": "new-host" };
      const result = VariableUtility.mergeEnvContent(content, variables);
      expect(result.endsWith("\n")).toBe(true);
    });

    it("should handle CRLF line endings", () => {
      const content = "DB_HOST=localhost\r\nDB_PORT=3306\r\n";
      const variables = { "DB_HOST": "new-host" };
      const result = VariableUtility.mergeEnvContent(content, variables);
      expect(result).toContain("DB_HOST=new-host");
    });
  });
});
