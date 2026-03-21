import { describe, it, expect } from 'vitest';
import { parseMavenDependencyTree } from './maven-parser.js';

const SAMPLE_OUTPUT = `[INFO] --- dependency:3.6.0:tree (default-cli) @ my-app ---
[INFO] com.example:my-app:jar:1.0-SNAPSHOT
[INFO] +- org.springframework:spring-core:jar:5.3.9:compile
[INFO] |  \\- org.springframework:spring-jcl:jar:5.3.9:compile
[INFO] +- com.fasterxml.jackson.core:jackson-databind:jar:2.13.0:compile
[INFO] |  +- com.fasterxml.jackson.core:jackson-annotations:jar:2.13.0:compile
[INFO] |  \\- com.fasterxml.jackson.core:jackson-core:jar:2.13.0:compile
[INFO] \\- junit:junit:jar:4.13.2:test
[INFO]    \\- org.hamcrest:hamcrest-core:jar:1.3:test`;

describe('parseMavenDependencyTree', () => {
  it('should parse direct dependencies', () => {
    const result = parseMavenDependencyTree(SAMPLE_OUTPUT);

    expect(result.dependencies).toContainEqual(
      expect.objectContaining({
        name: 'org.springframework:spring-core',
        version: '5.3.9',
        dev: false,
        transitive: false,
      })
    );
    expect(result.dependencies).toContainEqual(
      expect.objectContaining({
        name: 'com.fasterxml.jackson.core:jackson-databind',
        version: '2.13.0',
        dev: false,
        transitive: false,
      })
    );
  });

  it('should identify test-scoped dependencies as dev', () => {
    const result = parseMavenDependencyTree(SAMPLE_OUTPUT);

    expect(result.dependencies).toContainEqual(
      expect.objectContaining({
        name: 'junit:junit',
        version: '4.13.2',
        dev: true,
        transitive: false,
      })
    );
  });

  it('should identify transitive dependencies', () => {
    const result = parseMavenDependencyTree(SAMPLE_OUTPUT);

    expect(result.dependencies).toContainEqual(
      expect.objectContaining({
        name: 'org.springframework:spring-jcl',
        version: '5.3.9',
        transitive: true,
      })
    );
    expect(result.dependencies).toContainEqual(
      expect.objectContaining({
        name: 'com.fasterxml.jackson.core:jackson-annotations',
        version: '2.13.0',
        transitive: true,
      })
    );
  });

  it('should build dependency graph edges', () => {
    const result = parseMavenDependencyTree(SAMPLE_OUTPUT);

    expect(
      result.edges['com.fasterxml.jackson.core:jackson-databind@2.13.0']
    ).toContain('com.fasterxml.jackson.core:jackson-annotations@2.13.0');
    expect(
      result.edges['com.fasterxml.jackson.core:jackson-databind@2.13.0']
    ).toContain('com.fasterxml.jackson.core:jackson-core@2.13.0');
  });

  it('should compute includedBy chains for transitive deps', () => {
    const result = parseMavenDependencyTree(SAMPLE_OUTPUT);

    const springJcl = result.dependencies.find(
      (d) => d.name === 'org.springframework:spring-jcl'
    );
    expect(springJcl?.includedBy).toEqual([
      ['org.springframework:spring-core@5.3.9'],
    ]);
  });

  it('should not include root project as a dependency', () => {
    const result = parseMavenDependencyTree(SAMPLE_OUTPUT);

    const rootDep = result.dependencies.find(
      (d) => d.name === 'com.example:my-app'
    );
    expect(rootDep).toBeUndefined();
  });

  it('should handle empty output', () => {
    const result = parseMavenDependencyTree('');

    expect(result.dependencies).toEqual([]);
    expect(result.edges).toEqual({});
  });

  it('should handle dependencies with classifier', () => {
    const output = `[INFO] com.example:my-app:jar:1.0
[INFO] +- org.lwjgl:lwjgl:jar:natives-linux:3.3.1:compile`;

    const result = parseMavenDependencyTree(output);

    expect(result.dependencies).toContainEqual(
      expect.objectContaining({
        name: 'org.lwjgl:lwjgl',
        version: '3.3.1',
        dev: false,
      })
    );
  });

  it('should deduplicate dependencies that appear multiple times', () => {
    const output = `[INFO] com.example:my-app:jar:1.0
[INFO] +- org.slf4j:slf4j-api:jar:1.7.36:compile
[INFO] +- ch.qos.logback:logback-classic:jar:1.2.11:compile
[INFO] |  \\- org.slf4j:slf4j-api:jar:1.7.36:compile`;

    const result = parseMavenDependencyTree(output);

    const slf4jDeps = result.dependencies.filter(
      (d) => d.name === 'org.slf4j:slf4j-api'
    );
    expect(slf4jDeps).toHaveLength(1);
  });
});
