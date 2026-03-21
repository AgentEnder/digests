import { describe, it, expect } from 'vitest';
import { parseGradleDependencies } from './gradle-parser.js';
import type { GradleDependencyOutput } from './gradle-runner.js';

const RUNTIME_OUTPUT = `runtimeClasspath - Runtime classpath of source set 'main'.
+--- org.springframework:spring-core:5.3.9
|    +--- org.springframework:spring-jcl:5.3.9
+--- com.fasterxml.jackson.core:jackson-databind:2.13.0
|    +--- com.fasterxml.jackson.core:jackson-annotations:2.13.0
|    \\--- com.fasterxml.jackson.core:jackson-core:2.13.0`;

const TEST_OUTPUT = `testRuntimeClasspath - Runtime classpath of source set 'test'.
+--- org.springframework:spring-core:5.3.9
|    +--- org.springframework:spring-jcl:5.3.9
+--- com.fasterxml.jackson.core:jackson-databind:2.13.0
|    +--- com.fasterxml.jackson.core:jackson-annotations:2.13.0
|    \\--- com.fasterxml.jackson.core:jackson-core:2.13.0
+--- junit:junit:4.13.2
|    \\--- org.hamcrest:hamcrest-core:1.3`;

function makeOutput(
  runtime = RUNTIME_OUTPUT,
  test = TEST_OUTPUT
): GradleDependencyOutput {
  return { runtimeClasspath: runtime, testRuntimeClasspath: test };
}

describe('parseGradleDependencies', () => {
  it('should parse direct dependencies from runtime classpath', () => {
    const result = parseGradleDependencies(makeOutput());

    expect(result.dependencies).toContainEqual(
      expect.objectContaining({
        name: 'org.springframework:spring-core',
        version: '5.3.9',
        dev: false,
        transitive: false,
      })
    );
  });

  it('should mark test-only dependencies as dev', () => {
    const result = parseGradleDependencies(makeOutput());

    expect(result.dependencies).toContainEqual(
      expect.objectContaining({
        name: 'junit:junit',
        version: '4.13.2',
        dev: true,
      })
    );
  });

  it('should identify transitive dependencies', () => {
    const result = parseGradleDependencies(makeOutput());

    expect(result.dependencies).toContainEqual(
      expect.objectContaining({
        name: 'org.springframework:spring-jcl',
        version: '5.3.9',
        transitive: true,
      })
    );
  });

  it('should build dependency graph edges', () => {
    const result = parseGradleDependencies(makeOutput());

    expect(
      result.edges['com.fasterxml.jackson.core:jackson-databind@2.13.0']
    ).toContain('com.fasterxml.jackson.core:jackson-annotations@2.13.0');
    expect(
      result.edges['com.fasterxml.jackson.core:jackson-databind@2.13.0']
    ).toContain('com.fasterxml.jackson.core:jackson-core@2.13.0');
  });

  it('should handle version conflict resolution', () => {
    const runtime = `+--- com.google.guava:guava:30.1 -> 31.1-jre`;

    const result = parseGradleDependencies(
      makeOutput(runtime, runtime)
    );

    expect(result.dependencies).toContainEqual(
      expect.objectContaining({
        name: 'com.google.guava:guava',
        version: '31.1-jre',
      })
    );
  });

  it('should skip entries marked with (*) but still parse coordinate', () => {
    const runtime = `+--- org.slf4j:slf4j-api:1.7.36
+--- ch.qos.logback:logback-classic:1.2.11
|    \\--- org.slf4j:slf4j-api:1.7.36 (*)`;

    const result = parseGradleDependencies(
      makeOutput(runtime, runtime)
    );

    const slf4jDeps = result.dependencies.filter(
      (d) => d.name === 'org.slf4j:slf4j-api'
    );
    expect(slf4jDeps).toHaveLength(1);
  });

  it('should handle empty output', () => {
    const result = parseGradleDependencies(
      makeOutput('', '')
    );

    expect(result.dependencies).toEqual([]);
    expect(result.edges).toEqual({});
  });

  it('should not duplicate deps that appear in both runtime and test', () => {
    const result = parseGradleDependencies(makeOutput());

    const springCoreDeps = result.dependencies.filter(
      (d) => d.name === 'org.springframework:spring-core'
    );
    expect(springCoreDeps).toHaveLength(1);
    expect(springCoreDeps[0].dev).toBe(false);
  });

  it('should compute includedBy chains', () => {
    const result = parseGradleDependencies(makeOutput());

    const springJcl = result.dependencies.find(
      (d) => d.name === 'org.springframework:spring-jcl'
    );
    expect(springJcl?.includedBy).toBeDefined();
    expect(springJcl?.includedBy?.length).toBeGreaterThan(0);
    expect(springJcl?.includedBy?.[0]).toContain(
      'org.springframework:spring-core@5.3.9'
    );
  });
});
