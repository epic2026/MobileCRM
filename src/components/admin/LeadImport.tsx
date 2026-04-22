import { useState, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import * as XLSX from 'xlsx';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Upload, FileSpreadsheet, Check, X, AlertCircle } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { useTenant } from '@/contexts/TenantContext';

interface ParsedLead {
  name: string;
  phone: string;
  email?: string;
  company?: string;
  source?: string;
  notes?: string;
  value?: number;
  isValid: boolean;
  errors: string[];
}

const LeadImport = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { currentTenant } = useTenant();

  const [parsedLeads, setParsedLeads] = useState<ParsedLead[]>([]);
  const [fileName, setFileName] = useState<string>('');
  const [importProgress, setImportProgress] = useState(0);
  const [isImporting, setIsImporting] = useState(false);

  const validateLead = (lead: Partial<ParsedLead>): ParsedLead => {
    const errors: string[] = [];

    if (!lead.name || lead.name.trim() === '') {
      errors.push('Name is required');
    }
    if (!lead.phone || lead.phone.trim() === '') {
      errors.push('Phone is required');
    }
    if (lead.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lead.email)) {
      errors.push('Invalid email format');
    }

    return {
      name: lead.name?.trim() || '',
      phone: lead.phone?.trim() || '',
      email: lead.email?.trim() || undefined,
      company: lead.company?.trim() || undefined,
      source: lead.source?.trim() || 'Excel Import',
      notes: lead.notes?.trim() || undefined,
      value: lead.value,
      isValid: errors.length === 0,
      errors,
    };
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet);

        const leads = jsonData.map((row: any) => {
          return validateLead({
            name: String(row.name || row.Name || row.NAME || ''),
            phone: String(row.phone || row.Phone || row.PHONE || row.mobile || row.Mobile || ''),
            email: String(row.email || row.Email || row.EMAIL || ''),
            company: String(row.company || row.Company || row.COMPANY || ''),
            source: String(row.source || row.Source || row.SOURCE || 'Excel Import'),
            notes: String(row.notes || row.Notes || row.NOTES || ''),
            value: parseFloat(row.value || row.Value || row.VALUE || '0') || undefined,
          });
        });

        setParsedLeads(leads);
        toast({
          title: 'File Parsed',
          description: `Found ${leads.length} leads. ${leads.filter((l) => l.isValid).length} valid.`,
        });
      } catch (error) {
        toast({
          title: 'Parse Error',
          description: 'Failed to parse Excel file. Please check the format.',
          variant: 'destructive',
        });
      }
    };

    reader.readAsArrayBuffer(file);
  };

  const importLeads = useMutation({
    mutationFn: async (leads: ParsedLead[]) => {
      if (!currentTenant) {
        throw new Error('Select a tenant before importing leads.');
      }

      setIsImporting(true);
      const validLeads = leads.filter((l) => l.isValid);
      let imported = 0;

      for (const lead of validLeads) {
        const { error } = await supabase.from('leads').insert({
          name: lead.name,
          phone: lead.phone,
          email: lead.email || null,
          company: lead.company || null,
          source: lead.source || 'Excel Import',
          notes: lead.notes || null,
          value: lead.value || null,
          status: 'new',
          tenant_id: currentTenant.id,
          user_id: null, // Unassigned - admin will assign later
        });

        if (!error) {
          imported++;
        }
        setImportProgress(Math.round((imported / validLeads.length) * 100));
      }

      return imported;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ['admin-leads', currentTenant?.id] });
      queryClient.invalidateQueries({ queryKey: ['admin-stats'] });
      toast({
        title: 'Import Complete',
        description: `Successfully imported ${count} leads.`,
      });
      setParsedLeads([]);
      setFileName('');
      setImportProgress(0);
      setIsImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    },
    onError: (error: Error) => {
      toast({
        title: 'Import Failed',
        description: error.message,
        variant: 'destructive',
      });
      setIsImporting(false);
    },
  });

  const validCount = parsedLeads.filter((l) => l.isValid).length;
  const invalidCount = parsedLeads.filter((l) => !l.isValid).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileSpreadsheet className="w-5 h-5" />
          Import Leads from Excel
        </CardTitle>
        <CardDescription>
          Upload an Excel file (.xlsx, .xls) with columns: name, phone, email, company, source, notes, value
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Upload Area */}
        <div
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
        >
          <Input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={handleFileUpload}
            className="hidden"
          />
          <Upload className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-sm text-muted-foreground">
            {fileName ? fileName : 'Click to upload or drag and drop'}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Excel files (.xlsx, .xls) or CSV
          </p>
        </div>

        {/* Parsed Results */}
        {parsedLeads.length > 0 && (
          <>
            <div className="flex items-center gap-4">
              <Badge variant="outline" className="text-green-600 border-green-600">
                <Check className="w-3 h-3 mr-1" />
                {validCount} Valid
              </Badge>
              {invalidCount > 0 && (
                <Badge variant="outline" className="text-red-600 border-red-600">
                  <X className="w-3 h-3 mr-1" />
                  {invalidCount} Invalid
                </Badge>
              )}
            </div>

            {isImporting && (
              <div className="space-y-2">
                <Progress value={importProgress} />
                <p className="text-sm text-muted-foreground text-center">
                  Importing... {importProgress}%
                </p>
              </div>
            )}

            <div className="max-h-96 overflow-auto border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">Status</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Company</TableHead>
                    <TableHead>Issues</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsedLeads.slice(0, 50).map((lead, index) => (
                    <TableRow key={index} className={lead.isValid ? '' : 'bg-destructive/10'}>
                      <TableCell>
                        {lead.isValid ? (
                          <Check className="w-4 h-4 text-green-600" />
                        ) : (
                          <AlertCircle className="w-4 h-4 text-red-600" />
                        )}
                      </TableCell>
                      <TableCell>{lead.name || '-'}</TableCell>
                      <TableCell>{lead.phone || '-'}</TableCell>
                      <TableCell>{lead.email || '-'}</TableCell>
                      <TableCell>{lead.company || '-'}</TableCell>
                      <TableCell>
                        {lead.errors.length > 0 && (
                          <span className="text-xs text-destructive">
                            {lead.errors.join(', ')}
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {parsedLeads.length > 50 && (
                <p className="text-sm text-muted-foreground p-4 text-center">
                  Showing first 50 of {parsedLeads.length} leads
                </p>
              )}
            </div>

            <div className="flex gap-4">
              <Button
                onClick={() => importLeads.mutate(parsedLeads)}
                disabled={validCount === 0 || isImporting}
                className="flex-1"
              >
                Import {validCount} Valid Leads
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setParsedLeads([]);
                  setFileName('');
                  if (fileInputRef.current) {
                    fileInputRef.current.value = '';
                  }
                }}
              >
                Clear
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default LeadImport;
