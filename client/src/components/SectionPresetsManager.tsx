import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Plus, Edit, Trash2, Check, Circle } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { ContractSectionPreset } from "@shared/schema";

const SECTION_TYPES = [
  { value: "introduction", label: "Introduction / About The Collaboration" },
  { value: "deliverables", label: "Deliverables & Requirements" },
  { value: "payment", label: "Payment" },
  { value: "contentUsage", label: "Content Usage Permissions" },
  { value: "exclusivity", label: "Exclusivity" },
  { value: "schedule", label: "Schedule & Deadlines" },
] as const;

type SectionType = typeof SECTION_TYPES[number]["value"];

interface PresetFormState {
  id?: string;
  sectionType: SectionType;
  name: string;
  formContent: string;
  contractContent: string;
  isDefault: boolean;
  sortOrder: number;
}

const defaultPresetState: PresetFormState = {
  sectionType: "introduction",
  name: "",
  formContent: "",
  contractContent: "",
  isDefault: false,
  sortOrder: 0,
};

export default function SectionPresetsManager() {
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingPreset, setEditingPreset] = useState<PresetFormState>(defaultPresetState);
  const [isEditing, setIsEditing] = useState(false);

  const { data: presets = [], isLoading } = useQuery<ContractSectionPreset[]>({
    queryKey: ["/api/admin/contract-section-presets"],
  });

  const createMutation = useMutation({
    mutationFn: async (preset: Omit<PresetFormState, "id">) => {
      return apiRequest("POST", "/api/admin/contract-section-presets", preset);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/contract-section-presets"] });
      toast({ title: "Preset created", description: "Section preset has been created successfully." });
      handleCloseDialog();
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create preset", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...updates }: PresetFormState) => {
      return apiRequest("PATCH", `/api/admin/contract-section-presets/${id}`, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/contract-section-presets"] });
      toast({ title: "Preset updated", description: "Section preset has been updated successfully." });
      handleCloseDialog();
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update preset", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/admin/contract-section-presets/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/contract-section-presets"] });
      toast({ title: "Preset deleted", description: "Section preset has been deleted." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete preset", variant: "destructive" });
    },
  });

  const setDefaultMutation = useMutation({
    mutationFn: async ({ id, sectionType }: { id: string; sectionType: string }) => {
      return apiRequest("POST", `/api/admin/contract-section-presets/${id}/set-default`, { sectionType });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/contract-section-presets"] });
      toast({ title: "Default updated", description: "Default preset has been updated." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to set default preset", variant: "destructive" });
    },
  });

  const handleOpenCreate = () => {
    setEditingPreset(defaultPresetState);
    setIsEditing(false);
    setIsDialogOpen(true);
  };

  const handleOpenEdit = (preset: ContractSectionPreset) => {
    setEditingPreset({
      id: preset.id,
      sectionType: preset.sectionType as SectionType,
      name: preset.name,
      formContent: preset.formContent,
      contractContent: preset.contractContent,
      isDefault: preset.isDefault,
      sortOrder: preset.sortOrder,
    });
    setIsEditing(true);
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingPreset(defaultPresetState);
    setIsEditing(false);
  };

  const handleSave = () => {
    if (!editingPreset.name.trim()) {
      toast({ title: "Validation error", description: "Please enter a preset name", variant: "destructive" });
      return;
    }

    if (isEditing && editingPreset.id) {
      updateMutation.mutate(editingPreset);
    } else {
      const { id, ...createData } = editingPreset;
      createMutation.mutate(createData);
    }
  };

  const handleDelete = (preset: ContractSectionPreset) => {
    if (confirm(`Are you sure you want to delete "${preset.name}"?`)) {
      deleteMutation.mutate(preset.id);
    }
  };

  const handleSetDefault = (preset: ContractSectionPreset) => {
    setDefaultMutation.mutate({ id: preset.id, sectionType: preset.sectionType });
  };

  const presetsBySection = SECTION_TYPES.reduce((acc, section) => {
    acc[section.value] = presets.filter(p => p.sectionType === section.value);
    return acc;
  }, {} as Record<string, ContractSectionPreset[]>);

  if (isLoading) {
    return (
      <div className="p-4">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-1/3"></div>
          <div className="h-32 bg-muted rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div>
            <CardTitle>Section Presets</CardTitle>
            <CardDescription>
              Create multiple preset options for each contract section. These can be selected when generating a contract.
            </CardDescription>
          </div>
          <Button onClick={handleOpenCreate} data-testid="button-add-preset">
            <Plus className="w-4 h-4 mr-2" />
            Add Preset
          </Button>
        </CardHeader>
        <CardContent>
          <Accordion type="multiple" className="w-full">
            {SECTION_TYPES.map((section) => (
              <AccordionItem key={section.value} value={section.value}>
                <AccordionTrigger className="text-left" data-testid={`accordion-section-${section.value}`}>
                  <div className="flex items-center gap-2">
                    <span>{section.label}</span>
                    <Badge variant="secondary" className="ml-2">
                      {presetsBySection[section.value]?.length || 0} presets
                    </Badge>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  {presetsBySection[section.value]?.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-4">
                      No presets created for this section yet.
                    </p>
                  ) : (
                    <div className="space-y-3 mt-2">
                      {presetsBySection[section.value]?.map((preset) => (
                        <div
                          key={preset.id}
                          className="flex items-start justify-between p-4 border rounded-lg bg-muted/30"
                          data-testid={`preset-item-${preset.id}`}
                        >
                          <div className="flex-1 space-y-2">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{preset.name}</span>
                              {preset.isDefault && (
                                <Badge variant="default" className="bg-primary">Default</Badge>
                              )}
                            </div>
                            <div className="grid grid-cols-2 gap-4 text-sm">
                              <div>
                                <Label className="text-xs text-muted-foreground">Form View Preview:</Label>
                                <p className="text-muted-foreground line-clamp-2 mt-1">
                                  {preset.formContent.substring(0, 100)}...
                                </p>
                              </div>
                              <div>
                                <Label className="text-xs text-muted-foreground">Contract View Preview:</Label>
                                <p className="text-muted-foreground line-clamp-2 mt-1">
                                  {preset.contractContent.substring(0, 100)}...
                                </p>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 ml-4">
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => handleSetDefault(preset)}
                              disabled={preset.isDefault}
                              title={preset.isDefault ? "Already default" : "Set as default"}
                              data-testid={`button-set-default-${preset.id}`}
                            >
                              {preset.isDefault ? (
                                <Check className="w-4 h-4 text-primary" />
                              ) : (
                                <Circle className="w-4 h-4" />
                              )}
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => handleOpenEdit(preset)}
                              data-testid={`button-edit-preset-${preset.id}`}
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => handleDelete(preset)}
                              className="text-destructive hover:text-destructive"
                              data-testid={`button-delete-preset-${preset.id}`}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{isEditing ? "Edit Preset" : "Create New Preset"}</DialogTitle>
            <DialogDescription>
              Create a preset option for a contract section. Each section can have multiple presets.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Section Type</Label>
                <Select
                  value={editingPreset.sectionType}
                  onValueChange={(v) => setEditingPreset({ ...editingPreset, sectionType: v as SectionType })}
                  disabled={isEditing}
                >
                  <SelectTrigger data-testid="select-section-type">
                    <SelectValue placeholder="Select section" />
                  </SelectTrigger>
                  <SelectContent>
                    {SECTION_TYPES.map((section) => (
                      <SelectItem key={section.value} value={section.value}>
                        {section.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Preset Name</Label>
                <Input
                  value={editingPreset.name}
                  onChange={(e) => setEditingPreset({ ...editingPreset, name: e.target.value })}
                  placeholder="e.g., Full Rights (Including Paid Ads)"
                  data-testid="input-preset-name"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Sort Order (optional)</Label>
              <Input
                type="number"
                value={editingPreset.sortOrder}
                onChange={(e) => setEditingPreset({ ...editingPreset, sortOrder: parseInt(e.target.value) || 0 })}
                placeholder="0"
                className="w-32"
                data-testid="input-sort-order"
              />
              <p className="text-xs text-muted-foreground">Lower numbers appear first in dropdowns</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Badge variant="default" className="bg-blue-500">Form View</Badge>
                  <span className="text-xs text-muted-foreground">Casual language shown to creators</span>
                </div>
                <Textarea
                  value={editingPreset.formContent}
                  onChange={(e) => setEditingPreset({ ...editingPreset, formContent: e.target.value })}
                  placeholder="Enter the casual form content..."
                  className="min-h-[200px]"
                  data-testid="textarea-preset-form-content"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Badge variant="default" className="bg-amber-500">Contract View</Badge>
                  <span className="text-xs text-muted-foreground">Legal language for formal contract</span>
                </div>
                <Textarea
                  value={editingPreset.contractContent}
                  onChange={(e) => setEditingPreset({ ...editingPreset, contractContent: e.target.value })}
                  placeholder="Enter the formal contract content..."
                  className="min-h-[200px]"
                  data-testid="textarea-preset-contract-content"
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={handleCloseDialog}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={createMutation.isPending || updateMutation.isPending}
              data-testid="button-save-preset"
            >
              {createMutation.isPending || updateMutation.isPending ? "Saving..." : "Save Preset"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
