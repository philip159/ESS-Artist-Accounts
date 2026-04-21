import os from "os";

// Per-tool memory tracking
interface ToolMemoryRecord {
  tool: string;
  operation: string;
  memoryBefore: number;
  memoryAfter: number;
  memoryDelta: number;
  peakMemory: number;
  timestamp: string;
  durationMs: number;
}

const toolMemoryHistory: ToolMemoryRecord[] = [];
const MAX_TOOL_RECORDS = 200;

// Track memory usage for a specific tool operation
export async function trackToolMemory<T>(
  tool: string,
  operation: string,
  fn: () => Promise<T>
): Promise<T> {
  const startTime = Date.now();
  const memBefore = process.memoryUsage();
  let peakRss = memBefore.rss;
  
  // Monitor peak memory during operation
  const peakInterval = setInterval(() => {
    const current = process.memoryUsage().rss;
    if (current > peakRss) peakRss = current;
  }, 100);
  
  try {
    const result = await fn();
    return result;
  } finally {
    clearInterval(peakInterval);
    const memAfter = process.memoryUsage();
    const durationMs = Date.now() - startTime;
    
    const record: ToolMemoryRecord = {
      tool,
      operation,
      memoryBefore: Math.round(memBefore.rss / 1024 / 1024),
      memoryAfter: Math.round(memAfter.rss / 1024 / 1024),
      memoryDelta: Math.round((memAfter.rss - memBefore.rss) / 1024 / 1024),
      peakMemory: Math.round(peakRss / 1024 / 1024),
      timestamp: new Date().toISOString(),
      durationMs,
    };
    
    toolMemoryHistory.push(record);
    while (toolMemoryHistory.length > MAX_TOOL_RECORDS) {
      toolMemoryHistory.shift();
    }
    
    // Log significant memory usage
    if (record.memoryDelta > 50) {
      console.log(`[Memory] ${tool}/${operation}: +${record.memoryDelta}MB (peak: ${record.peakMemory}MB) in ${durationMs}ms`);
    }
  }
}

export function getToolMemoryStats(): {
  recentOperations: ToolMemoryRecord[];
  byTool: Record<string, { count: number; totalDelta: number; avgDelta: number; maxPeak: number }>;
} {
  const byTool: Record<string, { count: number; totalDelta: number; avgDelta: number; maxPeak: number }> = {};
  
  for (const record of toolMemoryHistory) {
    if (!byTool[record.tool]) {
      byTool[record.tool] = { count: 0, totalDelta: 0, avgDelta: 0, maxPeak: 0 };
    }
    byTool[record.tool].count++;
    byTool[record.tool].totalDelta += record.memoryDelta;
    byTool[record.tool].maxPeak = Math.max(byTool[record.tool].maxPeak, record.peakMemory);
  }
  
  // Calculate averages
  for (const tool of Object.keys(byTool)) {
    byTool[tool].avgDelta = Math.round(byTool[tool].totalDelta / byTool[tool].count);
  }
  
  return {
    recentOperations: toolMemoryHistory.slice(-20),
    byTool,
  };
}

export function clearToolMemoryHistory(): void {
  toolMemoryHistory.length = 0;
}

export interface PerformanceSnapshot {
  timestamp: string;
  memory: {
    heapUsed: number;
    heapTotal: number;
    external: number;
    rss: number;
    heapUsedMB: number;
    heapTotalMB: number;
    rssMB: number;
  };
  cpu: {
    user: number;
    system: number;
    percentUsed: number;
  };
  system: {
    freeMemory: number;
    totalMemory: number;
    freeMemoryMB: number;
    totalMemoryMB: number;
    memoryUsagePercent: number;
    loadAverage: number[];
    uptime: number;
  };
  process: {
    uptime: number;
    pid: number;
  };
}

const snapshots: PerformanceSnapshot[] = [];
const MAX_SNAPSHOTS = 1000; // Keep last 1000 snapshots (roughly 16+ hours at 1min intervals)
let lastCpuUsage = process.cpuUsage();
let lastCpuTime = Date.now();
let monitoringInterval: NodeJS.Timeout | null = null;

function takeSnapshot(): PerformanceSnapshot {
  const memUsage = process.memoryUsage();
  const currentCpuUsage = process.cpuUsage(lastCpuUsage);
  const currentTime = Date.now();
  const elapsedMs = currentTime - lastCpuTime;
  
  // Calculate CPU percentage (user + system time as percentage of elapsed time)
  const cpuPercent = elapsedMs > 0 
    ? ((currentCpuUsage.user + currentCpuUsage.system) / 1000 / elapsedMs) * 100 
    : 0;
  
  lastCpuUsage = process.cpuUsage();
  lastCpuTime = currentTime;

  const snapshot: PerformanceSnapshot = {
    timestamp: new Date().toISOString(),
    memory: {
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
      external: memUsage.external,
      rss: memUsage.rss,
      heapUsedMB: Math.round(memUsage.heapUsed / 1024 / 1024 * 10) / 10,
      heapTotalMB: Math.round(memUsage.heapTotal / 1024 / 1024 * 10) / 10,
      rssMB: Math.round(memUsage.rss / 1024 / 1024 * 10) / 10,
    },
    cpu: {
      user: currentCpuUsage.user,
      system: currentCpuUsage.system,
      percentUsed: Math.round(cpuPercent * 10) / 10,
    },
    system: {
      freeMemory: os.freemem(),
      totalMemory: os.totalmem(),
      freeMemoryMB: Math.round(os.freemem() / 1024 / 1024),
      totalMemoryMB: Math.round(os.totalmem() / 1024 / 1024),
      memoryUsagePercent: Math.round((1 - os.freemem() / os.totalmem()) * 100 * 10) / 10,
      loadAverage: os.loadavg(),
      uptime: os.uptime(),
    },
    process: {
      uptime: process.uptime(),
      pid: process.pid,
    },
  };

  return snapshot;
}

export function recordSnapshot(): PerformanceSnapshot {
  const snapshot = takeSnapshot();
  snapshots.push(snapshot);
  
  // Keep only the last MAX_SNAPSHOTS
  while (snapshots.length > MAX_SNAPSHOTS) {
    snapshots.shift();
  }
  
  // Log warning if memory is getting high
  if (snapshot.memory.rssMB > 400) {
    console.warn(`[Performance] High memory usage: ${snapshot.memory.rssMB}MB RSS`);
  }
  
  return snapshot;
}

export function getCurrentMetrics(): PerformanceSnapshot {
  return takeSnapshot();
}

export function getRecentSnapshots(limit: number = 60): PerformanceSnapshot[] {
  return snapshots.slice(-limit);
}

export function getAllSnapshots(): PerformanceSnapshot[] {
  return [...snapshots];
}

export function getPerformanceStats(): {
  current: PerformanceSnapshot;
  peak: {
    maxHeapMB: number;
    maxRssMB: number;
    maxCpuPercent: number;
    maxSystemMemoryPercent: number;
  };
  average: {
    avgHeapMB: number;
    avgRssMB: number;
    avgCpuPercent: number;
  };
  snapshotCount: number;
  monitoringStarted: string | null;
} {
  const current = takeSnapshot();
  
  let maxHeapMB = 0;
  let maxRssMB = 0;
  let maxCpuPercent = 0;
  let maxSystemMemoryPercent = 0;
  let totalHeapMB = 0;
  let totalRssMB = 0;
  let totalCpuPercent = 0;
  
  for (const snap of snapshots) {
    maxHeapMB = Math.max(maxHeapMB, snap.memory.heapUsedMB);
    maxRssMB = Math.max(maxRssMB, snap.memory.rssMB);
    maxCpuPercent = Math.max(maxCpuPercent, snap.cpu.percentUsed);
    maxSystemMemoryPercent = Math.max(maxSystemMemoryPercent, snap.system.memoryUsagePercent);
    totalHeapMB += snap.memory.heapUsedMB;
    totalRssMB += snap.memory.rssMB;
    totalCpuPercent += snap.cpu.percentUsed;
  }
  
  const count = snapshots.length || 1;
  
  return {
    current,
    peak: {
      maxHeapMB: Math.round(maxHeapMB * 10) / 10,
      maxRssMB: Math.round(maxRssMB * 10) / 10,
      maxCpuPercent: Math.round(maxCpuPercent * 10) / 10,
      maxSystemMemoryPercent: Math.round(maxSystemMemoryPercent * 10) / 10,
    },
    average: {
      avgHeapMB: Math.round((totalHeapMB / count) * 10) / 10,
      avgRssMB: Math.round((totalRssMB / count) * 10) / 10,
      avgCpuPercent: Math.round((totalCpuPercent / count) * 10) / 10,
    },
    snapshotCount: snapshots.length,
    monitoringStarted: snapshots.length > 0 ? snapshots[0].timestamp : null,
  };
}

export function clearSnapshots(): void {
  snapshots.length = 0;
}

export function startMonitoring(intervalMs: number = 60000): void {
  if (monitoringInterval) {
    console.log("[Performance] Monitoring already running");
    return;
  }
  
  // Take initial snapshot
  recordSnapshot();
  
  // Record snapshots at regular intervals
  monitoringInterval = setInterval(() => {
    recordSnapshot();
  }, intervalMs);
  
  console.log(`[Performance] Monitoring started (interval: ${intervalMs / 1000}s)`);
}

export function stopMonitoring(): void {
  if (monitoringInterval) {
    clearInterval(monitoringInterval);
    monitoringInterval = null;
    console.log("[Performance] Monitoring stopped");
  }
}
