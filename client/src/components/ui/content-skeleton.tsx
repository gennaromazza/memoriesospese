import { cn } from "@/lib/utils";

interface ContentSkeletonProps {
  className?: string;
}

export function PhotoGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="aspect-[4/3] rounded-lg bg-gradient-to-r from-muted via-muted/80 to-muted animate-pulse"
          style={{ animationDelay: `${i * 100}ms` }}
        />
      ))}
    </div>
  );
}

export function BlogCardSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="rounded-lg overflow-hidden border bg-card"
          style={{ animationDelay: `${i * 150}ms` }}
        >
          <div className="aspect-[16/9] bg-gradient-to-r from-muted via-muted/80 to-muted animate-pulse" />
          <div className="p-4 space-y-3">
            <div className="h-4 bg-muted rounded animate-pulse w-3/4" />
            <div className="h-3 bg-muted rounded animate-pulse w-full" />
            <div className="h-3 bg-muted rounded animate-pulse w-2/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function VideoCardSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="rounded-lg overflow-hidden"
          style={{ animationDelay: `${i * 150}ms` }}
        >
          <div className="aspect-video bg-gradient-to-r from-muted via-muted/80 to-muted animate-pulse rounded-lg" />
          <div className="mt-3 space-y-2">
            <div className="h-4 bg-muted rounded animate-pulse w-2/3" />
            <div className="h-3 bg-muted rounded animate-pulse w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function HeroSkeleton() {
  return (
    <div className="relative h-[80vh] min-h-[600px] bg-gradient-to-r from-sage/20 via-mint/20 to-sage/20 animate-pulse">
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="h-12 w-64 mx-auto bg-muted/50 rounded animate-pulse" />
          <div className="h-6 w-48 mx-auto bg-muted/50 rounded animate-pulse" />
        </div>
      </div>
    </div>
  );
}

export function TableRowSkeleton({ columns = 5, rows = 5 }: { columns?: number; rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div
          key={rowIndex}
          className="flex gap-4 p-3 border-b"
          style={{ animationDelay: `${rowIndex * 50}ms` }}
        >
          {Array.from({ length: columns }).map((_, colIndex) => (
            <div
              key={colIndex}
              className="h-4 bg-muted rounded animate-pulse flex-1"
              style={{ maxWidth: colIndex === 0 ? '200px' : '150px' }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export function CardSkeleton({ className }: ContentSkeletonProps) {
  return (
    <div className={cn("rounded-lg border bg-card p-4 space-y-3 animate-pulse", className)}>
      <div className="h-5 bg-muted rounded w-1/2" />
      <div className="space-y-2">
        <div className="h-3 bg-muted rounded w-full" />
        <div className="h-3 bg-muted rounded w-3/4" />
      </div>
    </div>
  );
}
