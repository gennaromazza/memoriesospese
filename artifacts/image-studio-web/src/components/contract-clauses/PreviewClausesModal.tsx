/**
 * PREVIEW CLAUSES MODAL
 * Anteprima clausole con checkbox come apparirebbero al cliente
 */

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { FileText } from 'lucide-react';
import type { ContractClauseTemplate } from '@shared/contract-clause-types';

interface PreviewClausesModalProps {
  template: ContractClauseTemplate;
  open: boolean;
  onClose: () => void;
}

export default function PreviewClausesModal({
  template,
  open,
  onClose
}: PreviewClausesModalProps) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Anteprima Clausole
          </DialogTitle>
          <DialogDescription>
            Come appariranno le clausole al cliente nel preventivo
          </DialogDescription>
        </DialogHeader>

        <Card>
          <CardHeader>
            <CardTitle className="text-xl">{template.titolo}</CardTitle>
            <div className="flex gap-2 mt-2">
              <Badge variant="secondary">
                {template.clauses.length} clausole totali
              </Badge>
              <Badge variant="default">
                {template.clauses.filter(c => c.required).length} obbligatorie
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {/* Sezione istruzioni */}
              <div className="bg-muted/50 rounded-lg p-4">
                <p className="text-sm text-muted-foreground">
                  <strong>Importante:</strong> Le clausole contrassegnate come obbligatorie devono essere accettate 
                  dal cliente prima di poter firmare e confermare il preventivo.
                </p>
              </div>

              <Separator />

              {/* Clausole */}
              <div className="space-y-4">
                <h3 className="font-semibold text-lg">Termini e Condizioni</h3>
                
                {template.clauses
                  .sort((a, b) => a.ordine - b.ordine)
                  .map((clause, index) => (
                    <div
                      key={clause.id}
                      className="flex items-start gap-3 p-4 rounded-lg border bg-card"
                      data-testid={`preview-clause-${clause.id}`}
                    >
                      <Checkbox
                        id={`clause-${clause.id}`}
                        disabled
                        className="mt-1"
                      />
                      <div className="flex-1">
                        <label
                          htmlFor={`clause-${clause.id}`}
                          className="text-sm leading-relaxed cursor-pointer flex items-start gap-2"
                        >
                          <span className="font-medium text-muted-foreground">
                            {clause.ordine}.
                          </span>
                          <span className="flex-1">
                            {clause.text}
                          </span>
                          {clause.required && (
                            <Badge variant="destructive" className="text-xs ml-2">
                              Obbligatoria
                            </Badge>
                          )}
                        </label>
                      </div>
                    </div>
                  ))}
              </div>

              {/* Note */}
              <div className="bg-primary/5 rounded-lg p-4 text-sm">
                <p className="text-muted-foreground">
                  Il cliente dovrà accettare tutte le clausole obbligatorie e apporre la firma digitale 
                  prima di confermare il preventivo. Una volta confermato, riceverà una copia via email.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </DialogContent>
    </Dialog>
  );
}
