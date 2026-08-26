import { useState, type Dispatch, type SetStateAction } from "react";

export interface PaginationResult<T> {
  currentItems: T[];
  currentPage: number;
  totalPages: number;
  setCurrentPage: Dispatch<SetStateAction<number>>;
  goToNextPage: () => void;
  goToPreviousPage: () => void;
}

/**
 * Calcola la pagina visibile di una collezione, mantenendo la pagina corrente
 * anche quando il numero degli elementi cambia.
 */
export function usePagination<T>(
  items: readonly T[],
  itemsPerPage: number,
): PaginationResult<T> {
  const [currentPage, setCurrentPage] = useState(1);
  const totalPages = Math.ceil(items.length / itemsPerPage);
  const firstItemIndex = (currentPage - 1) * itemsPerPage;
  const currentItems = items.slice(
    firstItemIndex,
    firstItemIndex + itemsPerPage,
  );

  const goToNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1);
    }
  };

  const goToPreviousPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
    }
  };

  return {
    currentItems,
    currentPage,
    totalPages,
    setCurrentPage,
    goToNextPage,
    goToPreviousPage,
  };
}
