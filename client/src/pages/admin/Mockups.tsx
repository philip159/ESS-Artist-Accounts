import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Layers, Image as ImageIcon, Download, Loader2, Trash2, AlertCircle, CheckCircle2, ChevronDown, ChevronRight, Search, X, LinkIcon, LayoutTemplate } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Mockup, Artwork } from "@shared/schema";

interface MockupPreviewItem {
  id: string;
  filename: string;
  path: string;
  artworkName: string;
  artworkId: string;
  artworkTitle: string;
  frameType: string;
  isLifestyle: boolean;
  alreadyExists: boolean;
  existingMockupId?: string;
}

interface UnmatchedMockupItem {
  id: string;
  filename: string;
  path: string;
  parsedArtworkName: string;
  parsedArtistName: string;
  frameType: string;
  isLifestyle: boolean;
}

interface PreviewResult {
  items: MockupPreviewItem[];
  unmatchedItems: UnmatchedMockupItem[];
  errors: Array<{ filename: string; error: string }>;
}

interface GroupedMockups {
  artworkId: string;
  artworkTitle: string;
  artistName: string;
  mockups: Mockup[];
}

export default function AdminMockups() {
  const { toast } = useToast();
  const [showPreviewDialog, setShowPreviewDialog] = useState(false);
  const [previewData, setPreviewData] = useState<PreviewResult | null>(null);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [expandedArtworks, setExpandedArtworks] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedMockups, setSelectedMockups] = useState<Set<string>>(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [artworkAssignments, setArtworkAssignments] = useState<Record<string, string>>({});
  const [generatingArtworkId, setGeneratingArtworkId] = useState<string | null>(null);
  
  const { data: mockups, isLoading: mockupsLoading } = useQuery<Mockup[]>({
    queryKey: ["/api/mockups"],
  });

  const { data: artworks } = useQuery<Artwork[]>({
    queryKey: ["/api/artworks"],
  });

  // Group mockups by artwork
  const groupedMockups = useMemo(() => {
    if (!mockups || !artworks) return [];
    
    const artworkMap = new Map(artworks.map(a => [a.id, a]));
    const groups = new Map<string, GroupedMockups>();
    
    for (const mockup of mockups) {
      const artwork = artworkMap.get(mockup.artworkId);
      if (!artwork) continue;
      
      if (!groups.has(mockup.artworkId)) {
        groups.set(mockup.artworkId, {
          artworkId: mockup.artworkId,
          artworkTitle: artwork.title,
          artistName: artwork.artistName,
          mockups: [],
        });
      }
      groups.get(mockup.artworkId)!.mockups.push(mockup);
    }
    
    return Array.from(groups.values()).sort((a, b) => 
      a.artworkTitle.localeCompare(b.artworkTitle)
    );
  }, [mockups, artworks]);

  // Filter by search
  const filteredGroups = useMemo(() => {
    if (!searchQuery.trim()) return groupedMockups;
    const query = searchQuery.toLowerCase();
    return groupedMockups.filter(g => 
      g.artworkTitle.toLowerCase().includes(query) ||
      g.artistName.toLowerCase().includes(query)
    );
  }, [groupedMockups, searchQuery]);

  const previewMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/mockups/preview-from-dropbox");
      if (!response.ok) {
        throw new Error("Failed to preview mockups");
      }
      return await response.json() as PreviewResult;
    },
    onSuccess: (data) => {
      setPreviewData(data);
      const newItems = data.items.filter(item => !item.alreadyExists);
      setSelectedItems(new Set(newItems.map(item => item.id)));
      setArtworkAssignments({});
      setShowPreviewDialog(true);
    },
    onError: (error: any) => {
      toast({
        title: "Preview Failed",
        description: error.message || "Failed to preview mockups from Dropbox",
        variant: "destructive",
      });
    },
  });

  const importMutation = useMutation({
    mutationFn: async ({ paths, assignments }: { paths: string[]; assignments: Record<string, string> }) => {
      const response = await apiRequest("POST", "/api/mockups/import-selected", {
        selectedPaths: paths,
        artworkAssignments: assignments,
      });
      return await response.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/mockups"] });
      setShowPreviewDialog(false);
      setPreviewData(null);
      setSelectedItems(new Set());
      setArtworkAssignments({});
      toast({
        title: "Import Complete",
        description: `Imported ${data.success} mockups.${data.skipped > 0 ? ` ${data.skipped} skipped (duplicates).` : ''}${data.failed > 0 ? ` ${data.failed} failed.` : ''}`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Import Failed",
        description: error.message || "Failed to import mockups",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      setDeletingId(id);
      const response = await apiRequest("DELETE", `/api/mockups/${id}`);
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/mockups"] });
      toast({
        title: "Mockup Deleted",
        description: "The mockup has been removed.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Delete Failed",
        description: error.message || "Failed to delete mockup",
        variant: "destructive",
      });
    },
    onSettled: () => {
      setDeletingId(null);
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const results = await Promise.allSettled(
        ids.map(id => apiRequest("DELETE", `/api/mockups/${id}`))
      );
      const succeeded = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;
      return { succeeded, failed };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/mockups"] });
      setSelectedMockups(new Set());
      setShowDeleteConfirm(false);
      toast({
        title: "Mockups Deleted",
        description: `Deleted ${data.succeeded} mockups.${data.failed > 0 ? ` ${data.failed} failed.` : ''}`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Delete Failed",
        description: error.message || "Failed to delete mockups",
        variant: "destructive",
      });
    },
  });

  const generateTemplateMockupsMutation = useMutation({
    mutationFn: async (artworkId: string) => {
      setGeneratingArtworkId(artworkId);
      const response = await apiRequest("POST", `/api/admin/artworks/${artworkId}/generate-template-mockups`);
      return await response.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/mockups"] });
      toast({
        title: "Template Mockups Generated",
        description: `${data.succeeded} template mockup${data.succeeded !== 1 ? 's' : ''} generated${data.failed > 0 ? `, ${data.failed} failed` : ''}.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Generation Failed",
        description: error.message || "Failed to generate template mockups",
        variant: "destructive",
      });
    },
    onSettled: () => {
      setGeneratingArtworkId(null);
    },
  });

  const handleToggleItem = (id: string) => {
    const newSelected = new Set(selectedItems);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedItems(newSelected);
  };

  const handleSelectAll = () => {
    if (!previewData) return;
    const newItems = previewData.items.filter(item => !item.alreadyExists);
    setSelectedItems(new Set(newItems.map(item => item.id)));
  };

  const handleDeselectAll = () => {
    setSelectedItems(new Set());
  };

  const handleImportSelected = () => {
    if (!previewData) return;
    
    // Get paths from matched items
    const matchedPaths = previewData.items
      .filter(item => selectedItems.has(item.id))
      .map(item => item.path);
    
    // Get paths from assigned unmatched items
    const assignedPaths = Object.keys(artworkAssignments);
    
    // Combine all paths
    const pathsToImport = [...matchedPaths, ...assignedPaths];
    
    if (pathsToImport.length === 0) {
      toast({
        title: "Nothing Selected",
        description: "Please select at least one mockup to import.",
        variant: "destructive",
      });
      return;
    }
    
    importMutation.mutate({ paths: pathsToImport, assignments: artworkAssignments });
  };

  const toggleArtworkExpanded = (artworkId: string) => {
    const newExpanded = new Set(expandedArtworks);
    if (newExpanded.has(artworkId)) {
      newExpanded.delete(artworkId);
    } else {
      newExpanded.add(artworkId);
    }
    setExpandedArtworks(newExpanded);
  };

  const expandAll = () => {
    setExpandedArtworks(new Set(filteredGroups.map(g => g.artworkId)));
  };

  const collapseAll = () => {
    setExpandedArtworks(new Set());
  };

  const toggleMockupSelection = (mockupId: string) => {
    const newSelected = new Set(selectedMockups);
    if (newSelected.has(mockupId)) {
      newSelected.delete(mockupId);
    } else {
      newSelected.add(mockupId);
    }
    setSelectedMockups(newSelected);
  };

  const selectAllInGroup = (artworkId: string) => {
    const group = groupedMockups.find(g => g.artworkId === artworkId);
    if (!group) return;
    const newSelected = new Set(selectedMockups);
    group.mockups.forEach(m => newSelected.add(m.id));
    setSelectedMockups(newSelected);
  };

  const deselectAllInGroup = (artworkId: string) => {
    const group = groupedMockups.find(g => g.artworkId === artworkId);
    if (!group) return;
    const newSelected = new Set(selectedMockups);
    group.mockups.forEach(m => newSelected.delete(m.id));
    setSelectedMockups(newSelected);
  };

  const newItemsCount = previewData?.items.filter(item => !item.alreadyExists).length || 0;
  const duplicatesCount = previewData?.items.filter(item => item.alreadyExists).length || 0;
  const unmatchedCount = previewData?.unmatchedItems?.length || 0;
  const assignedCount = Object.keys(artworkAssignments).length;
  const totalToImport = selectedItems.size + assignedCount;
  const totalMockups = mockups?.length || 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold font-display">Mockups</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {totalMockups} mockups across {groupedMockups.length} artworks
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          {selectedMockups.size > 0 && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setShowDeleteConfirm(true)}
              data-testid="button-bulk-delete"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete {selectedMockups.size} Selected
            </Button>
          )}
          <Button
            onClick={() => previewMutation.mutate()}
            disabled={previewMutation.isPending}
            size="sm"
            data-testid="button-import-dropbox"
          >
            {previewMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Scanning...
              </>
            ) : (
              <>
                <Download className="w-4 h-4 mr-2" />
                Import from Dropbox
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Search and controls */}
      {groupedMockups.length > 0 && (
        <div className="flex items-center gap-4 flex-wrap">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search artworks..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9"
              data-testid="input-search-mockups"
            />
            {searchQuery && (
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                onClick={() => setSearchQuery("")}
              >
                <X className="w-4 h-4" />
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={expandAll}>
              Expand All
            </Button>
            <Button variant="outline" size="sm" onClick={collapseAll}>
              Collapse All
            </Button>
          </div>
        </div>
      )}

      {/* Mockups grouped by artwork */}
      {mockupsLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <Skeleton className="w-1/3 h-6 mb-4" />
                <div className="grid grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
                  {[1, 2, 3, 4].map((j) => (
                    <Skeleton key={j} className="aspect-[3/4] rounded" />
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filteredGroups.length > 0 ? (
        <div className="space-y-3">
          {filteredGroups.map((group) => {
            const isExpanded = expandedArtworks.has(group.artworkId);
            const selectedInGroup = group.mockups.filter(m => selectedMockups.has(m.id)).length;
            
            return (
              <Collapsible
                key={group.artworkId}
                open={isExpanded}
                onOpenChange={() => toggleArtworkExpanded(group.artworkId)}
              >
                <Card className="overflow-hidden">
                  <CollapsibleTrigger asChild>
                    <CardHeader className="py-3 px-4 cursor-pointer hover:bg-muted/50 transition-colors">
                      <div className="flex items-center gap-3">
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <CardTitle className="text-sm font-medium truncate">
                            {group.artworkTitle}
                          </CardTitle>
                          <p className="text-xs text-muted-foreground">
                            by {group.artistName}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {selectedInGroup > 0 && (
                            <Badge variant="secondary" className="text-xs">
                              {selectedInGroup} selected
                            </Badge>
                          )}
                          <Badge variant="outline" className="text-xs">
                            {group.mockups.length} mockup{group.mockups.length !== 1 ? 's' : ''}
                          </Badge>
                        </div>
                      </div>
                    </CardHeader>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <CardContent className="pt-0 pb-4 px-4">
                      {/* Selection controls for this group */}
                      <div className="flex items-center gap-2 mb-3 pb-3 border-b flex-wrap">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={(e) => { e.stopPropagation(); selectAllInGroup(group.artworkId); }}
                        >
                          Select All
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={(e) => { e.stopPropagation(); deselectAllInGroup(group.artworkId); }}
                        >
                          Deselect All
                        </Button>
                        <div className="ml-auto">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs"
                            disabled={generatingArtworkId === group.artworkId}
                            onClick={(e) => {
                              e.stopPropagation();
                              generateTemplateMockupsMutation.mutate(group.artworkId);
                            }}
                            data-testid={`button-generate-templates-${group.artworkId}`}
                          >
                            {generatingArtworkId === group.artworkId ? (
                              <>
                                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                                Generating...
                              </>
                            ) : (
                              <>
                                <LayoutTemplate className="w-3 h-3 mr-1" />
                                Generate from Templates
                              </>
                            )}
                          </Button>
                        </div>
                      </div>
                      
                      {/* Mockup grid - smaller thumbnails */}
                      <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-2">
                        {group.mockups.map((mockup) => {
                          const isSelected = selectedMockups.has(mockup.id);
                          return (
                            <div
                              key={mockup.id}
                              className={`relative group rounded-md overflow-hidden border transition-all ${
                                isSelected ? 'ring-2 ring-primary border-primary' : 'hover:border-muted-foreground/50'
                              }`}
                            >
                              {/* Selection checkbox */}
                              <div 
                                className="absolute top-1 left-1 z-10"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <Checkbox
                                  checked={isSelected}
                                  onCheckedChange={() => toggleMockupSelection(mockup.id)}
                                  className="h-4 w-4 bg-background/80 backdrop-blur-sm"
                                  data-testid={`checkbox-mockup-${mockup.id}`}
                                />
                              </div>
                              
                              {/* Delete button */}
                              <Button
                                size="icon"
                                variant="destructive"
                                className="absolute top-1 right-1 z-10 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                                onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(mockup.id); }}
                                disabled={deletingId === mockup.id}
                                data-testid={`button-delete-mockup-${mockup.id}`}
                              >
                                {deletingId === mockup.id ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <Trash2 className="w-3 h-3" />
                                )}
                              </Button>
                              
                              {/* Mockup image */}
                              <div className="aspect-[3/4] bg-muted">
                                {mockup.mockupImageUrl ? (
                                  <img
                                    src={mockup.mockupImageUrl}
                                    alt={`${mockup.frameType} mockup`}
                                    className="w-full h-full object-cover"
                                    loading="lazy"
                                    data-testid={`img-mockup-${mockup.id}`}
                                  />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center">
                                    <ImageIcon className="w-6 h-6 text-muted-foreground" />
                                  </div>
                                )}
                              </div>
                              
                              {/* Frame type label */}
                              <div className="absolute bottom-0 left-0 right-0 bg-black/60 backdrop-blur-sm px-1 py-0.5">
                                <p className="text-[10px] text-white truncate text-center">
                                  {mockup.frameType}
                                  {mockup.isLifestyle && " (L)"}
                                </p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </CollapsibleContent>
                </Card>
              </Collapsible>
            );
          })}
        </div>
      ) : mockups && mockups.length === 0 ? (
        <Card>
          <CardContent className="p-12">
            <div className="text-center space-y-4">
              <div className="flex justify-center">
                <div className="p-6 bg-muted rounded-full">
                  <Layers className="w-12 h-12 text-muted-foreground" />
                </div>
              </div>
              <div className="space-y-2">
                <h3 className="text-xl font-semibold">No mockups generated yet</h3>
                <p className="text-muted-foreground">
                  Import mockups from Dropbox to get started
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : searchQuery ? (
        <Card>
          <CardContent className="p-8 text-center">
            <p className="text-muted-foreground">No artworks match "{searchQuery}"</p>
          </CardContent>
        </Card>
      ) : null}

      {/* Bulk Delete Confirmation Dialog */}
      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {selectedMockups.size} Mockups?</DialogTitle>
            <DialogDescription>
              This will permanently remove the selected mockups. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowDeleteConfirm(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => bulkDeleteMutation.mutate(Array.from(selectedMockups))}
              disabled={bulkDeleteMutation.isPending}
            >
              {bulkDeleteMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>Delete {selectedMockups.size} Mockups</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import Preview Dialog */}
      <Dialog open={showPreviewDialog} onOpenChange={setShowPreviewDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Import Mockups from Dropbox</DialogTitle>
            <DialogDescription>
              Select which mockups to import. Duplicates (already imported) are shown but not selected.
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center gap-4 py-2 flex-wrap">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-green-500" />
              <span className="text-sm">{newItemsCount} new</span>
            </div>
            {duplicatesCount > 0 && (
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-yellow-500" />
                <span className="text-sm">{duplicatesCount} already exist</span>
              </div>
            )}
            {unmatchedCount > 0 && (
              <div className="flex items-center gap-2">
                <LinkIcon className="w-4 h-4 text-orange-500" />
                <span className="text-sm">{unmatchedCount} need assignment ({assignedCount} assigned)</span>
              </div>
            )}
            {previewData?.errors && previewData.errors.length > 0 && (
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-500" />
                <span className="text-sm">{previewData.errors.length} errors</span>
              </div>
            )}
          </div>

          <div className="flex gap-2 mb-2">
            <Button variant="outline" size="sm" onClick={handleSelectAll}>
              Select All New
            </Button>
            <Button variant="outline" size="sm" onClick={handleDeselectAll}>
              Deselect All
            </Button>
          </div>

          <ScrollArea className="h-[400px] border rounded-md p-4">
            <div className="space-y-3">
              {/* Unmatched items - shown at the top with artwork selection dropdown */}
              {previewData?.unmatchedItems && previewData.unmatchedItems.length > 0 && (
                <>
                  <div className="text-sm font-medium text-orange-600 pb-2 border-b">
                    Unmatched Mockups - Select artwork to import
                  </div>
                  {previewData.unmatchedItems.map((item) => (
                    <div
                      key={item.id}
                      className={`flex items-start gap-3 p-3 rounded-lg border ${
                        artworkAssignments[item.path] ? 'bg-green-50 border-green-200' : 'bg-orange-50 border-orange-200'
                      }`}
                    >
                      <div className="flex-1 min-w-0 space-y-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium truncate">{item.parsedArtworkName}</span>
                          <Badge variant="outline" className="shrink-0">{item.frameType}</Badge>
                          {item.isLifestyle && <Badge variant="secondary" className="shrink-0">Lifestyle</Badge>}
                          <Badge variant="secondary" className="bg-orange-100 text-orange-800 shrink-0">
                            No match found
                          </Badge>
                        </div>
                        {item.parsedArtistName && (
                          <p className="text-xs text-muted-foreground">Artist: {item.parsedArtistName}</p>
                        )}
                        <p className="text-xs text-muted-foreground truncate">{item.filename}</p>
                        <Select
                          value={artworkAssignments[item.path] || ""}
                          onValueChange={(value) => {
                            if (value) {
                              setArtworkAssignments(prev => ({ ...prev, [item.path]: value }));
                            } else {
                              setArtworkAssignments(prev => {
                                const next = { ...prev };
                                delete next[item.path];
                                return next;
                              });
                            }
                          }}
                        >
                          <SelectTrigger className="w-full" data-testid={`select-artwork-${item.id}`}>
                            <SelectValue placeholder="Select artwork to assign..." />
                          </SelectTrigger>
                          <SelectContent>
                            {artworks?.map(artwork => (
                              <SelectItem key={artwork.id} value={artwork.id}>
                                {artwork.title} - {artwork.artistName}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  ))}
                  {previewData.items.length > 0 && (
                    <div className="text-sm font-medium text-green-600 pt-2 pb-2 border-b border-t mt-4">
                      Matched Mockups
                    </div>
                  )}
                </>
              )}
              
              {/* Matched items */}
              {previewData?.items && previewData.items.length > 0 ? (
                previewData.items.map((item) => (
                  <div
                    key={item.id}
                    className={`flex items-start gap-3 p-3 rounded-lg border ${
                      item.alreadyExists ? 'bg-muted/50 opacity-60' : 'bg-background'
                    }`}
                  >
                    <Checkbox
                      checked={selectedItems.has(item.id)}
                      onCheckedChange={() => handleToggleItem(item.id)}
                      disabled={item.alreadyExists}
                      data-testid={`checkbox-preview-${item.id}`}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium truncate">{item.artworkTitle}</span>
                        <Badge variant="outline" className="shrink-0">{item.frameType}</Badge>
                        {item.isLifestyle && <Badge variant="secondary" className="shrink-0">Lifestyle</Badge>}
                        {item.alreadyExists && (
                          <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 shrink-0">
                            Already exists
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate mt-1">{item.filename}</p>
                    </div>
                  </div>
                ))
              ) : previewData?.unmatchedItems?.length === 0 && previewData?.errors && previewData.errors.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground mb-4">No valid mockups found. Errors:</p>
                  {previewData.errors.map((error, i) => (
                    <div key={i} className="text-sm text-red-600">
                      {error.filename}: {error.error}
                    </div>
                  ))}
                </div>
              ) : previewData?.unmatchedItems?.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">No mockups found in Dropbox</p>
              ) : null}
            </div>
          </ScrollArea>

          {previewData?.errors && previewData.errors.length > 0 && previewData.items.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                View {previewData.errors.length} errors
              </summary>
              <div className="mt-2 p-2 bg-muted rounded space-y-1 max-h-32 overflow-auto">
                {previewData.errors.map((error, i) => (
                  <div key={i} className="text-xs text-red-600">
                    {error.filename}: {error.error}
                  </div>
                ))}
              </div>
            </details>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowPreviewDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleImportSelected}
              disabled={importMutation.isPending || totalToImport === 0}
              data-testid="button-confirm-import"
            >
              {importMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Importing...
                </>
              ) : (
                <>Import {totalToImport} Mockups</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
