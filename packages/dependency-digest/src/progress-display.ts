/**
 * Multi-line progress display for parallel plugin scanning.
 *
 * Main screen: one line per plugin with progress bar + status.
 * Alt screen:  full terminal view of a single plugin's captured logs.
 *
 * Keyboard:
 *   1-9  — view logs for plugin N (by display order)
 *   q/Esc — return to main progress view
 */

import type { LogEntry } from './worker-messages.js';

// ── ANSI helpers ────────────────────────────────────────────────────────────

const ESC = '\x1b';
const CSI = `${ESC}[`;

const ansi = {
  clearLine: `${CSI}2K`,
  cursorUp: (n: number): string => (n > 0 ? `${CSI}${n}A` : ''),
  cursorDown: (n: number): string => (n > 0 ? `${CSI}${n}B` : ''),
  cursorTo: (col: number): string => `${CSI}${col}G`,
  hideCursor: `${CSI}?25l`,
  showCursor: `${CSI}?25h`,
  altScreenEnter: `${CSI}?1049h`,
  altScreenLeave: `${CSI}?1049l`,
  clearScreen: `${CSI}2J${CSI}H`,
  clearToScreenEnd: `${CSI}J`,
  bold: (s: string): string => `${CSI}1m${s}${CSI}0m`,
  dim: (s: string): string => `${CSI}2m${s}${CSI}0m`,
  green: (s: string): string => `${CSI}32m${s}${CSI}0m`,
  yellow: (s: string): string => `${CSI}33m${s}${CSI}0m`,
  cyan: (s: string): string => `${CSI}36m${s}${CSI}0m`,
  red: (s: string): string => `${CSI}31m${s}${CSI}0m`,
  gray: (s: string): string => `${CSI}90m${s}${CSI}0m`,
  inverse: (s: string): string => `${CSI}7m${s}${CSI}0m`,
} as const;

// ── Types ───────────────────────────────────────────────────────────────────

type PluginPhase = 'waiting' | 'detect' | 'parse' | 'fetch' | 'done' | 'error';

export interface PluginState {
  name: string;
  ecosystem: string;
  phase: PluginPhase;
  /** For fetch phase: how many completed so far */
  current: number;
  /** For fetch phase: total deps to fetch */
  total: number;
  /** Name of the dep currently being fetched */
  currentDep?: string;
  /** Summary text shown after completion */
  summary?: string;
  /** Captured log output from the worker */
  logs: LogEntry[];
  /** Number of manifests found */
  manifestCount: number;
}

// ── Progress bar renderer ───────────────────────────────────────────────────

function progressBar(current: number, total: number, width: number): string {
  if (total === 0) return ' '.repeat(width);
  const fraction = Math.min(current / total, 1);
  const filled = Math.round(fraction * width);
  const empty = width - filled;

  const FILLED_CHAR = '\u2588'; // █
  const EMPTY_CHAR = '\u2591'; // ░

  return ansi.green(FILLED_CHAR.repeat(filled)) + ansi.dim(EMPTY_CHAR.repeat(empty));
}

// ── Main progress display class ─────────────────────────────────────────────

export class ProgressDisplay {
  private plugins: PluginState[] = [];
  private pluginIndex = new Map<string, number>();
  private linesRendered = 0;
  private inAltScreen = false;
  private altScreenPlugin: number | null = null;
  private altScrollOffset = 0;
  private write: (data: string) => void;
  private isTTY: boolean;
  private rawModeWasEnabled = false;
  private keyHandler: ((data: Buffer) => void) | null = null;
  private logPollTimer: ReturnType<typeof setInterval> | null = null;
  private logPoller: (() => Promise<void>) | null = null;
  private cols: number;
  private rows: number;
  private resizeHandler: (() => void) | null = null;
  private sigintHandler: (() => void) | null = null;
  private maxNameWidth = 0;
  private destroyed = false;

  constructor(options?: {
    stream?: NodeJS.WriteStream;
    isTTY?: boolean;
  }) {
    const stream = options?.stream ?? process.stderr;
    this.write = (data: string) => stream.write(data);
    this.isTTY = options?.isTTY ?? stream.isTTY ?? false;
    this.cols = process.stdout.columns ?? 80;
    this.rows = process.stdout.rows ?? 24;

    if (this.isTTY) {
      this.resizeHandler = () => {
        this.cols = process.stdout.columns ?? 80;
        this.rows = process.stdout.rows ?? 24;
        if (this.inAltScreen) {
          this.renderAltScreen();
        }
      };
      process.stdout.on('resize', this.resizeHandler);
    }
  }

  // ── Plugin registration ─────────────────────────────────────────────────

  registerPlugin(name: string, ecosystem: string): void {
    const idx = this.plugins.length;
    this.maxNameWidth = Math.max(this.maxNameWidth, name.length);
    this.plugins.push({
      name,
      ecosystem,
      phase: 'waiting',
      current: 0,
      total: 0,
      logs: [],
      manifestCount: 0,
    });
    this.pluginIndex.set(name, idx);
  }

  // ── State updates ───────────────────────────────────────────────────────

  updatePhase(
    pluginName: string,
    phase: PluginPhase,
    extra?: Partial<Pick<PluginState, 'current' | 'total' | 'currentDep' | 'summary' | 'manifestCount'>>,
  ): void {
    const idx = this.pluginIndex.get(pluginName);
    if (idx === undefined) return;
    const state = this.plugins[idx];
    state.phase = phase;
    if (extra) {
      if (extra.current !== undefined) state.current = extra.current;
      if (extra.total !== undefined) state.total = extra.total;
      if (extra.currentDep !== undefined) state.currentDep = extra.currentDep;
      if (extra.summary !== undefined) state.summary = extra.summary;
      if (extra.manifestCount !== undefined) state.manifestCount = extra.manifestCount;
    }
    if (!this.inAltScreen) {
      this.render();
    }
  }

  appendLogs(pluginName: string, logs: LogEntry[]): void {
    const idx = this.pluginIndex.get(pluginName);
    if (idx === undefined) return;
    this.plugins[idx].logs.push(...logs);
    if (this.inAltScreen && this.altScreenPlugin === idx) {
      this.renderAltScreen();
    }
  }

  // ── Keyboard input ──────────────────────────────────────────────────────

  startInteractive(logPoller?: () => Promise<void>): void {
    if (!this.isTTY || !process.stdin.isTTY) return;
    this.logPoller = logPoller ?? null;

    this.write(ansi.hideCursor);

    this.rawModeWasEnabled = process.stdin.isRaw ?? false;
    process.stdin.setRawMode(true);
    process.stdin.resume();

    this.keyHandler = (data: Buffer) => {
      this.handleKey(data);
    };
    process.stdin.on('data', this.keyHandler);

    // Safety net: ensure terminal is restored on SIGINT even if raw mode
    // swallows Ctrl+C before our key handler fires
    this.sigintHandler = () => {
      this.destroy();
      process.exit(130);
    };
    process.on('SIGINT', this.sigintHandler);

    // Poll worker logs periodically
    if (this.logPoller) {
      this.logPollTimer = setInterval(() => {
        this.logPoller?.().catch((_e: unknown) => { /* log poll failure is non-fatal */ });
      }, 500);
    }
  }

  private handleKey(data: Buffer): void {
    const key = data.toString();

    if (this.inAltScreen) {
      // In alt screen: q/Escape exits, arrow keys scroll
      if (key === 'q' || key === '\x1b\x1b') {
        // Only double-Escape exits (bare \x1b is ambiguous — could be
        // the start of an arrow key sequence over slow connections)
        this.leaveAltScreen();
      } else if (key === '\x1b[A') {
        // Up arrow
        this.altScrollOffset = Math.max(0, this.altScrollOffset - 1);
        this.renderAltScreen();
      } else if (key === '\x1b[B') {
        // Down arrow
        this.altScrollOffset += 1;
        this.renderAltScreen();
      } else if (key === '\x1b[5~') {
        // Page up
        this.altScrollOffset = Math.max(0, this.altScrollOffset - (this.rows - 4));
        this.renderAltScreen();
      } else if (key === '\x1b[6~') {
        // Page down
        this.altScrollOffset += this.rows - 4;
        this.renderAltScreen();
      }
      return;
    }

    // Main screen: number keys open alt screen for plugin N
    const num = parseInt(key, 10);
    if (num >= 1 && num <= this.plugins.length) {
      this.enterAltScreen(num - 1);
      return;
    }

    // Ctrl+C
    if (key === '\x03') {
      this.destroy();
      process.exit(130);
    }
  }

  // ── Alt screen ──────────────────────────────────────────────────────────

  private enterAltScreen(pluginIdx: number): void {
    this.inAltScreen = true;
    this.altScreenPlugin = pluginIdx;
    this.altScrollOffset = 0;
    this.write(ansi.altScreenEnter);
    this.write(ansi.hideCursor);
    // Auto-scroll to bottom
    const plugin = this.plugins[pluginIdx];
    const totalLines = this.getLogLines(plugin).length;
    const viewportHeight = this.rows - 4; // header + footer
    this.altScrollOffset = Math.max(0, totalLines - viewportHeight);
    this.renderAltScreen();
  }

  private leaveAltScreen(): void {
    this.write(ansi.altScreenLeave);
    this.write(ansi.hideCursor);
    this.inAltScreen = false;
    this.altScreenPlugin = null;
    // Don't reset linesRendered — the alt screen leave restores the cursor
    // to where it was before entering, so the original progress lines are
    // still on screen. render() needs the correct count to cursor-up and
    // overwrite them in place.
    this.render();
  }

  private getLogLines(plugin: PluginState): string[] {
    const lines: string[] = [];
    for (const entry of plugin.logs) {
      const entryLines = entry.data.split('\n');
      for (const line of entryLines) {
        if (line.length > 0) {
          const prefix =
            entry.stream === 'stderr' ? ansi.red('err') : ansi.dim('out');
          lines.push(`${prefix} ${line}`);
        }
      }
    }
    return lines;
  }

  private renderAltScreen(): void {
    if (this.altScreenPlugin === null) return;
    const plugin = this.plugins[this.altScreenPlugin];
    const logLines = this.getLogLines(plugin);
    const viewportHeight = this.rows - 4;

    // Clamp scroll offset
    const maxOffset = Math.max(0, logLines.length - viewportHeight);
    this.altScrollOffset = Math.min(this.altScrollOffset, maxOffset);

    const visibleLines = logLines.slice(
      this.altScrollOffset,
      this.altScrollOffset + viewportHeight,
    );

    let output = ansi.clearScreen;

    // Header
    const title = ` ${ansi.bold(plugin.name)} (${plugin.ecosystem}) — Worker Output `;
    const phaseInfo = ansi.dim(` [${plugin.phase}]`);
    output += `${ansi.inverse(title)}${phaseInfo}\n`;
    output += `${ansi.dim('─'.repeat(this.cols))}\n`;

    // Log content
    for (let i = 0; i < viewportHeight; i++) {
      const line = visibleLines[i] ?? '';
      output += `${line}\n`;
    }

    // Footer
    output += `${ansi.dim('─'.repeat(this.cols))}\n`;
    const scrollInfo = logLines.length > viewportHeight
      ? ansi.dim(` lines ${this.altScrollOffset + 1}-${Math.min(this.altScrollOffset + viewportHeight, logLines.length)}/${logLines.length}`)
      : '';
    output += `${ansi.dim(' q/EscEsc: back  ↑↓: scroll  PgUp/PgDn: page')}${scrollInfo}`;

    this.write(output);
  }

  // ── Main screen rendering ───────────────────────────────────────────────

  private render(): void {
    if (!this.isTTY || this.destroyed) return;

    // Move cursor up to overwrite previous output. If stray output from
    // inherited child stdio pushed extra lines, we may undershoot — the
    // clearToScreenEnd below handles the residual garbage.
    if (this.linesRendered > 0) {
      this.write(ansi.cursorUp(this.linesRendered));
    }

    const lines: string[] = [];

    for (let i = 0; i < this.plugins.length; i++) {
      const p = this.plugins[i];
      const idx = ansi.dim(`[${i + 1}]`);
      const name = ansi.bold(p.name.padEnd(this.maxNameWidth));
      lines.push(`${idx} ${name} ${this.formatPhase(p)}`);
    }

    // Help line
    if (this.plugins.length > 0) {
      lines.push(
        ansi.dim(`    press 1-${this.plugins.length} to view worker output`),
      );
    }

    const output = lines
      .map((line) => `${ansi.clearLine}${line}`)
      .join('\n');
    // Write our lines, then clear everything below to remove any stale
    // content left by previous renders or stray child process output.
    this.write(`${output}\n${ansi.clearToScreenEnd}`);
    this.linesRendered = lines.length;
  }

  private formatPhase(p: PluginState): string {
    switch (p.phase) {
      case 'waiting':
        return ansi.dim('waiting…');
      case 'detect':
        return ansi.yellow('detecting manifests…');
      case 'parse':
        return ansi.yellow('parsing dependencies…');
      case 'fetch': {
        const barWidth = Math.min(30, this.cols - 40);
        const bar = progressBar(p.current, p.total, barWidth);
        const counter = ansi.cyan(`[${p.current}/${p.total}]`);
        const dep = p.currentDep ? ansi.dim(` ${truncate(p.currentDep, 30)}`) : '';
        return `${bar} ${counter}${dep}`;
      }
      case 'done': {
        const check = ansi.green('\u2713');
        return `${check} ${p.summary ?? 'done'}`;
      }
      case 'error':
        return ansi.red('\u2717 error');
    }
  }

  // ── Non-TTY fallback ────────────────────────────────────────────────────

  /** Simple line-by-line logging for non-TTY environments */
  logLine(message: string): void {
    if (!this.isTTY) {
      this.write(`${message}\n`);
    }
  }

  // ── Cleanup ─────────────────────────────────────────────────────────────

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;

    if (this.logPollTimer) {
      clearInterval(this.logPollTimer);
      this.logPollTimer = null;
    }

    if (this.inAltScreen) {
      this.write(ansi.altScreenLeave);
    }

    if (this.keyHandler) {
      process.stdin.removeListener('data', this.keyHandler);
      this.keyHandler = null;
    }

    if (process.stdin.isTTY) {
      process.stdin.setRawMode(this.rawModeWasEnabled);
      process.stdin.pause();
    }

    if (this.resizeHandler) {
      process.stdout.removeListener('resize', this.resizeHandler);
    }

    if (this.sigintHandler) {
      process.removeListener('SIGINT', this.sigintHandler);
      this.sigintHandler = null;
    }

    this.write(ansi.showCursor);
  }
}

// ── Utilities ───────────────────────────────────────────────────────────────

function truncate(s: string, maxLen: number): string {
  if (s.length <= maxLen) return s;
  return `${s.slice(0, maxLen - 1)}\u2026`;
}
