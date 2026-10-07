import React from "react";
import { Loader2 as Loader2Icon } from "lucide-react";

interface LoadMoreButtonProps {
  onClick: () => void;
  isLoading: boolean;
  hasMore: boolean;
}

export default function LoadMoreButton({ onClick, isLoading, hasMore }: LoadMoreButtonProps) {
  if (!hasMore) {
    return null;
  }
  
  return (
    <div className="flex justify-center mt-8">
      <button
        onClick={onClick}
        disabled={isLoading}
        className="flex items-center justify-center px-4 py-2 bg-sage-600 text-white rounded-md hover:bg-sage-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isLoading ? (
          <>
            <Loader2Icon className="animate-spin h-4 w-4 mr-2" />
            Caricamento...
          </>
        ) : (
          'Carica altre foto'
        )}
      </button>
    </div>
  );
}