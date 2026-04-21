import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Plus, Trash2, RefreshCw, AlertCircle, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { ArSizeMapping } from "@shared/schema";

interface TestResult {
  websiteSize: string;
  parsedWidth: number | null;
  parsedHeight: number | null;
  mappedWidth: number | null;
  mappedHeight: number | null;
  source: "mapping" | "parsed" | "failed";
}

export default function SizeMapping() {
  const { toast } = useToast();
  const [newMapping, setNewMapping] = useState({
    websiteSize: "",
    widthMm: "",
    heightMm: "",
    description: "",
    matchType: "exact" as "exact" | "contains",
  });
  const [testSize, setTestSize] = useState("");
  const [testResult, setTestResult] = useState<TestResult | null>(null);

  const { data: mappings, isLoading } = useQuery<ArSizeMapping[]>({
    queryKey: ["/api/admin/ar-size-mappings"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof newMapping) => {
      return apiRequest("/api/admin/ar-size-mappings", {
        method: "POST",
        body: JSON.stringify({
          websiteSize: data.websiteSize,
          widthMm: parseInt(data.widthMm),
          heightMm: parseInt(data.heightMm),
          description: data.description || null,
          matchType: data.matchType,
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/ar-size-mappings"] });
      setNewMapping({ websiteSize: "", widthMm: "", heightMm: "", description: "", matchType: "exact" });
      toast({ title: "Size mapping created" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to create mapping", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...data }: Partial<ArSizeMapping> & { id: string }) => {
      return apiRequest(`/api/admin/ar-size-mappings/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/ar-size-mappings"] });
      toast({ title: "Size mapping updated" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update mapping", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest(`/api/admin/ar-size-mappings/${id}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/ar-size-mappings"] });
      toast({ title: "Size mapping deleted" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to delete mapping", description: error.message, variant: "destructive" });
    },
  });

  const testMutation = useMutation({
    mutationFn: async (size: string) => {
      const response = await fetch(`/api/admin/ar-size-mappings/test?size=${encodeURIComponent(size)}`);
      if (!response.ok) throw new Error("Test failed");
      return response.json();
    },
    onSuccess: (result: TestResult) => {
      setTestResult(result);
    },
    onError: () => {
      toast({ title: "Test failed", variant: "destructive" });
    },
  });

  const handleCreate = () => {
    if (!newMapping.websiteSize || !newMapping.widthMm || !newMapping.heightMm) {
      toast({ title: "Please fill in all required fields", variant: "destructive" });
      return;
    }
    createMutation.mutate(newMapping);
  };

  const commonInchSizes = [
    { size: "8x10in", width: 203, height: 254, desc: "8×10 inches" },
    { size: "11x14in", width: 279, height: 356, desc: "11×14 inches" },
    { size: "12x16in", width: 305, height: 406, desc: "12×16 inches" },
    { size: "16x20in", width: 406, height: 508, desc: "16×20 inches" },
    { size: "18x24in", width: 457, height: 610, desc: "18×24 inches" },
    { size: "20x24in", width: 508, height: 610, desc: "20×24 inches" },
    { size: "24x30in", width: 610, height: 762, desc: "24×30 inches" },
    { size: "24x36in", width: 610, height: 914, desc: "24×36 inches" },
  ];

  const addPreset = (preset: typeof commonInchSizes[0]) => {
    setNewMapping({
      websiteSize: preset.size,
      widthMm: preset.width.toString(),
      heightMm: preset.height.toString(),
      description: preset.desc,
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold" data-testid="text-page-title">AR Size Mappings</h1>
        <p className="text-muted-foreground">
          Map website size options to actual print dimensions for accurate AR frame generation.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Add New Mapping</CardTitle>
            <CardDescription>
              Define how website sizes translate to physical dimensions
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <span className="text-sm text-muted-foreground">Quick add:</span>
              {commonInchSizes.map((preset) => (
                <Badge
                  key={preset.size}
                  variant="outline"
                  className="cursor-pointer hover-elevate"
                  onClick={() => addPreset(preset)}
                  data-testid={`button-preset-${preset.size}`}
                >
                  {preset.size}
                </Badge>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label htmlFor="websiteSize">Website Size (as shown on site)</Label>
                <Input
                  id="websiteSize"
                  placeholder="e.g., 8x10in, A4, 30x40cm"
                  value={newMapping.websiteSize}
                  onChange={(e) => setNewMapping({ ...newMapping, websiteSize: e.target.value })}
                  data-testid="input-website-size"
                />
              </div>
              <div>
                <Label htmlFor="widthMm">Width (mm)</Label>
                <Input
                  id="widthMm"
                  type="number"
                  placeholder="203"
                  value={newMapping.widthMm}
                  onChange={(e) => setNewMapping({ ...newMapping, widthMm: e.target.value })}
                  data-testid="input-width-mm"
                />
              </div>
              <div>
                <Label htmlFor="heightMm">Height (mm)</Label>
                <Input
                  id="heightMm"
                  type="number"
                  placeholder="254"
                  value={newMapping.heightMm}
                  onChange={(e) => setNewMapping({ ...newMapping, heightMm: e.target.value })}
                  data-testid="input-height-mm"
                />
              </div>
              <div>
                <Label htmlFor="description">Description (optional)</Label>
                <Input
                  id="description"
                  placeholder="e.g., Standard US photo size"
                  value={newMapping.description}
                  onChange={(e) => setNewMapping({ ...newMapping, description: e.target.value })}
                  data-testid="input-description"
                />
              </div>
              <div>
                <Label htmlFor="matchType">Match Type</Label>
                <Select
                  value={newMapping.matchType}
                  onValueChange={(value: "exact" | "contains") => setNewMapping({ ...newMapping, matchType: value })}
                >
                  <SelectTrigger data-testid="select-match-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="exact">Exact Match</SelectItem>
                    <SelectItem value="contains">Contains</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Button
              onClick={handleCreate}
              disabled={createMutation.isPending}
              className="w-full"
              data-testid="button-add-mapping"
            >
              {createMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Plus className="w-4 h-4 mr-2" />
              )}
              Add Mapping
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Test Size Parsing</CardTitle>
            <CardDescription>
              Test how a size string will be interpreted
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Input
                placeholder="Enter size to test (e.g., 8x10in)"
                value={testSize}
                onChange={(e) => setTestSize(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && testMutation.mutate(testSize)}
                data-testid="input-test-size"
              />
              <Button
                onClick={() => testMutation.mutate(testSize)}
                disabled={testMutation.isPending || !testSize}
                data-testid="button-test-size"
              >
                {testMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )}
              </Button>
            </div>

            {testResult && (
              <div className="p-4 rounded-lg border bg-muted/50 space-y-2">
                <div className="flex items-center gap-2">
                  {testResult.source === "mapping" ? (
                    <CheckCircle2 className="w-5 h-5 text-green-500" />
                  ) : testResult.source === "parsed" ? (
                    <AlertCircle className="w-5 h-5 text-yellow-500" />
                  ) : (
                    <AlertCircle className="w-5 h-5 text-red-500" />
                  )}
                  <span className="font-medium">
                    {testResult.source === "mapping"
                      ? "Using saved mapping"
                      : testResult.source === "parsed"
                      ? "Parsed from size string"
                      : "Could not parse size"}
                  </span>
                </div>
                <div className="text-sm space-y-1">
                  <p>
                    <span className="text-muted-foreground">Input:</span> {testResult.websiteSize}
                  </p>
                  {testResult.source !== "failed" && (
                    <>
                      <p>
                        <span className="text-muted-foreground">Width:</span>{" "}
                        {testResult.mappedWidth || testResult.parsedWidth}mm
                      </p>
                      <p>
                        <span className="text-muted-foreground">Height:</span>{" "}
                        {testResult.mappedHeight || testResult.parsedHeight}mm
                      </p>
                    </>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Current Mappings</CardTitle>
          <CardDescription>
            {mappings?.length || 0} size mappings configured
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!mappings?.length ? (
            <div className="text-center py-8 text-muted-foreground">
              No size mappings configured. Add one above to get started.
            </div>
          ) : (
            <div className="space-y-2">
              {mappings.map((mapping) => (
                <div
                  key={mapping.id}
                  className="flex items-center justify-between p-3 rounded-lg border bg-card hover-elevate"
                  data-testid={`card-mapping-${mapping.id}`}
                >
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium">{mapping.websiteSize}</p>
                          {mapping.matchType === "contains" && (
                            <Badge variant="secondary" className="text-xs">Contains</Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {mapping.widthMm} × {mapping.heightMm}mm
                          {mapping.description && ` · ${mapping.description}`}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      <Label htmlFor={`active-${mapping.id}`} className="text-sm">
                        Active
                      </Label>
                      <Switch
                        id={`active-${mapping.id}`}
                        checked={mapping.isActive ?? true}
                        onCheckedChange={(checked) =>
                          updateMutation.mutate({ id: mapping.id, isActive: checked })
                        }
                        data-testid={`switch-active-${mapping.id}`}
                      />
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteMutation.mutate(mapping.id)}
                      disabled={deleteMutation.isPending}
                      data-testid={`button-delete-${mapping.id}`}
                    >
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Widget Built-in Mappings Reference */}
      <Card>
        <CardHeader>
          <CardTitle>Widget Built-in Mappings</CardTitle>
          <CardDescription>
            These mappings are built into the Shopify AR widget and convert size/frame names from your store to standardized values.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Size Mappings */}
            <div>
              <h3 className="font-semibold mb-3">Size Mappings (SIZE_MAP)</h3>
              <p className="text-sm text-muted-foreground mb-3">
                Maps Shopify size variant names → Standardized size values
              </p>
              <div className="max-h-96 overflow-y-auto border rounded-md">
                <table className="w-full text-sm">
                  <thead className="bg-muted sticky top-0">
                    <tr>
                      <th className="text-left p-2 font-medium">From (Shopify)</th>
                      <th className="text-left p-2 font-medium">To (AR)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {[
                      ['A5, A5 - 5.83" x 8.27"', 'A5'],
                      ['A4, A4 - 8.27" x 11.67"', 'A4'],
                      ['A3, A3 - 11.7" x 16.5"', 'A3'],
                      ['A2, A2 - 16.5" x 23.4"', 'A2'],
                      ['A1, A1 - 23.4" x 33.1"', 'A1'],
                      ['A0, A0 - 33.1" x 46.8"', 'A0'],
                      ['8, 8x12, 8" x 12"', '8x12in'],
                      ['12" x 16"', '12x16in'],
                      ['16" x 20"', '16x20in'],
                      ['18, 18x24, 18" x 24"', '18x24in'],
                      ['20" x 28"', '20x28in'],
                      ['20" x 30"', '20x30in'],
                      ['24" x 32"', '24x32in'],
                      ['24" x 36"', '24x36in'],
                      ['28, 28x40, 28" x 40"', '28x40in'],
                      ['30" x 40"', '30x40in'],
                      ['12x12, 12" x 12"', '12x12in'],
                      ['16x16, 16" x 16"', '16x16in'],
                      ['20x20, 20" x 20"', '20x20in'],
                      ['30x30, 30" x 30"', '30x30in'],
                    ].map(([from, to], i) => (
                      <tr key={i} className="hover:bg-muted/50">
                        <td className="p-2 font-mono text-xs">{from}</td>
                        <td className="p-2">
                          <Badge variant="secondary">{to}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Frame Mappings */}
            <div>
              <h3 className="font-semibold mb-3">Frame Mappings (FRAME_MAP)</h3>
              <p className="text-sm text-muted-foreground mb-3">
                Maps Shopify frame variant names → AR frame styles
              </p>
              <div className="border rounded-md">
                <table className="w-full text-sm">
                  <thead className="bg-muted">
                    <tr>
                      <th className="text-left p-2 font-medium">From (Shopify)</th>
                      <th className="text-left p-2 font-medium">To (AR)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {[
                      ['Black, Black Frame, Matte Black, Ebony', 'black'],
                      ['White, White Frame, Matte White, Ivory', 'white'],
                      ['Oak, Oak Frame, Light Oak, Honey Oak', 'oak'],
                      ['Natural, Natural Frame, Wood, Pine', 'natural'],
                      ['Ash, Ash Frame, Light Ash', 'ash'],
                      ['Unframed, No Frame', 'unframed'],
                    ].map(([from, to], i) => (
                      <tr key={i} className="hover:bg-muted/50">
                        <td className="p-2 font-mono text-xs">{from}</td>
                        <td className="p-2">
                          <Badge 
                            variant="secondary"
                            className={
                              to === 'black' ? 'bg-gray-900 text-white' :
                              to === 'white' ? 'bg-white text-black border' :
                              to === 'oak' ? 'bg-amber-200 text-amber-900' :
                              to === 'natural' ? 'bg-amber-100 text-amber-800' :
                              to === 'ash' ? 'bg-gray-200 text-gray-800' :
                              to === 'unframed' ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' :
                              ''
                            }
                          >
                            {to === 'unframed' ? '⊘ unframed (widget hidden)' : to}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              
              <div className="mt-4 p-3 bg-muted/50 rounded-md">
                <p className="text-sm text-muted-foreground">
                  <strong>Note:</strong> These mappings are built into the widget at{' '}
                  <code className="text-xs bg-muted px-1 rounded">public/shopify-ar-widget.js</code>.
                  To add custom mappings, edit the SIZE_MAP and FRAME_MAP objects in that file.
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
