import { Link } from "wouter";
import { ArrowLeft, Heart, Baby, Cake, Briefcase, Camera } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";

interface PortfolioCategory {
  jobType: string;
  count: number;
  coverPhoto?: string;
}

export default function PortfolioPage() {
  // Fetch portfolio selections grouped by jobType
  const { data: categories, isLoading } = useQuery({
    queryKey: ['portfolio-categories'],
    queryFn: async () => {
      const portfolioRef = collection(db, 'portfolioSelections');
      const snapshot = await getDocs(portfolioRef);
      
      // Group by jobType and count
      const grouped = new Map<string, PortfolioCategory>();
      snapshot.docs.forEach(doc => {
        const data = doc.data();
        const jobType = data.jobType || 'Altri';
        
        if (!grouped.has(jobType)) {
          grouped.set(jobType, {
            jobType,
            count: 0,
            coverPhoto: data.photoUrl
          });
        }
        
        const category = grouped.get(jobType)!;
        category.count++;
        
        // Use first photo as cover if not set
        if (!category.coverPhoto && data.photoUrl) {
          category.coverPhoto = data.photoUrl;
        }
      });
      
      return Array.from(grouped.values()).sort((a, b) => b.count - a.count);
    }
  });

  const getJobTypeIcon = (jobType: string) => {
    const lower = jobType.toLowerCase();
    if (lower.includes('matrimonio')) return Heart;
    if (lower.includes('battesimo') || lower.includes('comunione')) return Baby;
    if (lower.includes('compleanno')) return Cake;
    if (lower.includes('aziendale') || lower.includes('corporate')) return Briefcase;
    return Camera;
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Simple Nav */}
      <nav className="border-b border-beige sticky top-0 bg-white/80 backdrop-blur-md z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <Link 
            href="/"
            className="inline-flex items-center text-sage hover:text-dark-sage transition"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Home
          </Link>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 py-16">
        <div className="text-center mb-12">
          <h1 className="text-5xl font-playfair text-blue-gray mb-4">Portfolio</h1>
          <p className="text-xl text-gray-600">
            Esplora i miei lavori divisi per categoria
          </p>
        </div>

        {isLoading ? (
          <div className="grid md:grid-cols-3 gap-6">
            {[1, 2, 3].map(i => (
              <div key={i} className="animate-pulse">
                <div className="aspect-square bg-gray-200 rounded-lg mb-4" />
                <div className="h-6 bg-gray-200 rounded w-3/4 mx-auto mb-2" />
                <div className="h-4 bg-gray-200 rounded w-1/2 mx-auto" />
              </div>
            ))}
          </div>
        ) : categories && categories.length > 0 ? (
          <div className="grid md:grid-cols-3 gap-6 mb-12">
            {categories.map(category => {
              const Icon = getJobTypeIcon(category.jobType);
              const slug = category.jobType.toLowerCase().replace(/\s+/g, '-');
              
              return (
                <Link 
                  key={category.jobType}
                  href={`/portfolio/${slug}`}
                  className="group cursor-pointer"
                >
                  <div className="aspect-square bg-gray-200 rounded-lg mb-4 overflow-hidden relative">
                    {category.coverPhoto ? (
                      <img 
                        src={category.coverPhoto} 
                        alt={category.jobType}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-sage/20 to-beige/20">
                        <Icon className="h-24 w-24 text-sage/40" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                  <h3 className="text-2xl font-playfair text-center text-blue-gray group-hover:text-sage transition">
                    {category.jobType}
                  </h3>
                  <p className="text-center text-gray-500">{category.count} foto</p>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-12">
            <Camera className="h-16 w-16 mx-auto mb-4 text-gray-300" />
            <h3 className="text-xl font-playfair text-gray-600 mb-2">
              Portfolio in arrivo
            </h3>
            <p className="text-gray-500">
              Sto selezionando le foto migliori per voi
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
