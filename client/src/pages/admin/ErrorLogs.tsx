import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { RefreshCw, Trash2, AlertTriangle, Clock, Server, ChevronDown, ChevronUp, Cpu, HardDrive, Activity } from "lucide-react";

interface ErrorLogEntry {
  timestamp: string;
  endpoint: string;
  method: string;
  errorType: string;
  message: string;
  stack?: string;
  requestBody?: any;
  userAgent?: string;
  ip?: string;
}

interface ErrorStats {
  total: number;
  byEndpoint: Record<string, number>;
  byType: Record<string, number>;
  last24h: number;
}

interface PerformanceSnapshot {
  timestamp: string;
  memory: {
    heapUsedMB: number;
    heapTotalMB: number;
    rssMB: number;
  };
  cpu: {
    percentUsed: number;
  };
  system: {
    freeMemoryMB: number;
    totalMemoryMB: number;
    memoryUsagePercent: number;
    loadAverage: number[];
  };
  process: {
    uptime: number;
  };
}

interface PerformanceStats {
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
}

export default function ErrorLogs() {
  const { toast } = useToast();
  const [expandedErrors, setExpandedErrors] = useState<Set<number>>(new Set());

  const { data: logsData, isLoading: logsLoading, refetch: refetchLogs } = useQuery<{ errors: ErrorLogEntry[] }>({
    queryKey: ["/api/admin/error-logs"],
  });

  const { data: statsData, isLoading: statsLoading, refetch: refetchStats } = useQuery<ErrorStats>({
    queryKey: ["/api/admin/error-stats"],
  });

  const { data: perfData, isLoading: perfLoading, refetch: refetchPerf } = useQuery<PerformanceStats>({
    queryKey: ["/api/admin/performance"],
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const clearLogsMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", "/api/admin/error-logs"),
    onSuccess: () => {
      toast({ title: "Logs cleared", description: "All error logs have been cleared" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/error-logs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/error-stats"] });
    },
    onError: () => {
      toast({ title: "Failed to clear logs", variant: "destructive" });
    },
  });

  const toggleExpanded = (index: number) => {
    setExpandedErrors(prev => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const refreshAll = () => {
    refetchLogs();
    refetchStats();
    refetchPerf();
  };

  const formatUptime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${mins}m`;
  };

  const getMemoryColor = (percent: number) => {
    if (percent > 80) return "text-red-600";
    if (percent > 60) return "text-yellow-600";
    return "text-green-600";
  };

  const formatTimestamp = (ts: string) => {
    const date = new Date(ts);
    return date.toLocaleString();
  };

  const getMethodColor = (method: string) => {
    switch (method) {
      case "GET": return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200";
      case "POST": return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
      case "PUT":
      case "PATCH": return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200";
      case "DELETE": return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
      default: return "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200";
    }
  };

  const errors = logsData?.errors || [];
  const stats = statsData;

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold font-display">System Monitoring</h1>
          <p className="text-muted-foreground mt-2">
            View error logs and performance metrics
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={refreshAll} data-testid="button-refresh">
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
          <Button 
            variant="destructive" 
            onClick={() => clearLogsMutation.mutate()}
            disabled={clearLogsMutation.isPending || errors.length === 0}
            data-testid="button-clear-logs"
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Clear Logs
          </Button>
        </div>
      </div>

      {(logsLoading || statsLoading || perfLoading) ? (
        <div className="text-center py-12 text-muted-foreground">Loading system data...</div>
      ) : (
        <>
          {/* Performance Overview Cards */}
          <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
            <Card data-testid="card-memory">
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Memory (Heap)</CardTitle>
                <HardDrive className="w-4 h-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{perfData?.current?.memory?.heapUsedMB || 0} MB</div>
                <p className="text-xs text-muted-foreground">
                  of {perfData?.current?.memory?.heapTotalMB || 0} MB
                </p>
              </CardContent>
            </Card>

            <Card data-testid="card-rss">
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">RSS Memory</CardTitle>
                <HardDrive className="w-4 h-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{perfData?.current?.memory?.rssMB || 0} MB</div>
                <p className="text-xs text-muted-foreground">
                  Peak: {perfData?.peak?.maxRssMB || 0} MB
                </p>
              </CardContent>
            </Card>

            <Card data-testid="card-cpu">
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">CPU Usage</CardTitle>
                <Cpu className="w-4 h-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{perfData?.current?.cpu?.percentUsed || 0}%</div>
                <p className="text-xs text-muted-foreground">
                  Peak: {perfData?.peak?.maxCpuPercent || 0}%
                </p>
              </CardContent>
            </Card>

            <Card data-testid="card-system-mem">
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">System Memory</CardTitle>
                <Activity className="w-4 h-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${getMemoryColor(perfData?.current?.system?.memoryUsagePercent || 0)}`}>
                  {perfData?.current?.system?.memoryUsagePercent || 0}%
                </div>
                <p className="text-xs text-muted-foreground">
                  {perfData?.current?.system?.freeMemoryMB || 0} MB free
                </p>
              </CardContent>
            </Card>

            <Card data-testid="card-uptime">
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Uptime</CardTitle>
                <Clock className="w-4 h-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatUptime(perfData?.current?.process?.uptime || 0)}</div>
                <p className="text-xs text-muted-foreground">
                  {perfData?.snapshotCount || 0} snapshots
                </p>
              </CardContent>
            </Card>

            <Card data-testid="card-total-errors">
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Errors (24h)</CardTitle>
                <AlertTriangle className="w-4 h-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${(stats?.last24h || 0) > 0 ? 'text-red-600' : 'text-green-600'}`}>
                  {stats?.last24h || 0}
                </div>
                <p className="text-xs text-muted-foreground">
                  Total: {stats?.total || 0}
                </p>
              </CardContent>
            </Card>
          </div>

          {stats && Object.keys(stats.byEndpoint).length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Errors by Endpoint</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(stats.byEndpoint)
                    .sort((a, b) => b[1] - a[1])
                    .map(([endpoint, count]) => (
                      <Badge key={endpoint} variant="outline" className="text-sm">
                        {endpoint}: {count}
                      </Badge>
                    ))}
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Recent Errors ({errors.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {errors.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No errors logged. That's good!
                </div>
              ) : (
                <div className="space-y-3">
                  {errors.map((error, index) => (
                    <div 
                      key={index}
                      className="border rounded-lg p-4 space-y-2"
                      data-testid={`error-entry-${index}`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge className={getMethodColor(error.method)}>
                            {error.method}
                          </Badge>
                          <code className="text-sm bg-muted px-2 py-0.5 rounded">
                            {error.endpoint}
                          </code>
                          <Badge variant="destructive">{error.errorType}</Badge>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground whitespace-nowrap">
                            {formatTimestamp(error.timestamp)}
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleExpanded(index)}
                            data-testid={`button-expand-${index}`}
                          >
                            {expandedErrors.has(index) ? (
                              <ChevronUp className="w-4 h-4" />
                            ) : (
                              <ChevronDown className="w-4 h-4" />
                            )}
                          </Button>
                        </div>
                      </div>
                      
                      <p className="text-sm font-medium text-destructive">
                        {error.message}
                      </p>

                      {expandedErrors.has(index) && (
                        <div className="mt-3 space-y-2 text-xs">
                          {error.stack && (
                            <div>
                              <p className="font-medium text-muted-foreground mb-1">Stack Trace:</p>
                              <pre className="bg-muted p-2 rounded overflow-x-auto text-xs">
                                {error.stack}
                              </pre>
                            </div>
                          )}
                          {error.requestBody && (
                            <div>
                              <p className="font-medium text-muted-foreground mb-1">Request Body:</p>
                              <pre className="bg-muted p-2 rounded overflow-x-auto text-xs">
                                {JSON.stringify(error.requestBody, null, 2)}
                              </pre>
                            </div>
                          )}
                          {error.userAgent && (
                            <div>
                              <p className="font-medium text-muted-foreground mb-1">User Agent:</p>
                              <p className="text-muted-foreground">{error.userAgent}</p>
                            </div>
                          )}
                          {error.ip && (
                            <div>
                              <p className="font-medium text-muted-foreground mb-1">IP Address:</p>
                              <p className="text-muted-foreground">{error.ip}</p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
