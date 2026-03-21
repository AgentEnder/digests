import { describe, it, expect } from 'vitest';
import { parseAnalyzerOutput } from './parser.js';
import type { AnalyzerOutput } from './analyzer-client.js';

function makeOutput(
  overrides: Partial<AnalyzerOutput> = {}
): AnalyzerOutput {
  return {
    packages: [],
    edges: {},
    packageSources: ['https://api.nuget.org/v3/index.json'],
    errors: [],
    ...overrides,
  };
}

function makePkg(
  name: string,
  version: string,
  direct: boolean,
  sha512: string | null = null
): AnalyzerOutput['packages'][number] {
  return {
    name,
    version,
    sha512,
    direct,
    framework: 'net8.0',
    dependencies: [],
  };
}

describe('parseAnalyzerOutput', () => {
  it('should parse direct dependencies correctly', () => {
    const output = makeOutput({
      packages: [
        makePkg('Newtonsoft.Json', '13.0.3', true),
        makePkg('Serilog', '3.1.1', true),
      ],
    });

    const result = parseAnalyzerOutput(output);

    expect(result.dependencies).toHaveLength(2);
    expect(result.dependencies).toContainEqual(
      expect.objectContaining({
        name: 'Newtonsoft.Json',
        version: '13.0.3',
        dev: false,
        transitive: false,
      })
    );
    expect(result.dependencies).toContainEqual(
      expect.objectContaining({
        name: 'Serilog',
        version: '3.1.1',
        dev: false,
        transitive: false,
      })
    );
  });

  it('should mark transitive dependencies', () => {
    const output = makeOutput({
      packages: [
        makePkg('Newtonsoft.Json', '13.0.3', true),
        makePkg('System.Runtime', '4.3.0', false),
      ],
    });

    const result = parseAnalyzerOutput(output);

    expect(result.dependencies).toContainEqual(
      expect.objectContaining({
        name: 'Newtonsoft.Json',
        transitive: false,
      })
    );
    expect(result.dependencies).toContainEqual(
      expect.objectContaining({
        name: 'System.Runtime',
        transitive: true,
      })
    );
  });

  it('should pass through edge graph', () => {
    const edges = {
      'Newtonsoft.Json@13.0.3': ['System.Runtime@4.3.0'],
    };
    const output = makeOutput({
      packages: [
        makePkg('Newtonsoft.Json', '13.0.3', true),
        makePkg('System.Runtime', '4.3.0', false),
      ],
      edges,
    });

    const result = parseAnalyzerOutput(output);

    expect(result.edges).toEqual(edges);
  });

  it('should compute includedBy chains for transitive deps', () => {
    const output = makeOutput({
      packages: [
        makePkg('Serilog', '3.1.1', true),
        makePkg('Serilog.Sinks.Console', '5.0.0', true),
        makePkg('Serilog.Formatting.Compact', '2.0.0', false),
      ],
      edges: {
        'Serilog.Sinks.Console@5.0.0': ['Serilog.Formatting.Compact@2.0.0'],
      },
    });

    const result = parseAnalyzerOutput(output);

    const compactDep = result.dependencies.find(
      (d) => d.name === 'Serilog.Formatting.Compact'
    );
    expect(compactDep?.includedBy).toEqual([
      ['Serilog.Sinks.Console@5.0.0'],
    ]);
  });

  it('should format sha512 integrity with prefix', () => {
    const output = makeOutput({
      packages: [makePkg('Newtonsoft.Json', '13.0.3', true, 'abc123def456')],
    });

    const result = parseAnalyzerOutput(output);

    expect(result.dependencies[0].integrity).toBe('sha512-abc123def456');
  });

  it('should omit integrity when sha512 is null', () => {
    const output = makeOutput({
      packages: [makePkg('Newtonsoft.Json', '13.0.3', true, null)],
    });

    const result = parseAnalyzerOutput(output);

    expect(result.dependencies[0].integrity).toBeUndefined();
  });

  it('should deduplicate packages', () => {
    const output = makeOutput({
      packages: [
        makePkg('Newtonsoft.Json', '13.0.3', true),
        makePkg('Newtonsoft.Json', '13.0.3', true),
      ],
    });

    const result = parseAnalyzerOutput(output);

    expect(result.dependencies).toHaveLength(1);
  });

  it('should not include includedBy for direct deps', () => {
    const output = makeOutput({
      packages: [makePkg('Newtonsoft.Json', '13.0.3', true)],
      edges: {},
    });

    const result = parseAnalyzerOutput(output);

    expect(result.dependencies[0].includedBy).toBeUndefined();
  });
});
