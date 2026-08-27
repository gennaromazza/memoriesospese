import { Link } from "wouter";
import {
  BookOpen,
  Briefcase,
  Camera,
  CheckCircle,
  ChevronDown,
  ChevronRight as ChevronRightIcon,
  Eye,
  EyeOff,
  FolderOpen,
  HelpCircle,
  Home,
  List,
  MoreHorizontal,
  Palette,
  Plus,
  Search,
  Trash,
} from "lucide-react";

import { PaginationControls } from "@/components/admin/PaginationControls";
import ShareGalleryButton from "@/components/ShareGalleryButton";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { createUrl } from "@/lib/basePath";
import type { Gallery } from "@/lib/galleries";
import { isWeddingJobType } from "@/lib/wedding-seo";
import type {
  GalleryTypeFilter,
  SelectionFilter,
} from "@/pages/admin/adminGalleryFilters";
import type { JobTypeFE } from "@shared/job-types";

interface ReferrerGallery {
  name: string;
  code?: string;
  from: string;
}

interface AdminGalleriesSectionProps {
  galleries: readonly Gallery[];
  currentGalleries: readonly Gallery[];
  isLoading: boolean;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  referrerGallery: ReferrerGallery | null;
  onClearReferrer: () => void;
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  galleryTypeFilter: GalleryTypeFilter;
  onGalleryTypeFilterChange: (value: GalleryTypeFilter) => void;
  selectionFilter: SelectionFilter;
  onSelectionFilterChange: (value: SelectionFilter) => void;
  galleryJobTypeFilter: string;
  onGalleryJobTypeFilterChange: (value: string) => void;
  jobTypes: readonly JobTypeFE[];
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onPreviousPage: () => void;
  onNextPage: () => void;
  canManageGalleries: boolean;
  onOpenCreate: () => void;
  onToggleStatus: (gallery: Gallery) => void | Promise<void>;
  onDelete: (gallery: Gallery) => void | Promise<void>;
}

/**
 * Presentazione della sezione Gallerie dell'admin.
 *
 * Query, stato persistito e mutazioni restano nel dashboard: questo componente
 * riceve soltanto dati e callback per mantenere invariato il flusso esistente.
 */
export function AdminGalleriesSection({
  galleries,
  currentGalleries,
  isLoading,
  expanded,
  onExpandedChange,
  referrerGallery,
  onClearReferrer,
  searchQuery,
  onSearchQueryChange,
  galleryTypeFilter,
  onGalleryTypeFilterChange,
  selectionFilter,
  onSelectionFilterChange,
  galleryJobTypeFilter,
  onGalleryJobTypeFilterChange,
  jobTypes,
  currentPage,
  totalPages,
  onPageChange,
  onPreviousPage,
  onNextPage,
  canManageGalleries,
  onOpenCreate,
  onToggleStatus,
  onDelete,
}: AdminGalleriesSectionProps) {
  return (
    <div className="space-y-4">
      {/* Header con statistiche - Collapsibile */}
      <Collapsible
        open={expanded}
        onOpenChange={onExpandedChange}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="p-0 h-auto"
              >
                {expanded ? (
                  <ChevronDown className="h-5 w-5" />
                ) : (
                  <ChevronRightIcon className="h-5 w-5" />
                )}
              </Button>
            </CollapsibleTrigger>
            <div>
              <h2 className="text-2xl font-bold text-blue-gray">
                📸 Gestione Gallerie
              </h2>
              <p className="text-sm text-muted-foreground">
                {referrerGallery && (
                  <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-light-mint text-dark-sage text-xs font-medium mb-2">
                    <span>
                      🔗 Collegato da: {referrerGallery.name}
                    </span>
                    {referrerGallery.code && (
                      <code className="text-[10px] bg-mint px-1.5 py-0.5 rounded">
                        {referrerGallery.code}
                      </code>
                    )}
                    <button
                      onClick={onClearReferrer}
                      className="ml-1 hover:text-blue-gray"
                      title="Rimuovi collegamento"
                    >
                      ✕
                    </button>
                  </span>
                )}
                {galleries.length} gallerie totali
              </p>
            </div>
          </div>
        </div>

        <CollapsibleContent>
          <div className="bg-off-white shadow sm:rounded-lg p-5">
            <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4">
              <div className="w-full sm:w-auto">
                <h3 className="text-xl font-semibold text-blue-gray mb-2">
                  Gallerie Eventi
                </h3>
                <p className="text-sm text-muted-foreground">
                  Crea, modifica e gestisci le gallerie fotografiche.
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
                <div className="relative w-full sm:w-60">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Cerca gallerie..."
                    className="pl-8"
                    value={searchQuery}
                    onChange={(e) => onSearchQueryChange(e.target.value)}
                  />
                </div>
                <Button
                  onClick={onOpenCreate}
                  className="whitespace-nowrap"
                >
                  <Plus className="mr-2 h-4 w-4" /> Nuova Galleria
                  Evento
                </Button>
              </div>
            </div>

            {/* 🎨 Filtri Tipo Galleria - Migliorati per mobile */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
              {/* Filtro Tipo Galleria */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-dark-sage uppercase tracking-wider">
                  Tipo Galleria
                </label>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant={
                      galleryTypeFilter === "generic"
                        ? "default"
                        : "outline"
                    }
                    size="sm"
                    onClick={() => onGalleryTypeFilterChange("generic")}
                    className="flex-1 sm:flex-initial min-w-[100px] flex items-center justify-center gap-2 transition-all"
                    data-testid="filter-generic-galleries"
                  >
                    <Home className="h-4 w-4" />
                    <span className="text-xs sm:text-sm">
                      Generiche
                    </span>
                  </Button>
                  <Button
                    variant={
                      galleryTypeFilter === "special"
                        ? "default"
                        : "outline"
                    }
                    size="sm"
                    onClick={() => onGalleryTypeFilterChange("special")}
                    className="flex-1 sm:flex-initial min-w-[100px] flex items-center justify-center gap-2 transition-all"
                    data-testid="filter-special-galleries"
                  >
                    <Palette className="h-4 w-4" />
                    <span className="text-xs sm:text-sm">
                      Tematiche
                    </span>
                  </Button>
                  <Button
                    variant={
                      galleryTypeFilter === "all"
                        ? "default"
                        : "outline"
                    }
                    size="sm"
                    onClick={() => onGalleryTypeFilterChange("all")}
                    className="flex-1 sm:flex-initial min-w-[100px] flex items-center justify-center gap-2 transition-all"
                    data-testid="filter-all-galleries"
                  >
                    <List className="h-4 w-4" />
                    <span className="text-xs sm:text-sm">Tutte</span>
                  </Button>
                </div>
              </div>

              {/* Filtro Selezioni */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-dark-sage uppercase tracking-wider">
                  Selezioni Foto
                </label>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant={
                      selectionFilter === "all"
                        ? "default"
                        : "outline"
                    }
                    size="sm"
                    onClick={() => onSelectionFilterChange("all")}
                    className="flex-1 sm:flex-initial min-w-[100px] flex items-center justify-center gap-2 transition-all"
                    data-testid="filter-all-selections"
                  >
                    <Camera className="h-4 w-4" />
                    <span className="text-xs sm:text-sm">Tutte</span>
                  </Button>
                  <Button
                    variant={
                      selectionFilter === "approved"
                        ? "default"
                        : "outline"
                    }
                    size="sm"
                    onClick={() => onSelectionFilterChange("approved")}
                    className="flex-1 sm:flex-initial min-w-[140px] flex items-center justify-center gap-2 transition-all bg-light-mint hover:bg-mint border-sage text-dark-sage"
                    data-testid="filter-approved-selections"
                  >
                    <CheckCircle className="h-4 w-4" />
                    <span className="text-xs sm:text-sm">
                      Approvate
                    </span>
                  </Button>
                </div>
              </div>
            </div>

            {/* Filtro Categoria Evento */}
            {jobTypes.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span className="text-xs font-medium text-dark-sage uppercase tracking-wider mr-1">
                  Categoria:
                </span>
                <button
                  onClick={() => onGalleryJobTypeFilterChange("all")}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${galleryJobTypeFilter === "all" ? "bg-sage text-white border-sage" : "bg-off-white text-dark-sage border-beige hover:border-sage"}`}
                >
                  Tutte
                </button>
                <button
                  onClick={() => onGalleryJobTypeFilterChange("none")}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${galleryJobTypeFilter === "none" ? "bg-blue-gray text-white border-blue-gray" : "bg-off-white text-dark-sage border-beige hover:border-blue-gray"}`}
                >
                  Senza cat.
                </button>
                {jobTypes.map((jt) => (
                  <button
                    key={jt.slug}
                    onClick={() => onGalleryJobTypeFilterChange(jt.slug)}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${galleryJobTypeFilter === jt.slug ? "bg-terracotta text-white border-terracotta" : "bg-off-white text-dark-sage border-beige hover:border-terracotta"}`}
                  >
                    {jt.icona ? `${jt.icona} ` : ""}
                    {jt.nome}
                  </button>
                ))}
              </div>
            )}

            {/* Skeleton loader durante il caricamento */}
            {isLoading ? (
              <div className="space-y-4">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="mb-4">
                    <Skeleton className="h-10 w-full mb-2" />
                    <Skeleton className="h-6 w-4/5" />
                  </div>
                ))}
              </div>
            ) : galleries.length === 0 ? (
              <div className="p-8 text-center">
                <p className="text-gray-500">
                  Nessuna galleria eventi trovata.
                </p>
                <Button
                  onClick={onOpenCreate}
                  variant="outline"
                  className="mt-4"
                >
                  <Plus className="mr-2 h-4 w-4" /> Crea la tua prima
                  galleria evento
                </Button>
              </div>
            ) : (
              <>
                {/* Vista Desktop - Tabella */}
                <div className="hidden lg:block overflow-x-auto">
                  <table className="min-w-full divide-y divide-beige">
                    <thead className="bg-cream/40">
                      <tr>
                        <th
                          scope="col"
                          className="px-4 py-3 text-left text-xs font-medium text-dark-sage uppercase tracking-wider"
                        >
                          Nome
                        </th>
                        <th
                          scope="col"
                          className="px-4 py-3 text-left text-xs font-medium text-dark-sage uppercase tracking-wider"
                        >
                          Codice
                        </th>
                        <th
                          scope="col"
                          className="px-4 py-3 text-left text-xs font-medium text-dark-sage uppercase tracking-wider"
                        >
                          Data
                        </th>
                        <th
                          scope="col"
                          className="px-4 py-3 text-left text-xs font-medium text-dark-sage uppercase tracking-wider"
                        >
                          Foto
                        </th>
                        <th
                          scope="col"
                          className="px-4 py-3 text-left text-xs font-medium text-dark-sage uppercase tracking-wider"
                        >
                          Selezione
                        </th>
                        <th
                          scope="col"
                          className="px-4 py-3 text-left text-xs font-medium text-dark-sage uppercase tracking-wider"
                        >
                          Stato
                        </th>
                        <th
                          scope="col"
                          className="px-4 py-3 text-left text-xs font-medium text-dark-sage uppercase tracking-wider"
                        >
                          Azioni
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-off-white divide-y divide-beige">
                      {currentGalleries.map((gallery) => (
                        <tr
                          key={gallery.id}
                          className="hover:bg-light-mint/40 transition-colors"
                        >
                          <td className="px-4 py-4">
                            <div className="text-sm font-medium text-blue-gray">
                              {gallery.name}
                            </div>
                            {gallery.jobType &&
                              (() => {
                                const jt = jobTypes.find(
                                  (t) =>
                                    t.slug ===
                                    gallery.jobType,
                                );
                                return (
                                  <span className="inline-flex items-center gap-0.5 mt-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-terracotta/10 text-terracotta border border-terracotta/20">
                                    {jt?.icona && (
                                      <span>{jt.icona}</span>
                                    )}
                                    {jt?.nome || gallery.jobType}
                                  </span>
                                );
                              })()}
                          </td>
                          <td className="px-4 py-4">
                            <code className="text-xs bg-cream/60 text-blue-gray px-2 py-1 rounded">
                              {gallery.code}
                            </code>
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap">
                            <div className="text-sm text-dark-sage">
                              {gallery.date}
                            </div>
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap">
                            <span className="text-sm font-semibold text-blue-gray">
                              {gallery.photoCount || 0}
                            </span>
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap">
                            {gallery.selectionStatus ===
                            "completed" ? (
                              <span className="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-light-mint text-dark-sage">
                                ✅ Completata
                              </span>
                            ) : gallery.selectionEnabled ? (
                              <span className="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-cream/70 text-terracotta">
                                ⏳ In attesa
                              </span>
                            ) : (
                              <span className="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-beige/50 text-dark-sage">
                                -
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap">
                            <span
                              className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                                gallery.active
                                  ? "bg-light-mint text-dark-sage"
                                  : "bg-terracotta/15 text-terracotta"
                              }`}
                            >
                              {gallery.active
                                ? "Attiva"
                                : "Disattivata"}
                            </span>
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap">
                            <div className="flex gap-1">
                              <Link
                                to={createUrl(
                                  `/gallery/${gallery.code}`,
                                )}
                              >
                                <Button
                                  variant="outline"
                                  size="icon"
                                  className="h-9 w-9 bg-light-mint hover:bg-mint border-sage transition-colors"
                                  title="Visualizza galleria (bypass admin)"
                                >
                                  <Eye className="h-4 w-4 text-dark-sage" />
                                </Button>
                              </Link>
                              <ShareGalleryButton
                                galleryId={gallery.id}
                                galleryCode={gallery.code}
                                galleryName={gallery.name}
                                clienteId={gallery.clienteId}
                              />
                              {canManageGalleries && (
                                <Link
                                  to={createUrl(
                                    `/admin/gallery/${gallery.id}/manage`,
                                  )}
                                >
                                  <Button
                                    variant="outline"
                                    size="icon"
                                    className="h-9 w-9 bg-blue-gray/10 hover:bg-blue-gray/20 border-blue-gray/30 transition-colors"
                                    title="Gestisci galleria"
                                    data-testid="button-manage-gallery"
                                  >
                                    <FolderOpen className="h-4 w-4 text-blue-gray" />
                                  </Button>
                                </Link>
                              )}
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    variant="outline"
                                    size="icon"
                                    className="h-9 w-9 border-beige bg-off-white text-blue-gray hover:bg-cream"
                                    title="Altre azioni"
                                    data-testid={`button-more-gallery-actions-${gallery.id}`}
                                  >
                                    <MoreHorizontal className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  {isWeddingJobType(gallery.jobType) && (
                                    <DropdownMenuItem asChild>
                                      <Link to={createUrl(`/admin/gallery/${gallery.id}/manage?tab=real-wedding`)} data-testid={`button-real-wedding-${gallery.id}`}>
                                        <BookOpen className="mr-2 h-4 w-4 text-terracotta" />
                                        Real Wedding
                                      </Link>
                                    </DropdownMenuItem>
                                  )}
                                  {gallery.jobId && (
                                    <DropdownMenuItem asChild>
                                      <Link to={createUrl(`/admin/jobs/${gallery.jobId}`)} data-testid={`button-linked-job-${gallery.id}`}>
                                        <Briefcase className="mr-2 h-4 w-4 text-dark-sage" />
                                        Apri lavoro
                                      </Link>
                                    </DropdownMenuItem>
                                  )}
                                  <DropdownMenuItem onClick={() => onToggleStatus(gallery)}>
                                    {gallery.active ? <EyeOff className="mr-2 h-4 w-4" /> : <Eye className="mr-2 h-4 w-4" />}
                                    {gallery.active ? "Disattiva galleria" : "Attiva galleria"}
                                  </DropdownMenuItem>
                                  <DropdownMenuItem asChild>
                                    <Link to={createUrl(`/admin/galleries/${gallery.id}/questionnaire`)}>
                                      <HelpCircle className="mr-2 h-4 w-4 text-terracotta" />
                                      Questionario
                                    </Link>
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem onClick={() => onDelete(gallery)} className="text-red-600 focus:text-red-600">
                                    <Trash className="mr-2 h-4 w-4" />
                                    Elimina galleria
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Vista Mobile/Tablet - Card */}
                <div className="lg:hidden space-y-4">
                  {currentGalleries.map((gallery) => (
                    <div
                      key={gallery.id}
                      className="bg-off-white border border-beige rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1 min-w-0">
                          <h3 className="text-base font-semibold text-blue-gray truncate">
                            {gallery.name}
                          </h3>
                          <div className="flex items-center gap-2 mt-1">
                            <code className="text-xs bg-cream/60 text-blue-gray px-2 py-1 rounded">
                              {gallery.code}
                            </code>
                            <span
                              className={`px-2 py-1 inline-flex text-xs font-semibold rounded-full ${
                                gallery.active
                                  ? "bg-light-mint text-dark-sage"
                                  : "bg-terracotta/15 text-terracotta"
                              }`}
                            >
                              {gallery.active ? "✓ Attiva" : "✕ Off"}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3 text-sm mb-3">
                        <div>
                          <span className="text-dark-sage">Data:</span>
                          <p className="font-medium text-blue-gray">
                            {gallery.date}
                          </p>
                        </div>
                        <div>
                          <span className="text-dark-sage">Foto:</span>
                          <p className="font-semibold text-blue-gray">
                            {gallery.photoCount || 0}
                          </p>
                        </div>
                        <div className="col-span-2">
                          <span className="text-dark-sage block mb-1">
                            Selezione:
                          </span>
                          {gallery.selectionStatus === "completed" ? (
                            <span className="px-3 py-1 inline-flex text-xs font-semibold rounded-full bg-light-mint text-dark-sage">
                              ✅ Completata
                            </span>
                          ) : gallery.selectionEnabled ? (
                            <span className="px-3 py-1 inline-flex text-xs font-semibold rounded-full bg-cream/70 text-terracotta">
                              ⏳ In attesa
                            </span>
                          ) : (
                            <span className="px-3 py-1 inline-flex text-xs font-semibold rounded-full bg-beige/50 text-dark-sage">
                              Non attiva
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 pt-3 border-t border-beige">
                        <Link
                          to={createUrl(`/gallery/${gallery.code}`)}
                          target="_blank"
                          className="min-w-0"
                        >
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-full bg-light-mint hover:bg-mint border-sage text-dark-sage"
                          >
                            <Eye className="h-4 w-4 mr-1" />
                            Visualizza
                          </Button>
                        </Link>
                        {canManageGalleries && (
                          <Link
                            to={createUrl(
                              `/admin/gallery/${gallery.id}/manage`,
                            )}
                            className="min-w-0"
                          >
                            <Button
                              variant="outline"
                              size="sm"
                              className="w-full bg-blue-gray/10 hover:bg-blue-gray/20 border-blue-gray/30 text-blue-gray"
                              data-testid="button-manage-gallery"
                            >
                              <FolderOpen className="h-4 w-4 mr-1" />
                              Gestisci
                            </Button>
                          </Link>
                        )}
                        <ShareGalleryButton
                          galleryId={gallery.id}
                          galleryCode={gallery.code}
                          galleryName={gallery.name}
                          clienteId={gallery.clienteId}
                          variant="button"
                          size="sm"
                          className="w-full"
                        />
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              className="w-full border-beige bg-off-white text-blue-gray hover:bg-cream"
                              data-testid={`button-more-gallery-actions-${gallery.id}`}
                            >
                              Altro
                              <MoreHorizontal className="h-4 w-4 ml-1" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {isWeddingJobType(gallery.jobType) && (
                              <DropdownMenuItem asChild>
                                <Link to={createUrl(`/admin/gallery/${gallery.id}/manage?tab=real-wedding`)} data-testid={`button-real-wedding-${gallery.id}`}>
                                  <BookOpen className="h-4 w-4 mr-2 text-terracotta" />
                                  Real Wedding
                                </Link>
                              </DropdownMenuItem>
                            )}
                            {gallery.jobId && (
                              <DropdownMenuItem asChild>
                                <Link to={createUrl(`/admin/jobs/${gallery.jobId}`)} data-testid={`button-linked-job-${gallery.id}`}>
                                  <Briefcase className="h-4 w-4 mr-2 text-dark-sage" />
                                  Apri lavoro
                                </Link>
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem onClick={() => onToggleStatus(gallery)}>
                              {gallery.active ? <EyeOff className="h-4 w-4 mr-2" /> : <Eye className="h-4 w-4 mr-2" />}
                              {gallery.active ? "Disattiva galleria" : "Attiva galleria"}
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild>
                              <Link
                                to={createUrl(
                                  `/admin/galleries/${gallery.id}/questionnaire`,
                                )}
                              >
                                <HelpCircle className="h-4 w-4 mr-2" />
                                Questionario
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => onDelete(gallery)}
                              className="text-red-600 focus:text-red-600"
                            >
                              <Trash className="h-4 w-4 mr-2" />
                              Elimina
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Controlli di paginazione per le gallerie */}
            <PaginationControls
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={onPageChange}
              onPrevious={onPreviousPage}
              onNext={onNextPage}
            />
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
