import { useState } from 'react';
import { useUploadQueue } from '../lib/uploadQueue';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function Settings() {
  const { concurrency, setConcurrency } = useUploadQueue();
  const [val, setVal] = useState(concurrency.toString());

  const handleSave = () => {
    const num = parseInt(val, 10);
    if (!isNaN(num) && num > 0 && num <= 10) {
      setConcurrency(num);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-8 bg-off-white">
      <div className="max-w-3xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-serif font-semibold text-foreground">Impostazioni</h1>
          <p className="text-muted-foreground mt-1">Configura le preferenze desktop e i comportamenti di caricamento.</p>
        </div>
        
        <div className="bg-card border border-border rounded-lg p-6 shadow-sm">
          <h2 className="text-lg font-medium text-foreground mb-4">Configurazione Caricamento</h2>
          <div className="space-y-4 max-w-sm">
            <div className="space-y-2">
              <Label htmlFor="concurrency">Caricamenti Simultanei (Concorrenza)</Label>
              <Input 
                id="concurrency" 
                type="number" 
                min={1} 
                max={10} 
                value={val}
                onChange={e => setVal(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Numero di file da caricare contemporaneamente. Valori alti potrebbero rallentare la rete. (1-10)</p>
            </div>
            <Button onClick={handleSave} className="w-full sm:w-auto">Salva Impostazioni</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
