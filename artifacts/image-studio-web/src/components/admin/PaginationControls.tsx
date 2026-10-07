import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PaginationControlsProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onPrevious: () => void;
  onNext: () => void;
}

export function PaginationControls({
  currentPage,
  totalPages,
  onPageChange,
  onPrevious,
  onNext,
}: PaginationControlsProps) {
  if (totalPages <= 1) return null;

  return (
    <div className="flex justify-center items-center mt-6 space-x-1">
      <Button
        variant="outline"
        size="sm"
        onClick={onPrevious}
        disabled={currentPage === 1}
      >
        <ChevronLeft className="h-4 w-4 mr-1" /> Prec
      </Button>

      {totalPages <= 5 ? (
        Array.from({ length: totalPages }, (_, i) => (
          <Button
            key={i}
            variant={currentPage === i + 1 ? "default" : "outline"}
            size="sm"
            className="w-8"
            onClick={() => onPageChange(i + 1)}
          >
            {i + 1}
          </Button>
        ))
      ) : (
        <>
          <Button
            variant={currentPage === 1 ? "default" : "outline"}
            size="sm"
            className="w-8"
            onClick={() => onPageChange(1)}
          >
            1
          </Button>

          {currentPage > 3 && <span className="mx-1">...</span>}

          {currentPage > 2 && (
            <Button
              variant="outline"
              size="sm"
              className="w-8"
              onClick={() => onPageChange(currentPage - 1)}
            >
              {currentPage - 1}
            </Button>
          )}

          {currentPage !== 1 && currentPage !== totalPages && (
            <Button variant="default" size="sm" className="w-8">
              {currentPage}
            </Button>
          )}

          {currentPage < totalPages - 1 && (
            <Button
              variant="outline"
              size="sm"
              className="w-8"
              onClick={() => onPageChange(currentPage + 1)}
            >
              {currentPage + 1}
            </Button>
          )}

          {currentPage < totalPages - 2 && <span className="mx-1">...</span>}

          <Button
            variant={currentPage === totalPages ? "default" : "outline"}
            size="sm"
            className="w-8"
            onClick={() => onPageChange(totalPages)}
          >
            {totalPages}
          </Button>
        </>
      )}

      <Button
        variant="outline"
        size="sm"
        onClick={onNext}
        disabled={currentPage === totalPages}
      >
        Succ <ChevronRight className="h-4 w-4 ml-1" />
      </Button>
    </div>
  );
}
