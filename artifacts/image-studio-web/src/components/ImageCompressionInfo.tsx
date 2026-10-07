import React from 'react';
import { Loader2 } from 'lucide-react';

interface ImageCompressionInfoProps {
  originalSize?: number;
  compressedSize?: number;
  fileName: string;
  isCompressing: boolean;
  compressionRatio?: number;
}

export default function ImageCompressionInfo({
  originalSize,
  compressedSize,
  fileName,
  isCompressing,
  compressionRatio
}: ImageCompressionInfoProps) {
  // Formatta le dimensioni in KB o MB
  const formatSize = (sizeInBytes?: number) => {
    if (sizeInBytes === undefined) return 'N/A';
    
    if (sizeInBytes < 1024 * 1024) {
      return `${(sizeInBytes / 1024).toFixed(2)} KB`;
    }
    return `${(sizeInBytes / (1024 * 1024)).toFixed(2)} MB`;
  };
  
  // Calcola la percentuale di riduzione
  const reductionPercentage = originalSize && compressedSize
    ? ((originalSize - compressedSize) / originalSize * 100).toFixed(0)
    : undefined;
    
  // Determina il colore in base alla percentuale di riduzione
  const getReductionColor = () => {
    if (!reductionPercentage) return 'text-gray-500';
    const reduction = parseInt(reductionPercentage);
    if (reduction > 50) return 'text-green-500';
    if (reduction > 20) return 'text-green-400';
    if (reduction > 5) return 'text-amber-500';
    return 'text-gray-500';
  };
  
  return (
    <div className="text-xs rounded-md p-2 bg-gray-50 border">
      <div className="flex justify-between items-center mb-1">
        <span className="font-medium text-blue-gray truncate max-w-[180px]">{fileName}</span>
        {isCompressing ? (
          <span className="flex items-center text-blue-500">
            <Loader2 className="h-3 w-3 animate-spin mr-1" />
            Compressione...
          </span>
        ) : compressionRatio ? (
          <span className={`${getReductionColor()} font-medium`}>
            {reductionPercentage}% riduzione
          </span>
        ) : null}
      </div>
      
      <div className="grid grid-cols-2 gap-2">
        <div>
          <span className="text-gray-500">Originale: </span>
          <span className="font-medium">{formatSize(originalSize)}</span>
        </div>
        <div>
          <span className="text-gray-500">Compresso: </span>
          <span className="font-medium">{isCompressing ? '...' : formatSize(compressedSize)}</span>
        </div>
      </div>
    </div>
  );
}