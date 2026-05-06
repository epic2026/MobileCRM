import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useCustomFields, CustomFieldType, CustomFieldDefinition } from '@/hooks/useCustomFields';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Plus, Trash2, GripVertical, ChevronUp, ChevronDown, Sliders } from 'lucide-react';

const FIELD_TYPES: { value: CustomFieldType; label: string }[] = [
  { value: 'text',     label: 'Text' },
  { value: 'textarea', label: 'Text Area' },
  { value: 'number',   label: 'Number' },
  { value: 'date',     label: 'Date' },
  { value: 'select',   label: 'Dropdown' },
  { value: 'checkbox', label: 'Checkbox (Yes/No)' },
];

const TYPE_BADGE: Record<CustomFieldType, string> = {
  text:     'bg-blue-100 text-blue-700',
  textarea: 'bg-blue-100 text-blue-700',
  number:   'bg-emerald-100 text-emerald-700',
  date:     'bg-orange-100 text-orange-700',
  select:   'bg-violet-100 text-violet-700',
  checkbox: 'bg-pink-100 text-pink-700',
};

const labelToKey = (label: string) =>
  label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'field';

const EMPTY = {
  field_label:  '',
  field_key:    '',
  field_type:   'text' as CustomFieldType,
  options_text: '',
  required:     false,
};

const CustomFieldsManager = () => {
  const { toast } = useToast();
  const { fields, isLoading, createField, updateField, deleteField } = useCustomFields('lead');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [keyEdited, setKeyEdited] = useState(false);

  const setLabel = (label: string) =>
    setForm((p) => ({ ...p, field_label: label, field_key: keyEdited ? p.field_key : labelToKey(label) }));

  const handleSubmit = async () => {
    if (!form.field_label.trim() || !form.field_key.trim()) {
      toast({ title: 'Label and key are required.', variant: 'destructive' });
      return;
    }
    const options =
      form.field_type === 'select'
        ? form.options_text.split(',').map((o) => o.trim()).filter(Boolean)
        : [];
    try {
      await createField.mutateAsync({
        field_label: form.field_label.trim(),
        field_key:   form.field_key.trim(),
        field_type:  form.field_type,
        options,
        required:    form.required,
        position:    fields.length,
      });
      toast({ title: 'Field added', description: `"${form.field_label}" is now on all lead forms.` });
      setForm(EMPTY);
      setKeyEdited(false);
      setShowForm(false);
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
  };

  const handleDelete = async (field: CustomFieldDefinition) => {
    if (!confirm(`Delete "${field.field_label}"? Existing values on leads will be lost.`)) return;
    try {
      await deleteField.mutateAsync(field.id);
      toast({ title: 'Field deleted' });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
  };

  const sorted = [...fields].sort((a, b) => a.position - b.position);

  const handleMove = async (field: CustomFieldDefinition, dir: 'up' | 'down') => {
    const idx = sorted.findIndex((f) => f.id === field.id);
    const swapIdx = dir === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;
    const a = sorted[idx];
    const b = sorted[swapIdx];
    try {
      await Promise.all([
        updateField.mutateAsync({ id: a.id, position: b.position }),
        updateField.mutateAsync({ id: b.id, position: a.position }),
      ]);
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
  };

  return (
    <Card className="border-border/80 shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between border-b bg-muted/20">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <Sliders className="h-4 w-4" />
            Custom Fields
          </CardTitle>
          <CardDescription className="mt-0.5">
            Define extra fields that appear on every lead card and the sales mobile app.
          </CardDescription>
        </div>
        <Button size="sm" onClick={() => setShowForm((v) => !v)}>
          <Plus className="mr-1 h-4 w-4" />
          Add Field
        </Button>
      </CardHeader>

      <CardContent className="pt-5 space-y-5">
        {/* Add-field form */}
        <AnimatePresence>
          {showForm && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="rounded-xl border border-dashed border-primary/40 bg-primary/5 p-5 space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Field Label <span className="text-destructive">*</span></Label>
                    <Input
                      placeholder="e.g. GSTIN Number"
                      value={form.field_label}
                      onChange={(e) => setLabel(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Field Key</Label>
                    <Input
                      placeholder="e.g. gstin_number"
                      value={form.field_key}
                      onChange={(e) => { setKeyEdited(true); setForm((p) => ({ ...p, field_key: e.target.value })); }}
                    />
                    <p className="text-[11px] text-muted-foreground">Auto-generated · used as data key</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Field Type <span className="text-destructive">*</span></Label>
                    <Select
                      value={form.field_type}
                      onValueChange={(v) => setForm((p) => ({ ...p, field_type: v as CustomFieldType }))}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {FIELD_TYPES.map((t) => (
                          <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {form.field_type === 'select' && (
                    <div className="space-y-1.5">
                      <Label>Options</Label>
                      <Input
                        placeholder="Option A, Option B, Option C"
                        value={form.options_text}
                        onChange={(e) => setForm((p) => ({ ...p, options_text: e.target.value }))}
                      />
                      <p className="text-[11px] text-muted-foreground">Comma-separated</p>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <Switch
                    id="cf-required"
                    checked={form.required}
                    onCheckedChange={(v) => setForm((p) => ({ ...p, required: v }))}
                  />
                  <Label htmlFor="cf-required" className="text-sm cursor-pointer">
                    Required field
                  </Label>
                </div>

                <div className="flex gap-2">
                  <Button size="sm" onClick={handleSubmit} disabled={createField.isPending}>
                    {createField.isPending ? 'Adding…' : 'Add Field'}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => { setShowForm(false); setForm(EMPTY); setKeyEdited(false); }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Field list */}
        {isLoading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">Loading fields…</div>
        ) : sorted.length === 0 ? (
          <div className="py-10 text-center">
            <Sliders className="mx-auto mb-3 h-8 w-8 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">No custom fields yet.</p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              Add fields to capture extra info on every lead — visible to your whole sales team.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border rounded-xl border overflow-hidden">
            {sorted.map((field, idx) => (
              <div key={field.id} className="flex items-center gap-3 px-4 py-3 bg-card hover:bg-muted/20 transition-colors">
                <GripVertical className="h-4 w-4 text-muted-foreground/30 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium">{field.field_label}</span>
                    <Badge
                      variant="secondary"
                      className={`text-[10px] px-1.5 py-0 h-4 ${TYPE_BADGE[field.field_type]}`}
                    >
                      {FIELD_TYPES.find((t) => t.value === field.field_type)?.label ?? field.field_type}
                    </Badge>
                    {field.required && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">Required</Badge>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    key: <span className="font-mono">{field.field_key}</span>
                    {field.field_type === 'select' && field.options.length > 0 &&
                      ` · ${field.options.join(', ')}`}
                  </p>
                </div>
                <div className="flex items-center gap-0.5 flex-shrink-0">
                  <button
                    onClick={() => handleMove(field, 'up')}
                    disabled={idx === 0 || updateField.isPending}
                    className="h-7 w-7 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary disabled:opacity-20 transition-colors"
                  >
                    <ChevronUp className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleMove(field, 'down')}
                    disabled={idx === sorted.length - 1 || updateField.isPending}
                    className="h-7 w-7 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary disabled:opacity-20 transition-colors"
                  >
                    <ChevronDown className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(field)}
                    disabled={deleteField.isPending}
                    className="h-7 w-7 rounded flex items-center justify-center text-destructive/60 hover:text-destructive hover:bg-destructive/10 disabled:opacity-20 transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default CustomFieldsManager;
