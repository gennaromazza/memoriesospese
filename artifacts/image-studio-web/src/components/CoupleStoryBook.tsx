import React, { useState, useEffect } from 'react';
import { CoupleStory, StoryChapter, PoeticQuote } from '@shared/schema';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  ChevronLeft, 
  ChevronRight, 
  BookOpen, 
  Quote, 
  Sparkles,
  Heart,
  Users,
  Calendar,
  MapPin
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useFirebaseAuth } from '@/context/FirebaseAuthContext';
import { useIsAdmin } from '@/hooks/useIsAdmin';

interface CoupleStoryBookProps {
  story: CoupleStory;
  galleryName?: string;
  galleryDate?: string;
  galleryLocation?: string;
  onEdit?: () => void;
  onDelete?: () => void;
}

interface BookPage {
  id: string;
  type: 'cover' | 'prologue' | 'chapter' | 'quotes' | 'notes';
  title: string;
  content: any;
  chapterKey?: string;
}

export default function CoupleStoryBook({ 
  story, 
  galleryName,
  galleryDate,
  galleryLocation,
  onEdit,
  onDelete 
}: CoupleStoryBookProps) {
  const [currentPage, setCurrentPage] = useState(0);
  const [pages, setPages] = useState<BookPage[]>([]);
  const isAdmin = useIsAdmin();

  // Costruisci le pagine del libro
  useEffect(() => {
    const bookPages: BookPage[] = [];

    // Pagina di copertina
    bookPages.push({
      id: 'cover',
      type: 'cover',
      title: story.metadata?.titolo || 'La Nostra Storia',
      content: {
        subtitle: story.metadata?.sottotitolo || 'Un amore senza tempo',
        galleryName,
        galleryDate,
        galleryLocation,
        theme: story.metadata?.tema || 'Elegante',
        color: story.metadata?.colore_principale || '#6d7e6d'
      }
    });

    // Prologo se presente
    if (story.prologo) {
      bookPages.push({
        id: 'prologue',
        type: 'prologue',
        title: 'Prologo',
        content: story.prologo
      });
    }

    // Capitoli della storia
    const chapters = [
      { key: 'capitolo_1_lattesa', title: "L'Attesa" },
      { key: 'capitolo_2_incontro', title: "L'Incontro" },
      { key: 'capitolo_3_festa', title: "La Festa" },
      { key: 'capitolo_4_promesse', title: "Le Promesse" },
      { key: 'capitolo_5_celebrazione', title: "La Celebrazione" },
      { key: 'capitolo_6_eternita', title: "L'Eternità" }
    ];

    chapters.forEach(({ key, title }) => {
      const chapterContent = story[key as keyof CoupleStory] as StoryChapter[];
      if (chapterContent && chapterContent.length > 0) {
        bookPages.push({
          id: key,
          type: 'chapter',
          title,
          content: chapterContent,
          chapterKey: key
        });
      }
    });

    // Citazioni se presenti
    const allQuotes = [
      ...(story.citazioni_poetiche || []),
      ...(story.citazioni_religiose || []),
      ...(story.citazioni_moderne || [])
    ];

    if (allQuotes.length > 0) {
      bookPages.push({
        id: 'quotes',
        type: 'quotes',
        title: 'Citazioni & Ispirazioni',
        content: {
          poetiche: story.citazioni_poetiche || [],
          religiose: story.citazioni_religiose || [],
          moderne: story.citazioni_moderne || []
        }
      });
    }

    // Note del fotografo se presenti
    if (story.note_fotografo && story.note_fotografo.length > 0) {
      bookPages.push({
        id: 'notes',
        type: 'notes',
        title: 'Note del Fotografo',
        content: story.note_fotografo
      });
    }

    setPages(bookPages);
  }, [story, galleryName, galleryDate, galleryLocation]);

  const nextPage = () => {
    if (currentPage < pages.length - 1) {
      setCurrentPage(currentPage + 1);
    }
  };

  const prevPage = () => {
    if (currentPage > 0) {
      setCurrentPage(currentPage - 1);
    }
  };

  const goToPage = (pageIndex: number) => {
    setCurrentPage(pageIndex);
  };

  // Render della pagina di copertina
  const renderCoverPage = (content: any) => (
    <div className="h-full flex flex-col justify-center items-center text-center p-8 bg-gradient-to-br from-sage-50 to-blue-gray-50 relative overflow-hidden">
      {/* Decorazioni di sfondo */}
      <div className="absolute inset-0 opacity-5">
        <div className="absolute top-10 left-10">
          <Heart className="h-16 w-16 text-sage-600" />
        </div>
        <div className="absolute bottom-20 right-10">
          <Sparkles className="h-12 w-12 text-blue-gray-600" />
        </div>
        <div className="absolute top-1/2 left-4 transform -translate-y-1/2">
          <BookOpen className="h-20 w-20 text-terracotta-400" />
        </div>
      </div>

      <div className="relative z-10 max-w-lg">
        <div className="mb-6">
          <BookOpen className="h-16 w-16 mx-auto text-sage-600 mb-4" />
          <h1 className="text-4xl md:text-5xl font-playfair font-bold text-blue-gray-900 mb-3">
            {content.title}
          </h1>
          <p className="text-xl text-sage-700 italic font-playfair">
            {content.subtitle}
          </p>
        </div>

        {galleryName && (
          <div className="space-y-3 text-sm text-blue-gray-700">
            <div className="flex items-center justify-center gap-2">
              <Users className="h-4 w-4" />
              <span className="font-medium">{galleryName}</span>
            </div>
            {galleryDate && (
              <div className="flex items-center justify-center gap-2">
                <Calendar className="h-4 w-4" />
                <span>{new Date(galleryDate).toLocaleDateString('it-IT', { 
                  day: 'numeric', 
                  month: 'long', 
                  year: 'numeric' 
                })}</span>
              </div>
            )}
            {galleryLocation && (
              <div className="flex items-center justify-center gap-2">
                <MapPin className="h-4 w-4" />
                <span>{galleryLocation}</span>
              </div>
            )}
          </div>
        )}

        {content.theme && (
          <div className="mt-6">
            <Badge 
              variant="secondary" 
              className="bg-sage-100 text-sage-800 hover:bg-sage-200"
            >
              Tema: {content.theme}
            </Badge>
          </div>
        )}
      </div>
    </div>
  );

  // Render del prologo
  const renderProloguePage = (prologue: any) => (
    <div className="h-full p-8 flex flex-col">
      <div className="text-center mb-8">
        <h2 className="text-3xl font-playfair font-bold text-blue-gray-900 mb-2">
          Prologo
        </h2>
        <div className="w-24 h-0.5 bg-sage-400 mx-auto"></div>
      </div>

      <div className="flex-1 flex items-center justify-center">
        <div className="max-w-2xl">
          <div className="relative">
            <Quote className="absolute -top-4 -left-4 h-8 w-8 text-sage-300" />
            <p className="text-lg leading-relaxed text-blue-gray-800 font-serif italic pl-6">
              {prologue.testo}
            </p>
          </div>
          
          {prologue.tema && (
            <div className="mt-6 text-center">
              <Badge variant="outline" className="border-sage-300 text-sage-700">
                {prologue.tema}
              </Badge>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  // Render di un capitolo
  const renderChapterPage = (chapter: StoryChapter[], title: string) => (
    <div className="h-full p-8">
      <div className="text-center mb-8">
        <h2 className="text-3xl font-playfair font-bold text-blue-gray-900 mb-2">
          {title}
        </h2>
        <div className="w-24 h-0.5 bg-sage-400 mx-auto"></div>
      </div>

      <div className="space-y-8 max-w-4xl mx-auto">
        {chapter.map((section, index) => (
          <div key={index} className="relative">
            <div className="bg-white rounded-lg p-6 shadow-sm border border-sage-100">
              <p className="text-lg leading-relaxed text-blue-gray-800 font-serif">
                {section.testo}
              </p>
              
              {(section.tema || section.posizione || section.uso) && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {section.tema && (
                    <Badge variant="secondary" className="bg-sage-100 text-sage-800">
                      {section.tema}
                    </Badge>
                  )}
                  {section.posizione && (
                    <Badge variant="outline" className="border-blue-gray-300 text-blue-gray-700">
                      📍 {section.posizione}
                    </Badge>
                  )}
                  {section.uso && (
                    <Badge variant="outline" className="border-terracotta-300 text-terracotta-700">
                      💡 {section.uso}
                    </Badge>
                  )}
                </div>
              )}
            </div>
            
            {/* Numero del paragrafo */}
            <div className="absolute -left-4 top-6 w-8 h-8 bg-sage-600 text-white rounded-full flex items-center justify-center text-sm font-medium">
              {index + 1}
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  // Render delle citazioni
  const renderQuotesPage = (quotes: { poetiche: PoeticQuote[], religiose: PoeticQuote[], moderne: PoeticQuote[] }) => (
    <div className="h-full p-8">
      <div className="text-center mb-8">
        <h2 className="text-3xl font-playfair font-bold text-blue-gray-900 mb-2">
          Citazioni & Ispirazioni
        </h2>
        <div className="w-24 h-0.5 bg-terracotta-400 mx-auto"></div>
      </div>

      <div className="space-y-8 max-w-4xl mx-auto">
        {quotes.poetiche.length > 0 && (
          <div>
            <h3 className="text-xl font-playfair font-semibold text-terracotta-800 mb-4 flex items-center gap-2">
              <Sparkles className="h-5 w-5" />
              Citazioni Poetiche
            </h3>
            <div className="grid gap-4 md:grid-cols-2">
              {quotes.poetiche.map((quote, index) => (
                <Card key={index} className="bg-gradient-to-br from-terracotta-50 to-transparent border-terracotta-200">
                  <CardContent className="p-4">
                    <blockquote className="text-sm italic text-blue-gray-700 mb-2">
                      "{quote.testo}"
                    </blockquote>
                    {(quote.autore || quote.fonte) && (
                      <footer className="text-xs text-terracotta-600">
                        {quote.autore && <cite>— {quote.autore}</cite>}
                        {quote.fonte && <span className="ml-2">({quote.fonte})</span>}
                      </footer>
                    )}
                    {quote.uso && (
                      <Badge variant="outline" className="mt-2 border-terracotta-300 text-terracotta-700">
                        {quote.uso}
                      </Badge>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {quotes.religiose.length > 0 && (
          <div>
            <h3 className="text-xl font-playfair font-semibold text-blue-gray-800 mb-4 flex items-center gap-2">
              ✨ Citazioni Religiose
            </h3>
            <div className="grid gap-4 md:grid-cols-2">
              {quotes.religiose.map((quote, index) => (
                <Card key={index} className="bg-gradient-to-br from-blue-gray-50 to-transparent border-blue-gray-200">
                  <CardContent className="p-4">
                    <blockquote className="text-sm italic text-blue-gray-700 mb-2">
                      "{quote.testo}"
                    </blockquote>
                    {(quote.autore || quote.fonte) && (
                      <footer className="text-xs text-blue-gray-600">
                        {quote.autore && <cite>— {quote.autore}</cite>}
                        {quote.fonte && <span className="ml-2">({quote.fonte})</span>}
                      </footer>
                    )}
                    {quote.uso && (
                      <Badge variant="outline" className="mt-2 border-blue-gray-300 text-blue-gray-700">
                        {quote.uso}
                      </Badge>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {quotes.moderne.length > 0 && (
          <div>
            <h3 className="text-xl font-playfair font-semibold text-blue-gray-800 mb-4 flex items-center gap-2">
              💫 Citazioni Moderne
            </h3>
            <div className="grid gap-4 md:grid-cols-2">
              {quotes.moderne.map((quote, index) => (
                <Card key={index} className="bg-gradient-to-br from-terracotta-50 to-transparent border-terracotta-200">
                  <CardContent className="p-4">
                    <blockquote className="text-sm italic text-blue-gray-700 mb-2">
                      "{quote.testo}"
                    </blockquote>
                    {(quote.autore || quote.fonte) && (
                      <footer className="text-xs text-terracotta-600">
                        {quote.autore && <cite>— {quote.autore}</cite>}
                        {quote.fonte && <span className="ml-2">({quote.fonte})</span>}
                      </footer>
                    )}
                    {quote.uso && (
                      <Badge variant="outline" className="mt-2 border-terracotta-300 text-terracotta-700">
                        {quote.uso}
                      </Badge>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  // Render delle note del fotografo
  const renderNotesPage = (notes: string[]) => (
    <div className="h-full p-8">
      <div className="text-center mb-8">
        <h2 className="text-3xl font-playfair font-bold text-blue-gray-900 mb-2">
          Note del Fotografo
        </h2>
        <div className="w-24 h-0.5 bg-terracotta-400 mx-auto"></div>
      </div>

      <div className="max-w-3xl mx-auto space-y-4">
        {notes.map((note, index) => (
          <Card key={index} className="bg-gradient-to-r from-cream-50 to-beige-50 border-beige-200">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 bg-terracotta-400 text-white rounded-full flex items-center justify-center text-xs font-medium flex-shrink-0 mt-1">
                  {index + 1}
                </div>
                <p className="text-blue-gray-800 leading-relaxed">{note}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );

  if (pages.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <BookOpen className="h-12 w-12 text-sage-400 mx-auto mb-4" />
          <p className="text-sage-600">Caricamento storia...</p>
        </div>
      </div>
    );
  }

  const currentPageData = pages[currentPage];

  return (
    <div className="w-full max-w-6xl mx-auto">
      {/* Header del libro con navigazione */}
      <div className="flex items-center justify-between mb-6 bg-white rounded-lg p-4 shadow-sm border border-sage-100">
        <div className="flex items-center gap-4">
          <BookOpen className="h-6 w-6 text-sage-600" />
          <div>
            <h3 className="font-playfair font-semibold text-blue-gray-900">
              {story.metadata?.titolo || 'La Nostra Storia'}
            </h3>
            <p className="text-sm text-sage-600">
              Pagina {currentPage + 1} di {pages.length}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isAdmin && onEdit && (
            <Button
              variant="outline"
              size="sm"
              onClick={onEdit}
              className="border-terracotta-300 text-terracotta-700 hover:bg-terracotta-50"
            >
              Modifica Storia
            </Button>
          )}
          {isAdmin && onDelete && (
            <Button
              variant="outline"
              size="sm"
              onClick={onDelete}
              className="border-red-300 text-red-700 hover:bg-red-50"
            >
              Elimina Storia
            </Button>
          )}
        </div>
      </div>

      {/* Contenuto della pagina con animazioni */}
      <Card className="bg-white shadow-lg border-sage-200 min-h-[600px]">
        <CardContent className="p-0">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentPage}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
              className="min-h-[600px]"
            >
              {currentPageData.type === 'cover' && renderCoverPage(currentPageData.content)}
              {currentPageData.type === 'prologue' && renderProloguePage(currentPageData.content)}
              {currentPageData.type === 'chapter' && renderChapterPage(currentPageData.content, currentPageData.title)}
              {currentPageData.type === 'quotes' && renderQuotesPage(currentPageData.content)}
              {currentPageData.type === 'notes' && renderNotesPage(currentPageData.content)}
            </motion.div>
          </AnimatePresence>
        </CardContent>
      </Card>

      {/* Controlli di navigazione */}
      <div className="flex items-center justify-between mt-6">
        <Button
          variant="outline"
          onClick={prevPage}
          disabled={currentPage === 0}
          className="flex items-center gap-2 border-sage-300 text-sage-700 hover:bg-sage-50 disabled:opacity-50"
        >
          <ChevronLeft className="h-4 w-4" />
          Pagina Precedente
        </Button>

        {/* Indicatori pagina */}
        <div className="flex items-center gap-2">
          {pages.map((_, index) => (
            <button
              key={index}
              onClick={() => goToPage(index)}
              className={`w-3 h-3 rounded-full transition-colors ${
                index === currentPage 
                  ? 'bg-sage-600' 
                  : 'bg-sage-200 hover:bg-sage-300'
              }`}
              aria-label={`Vai alla pagina ${index + 1}`}
            />
          ))}
        </div>

        <Button
          variant="outline"
          onClick={nextPage}
          disabled={currentPage === pages.length - 1}
          className="flex items-center gap-2 border-sage-300 text-sage-700 hover:bg-sage-50 disabled:opacity-50"
        >
          Pagina Successiva
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Indice del libro */}
      <Card className="mt-6 bg-sage-50 border-sage-200">
        <CardContent className="p-4">
          <h4 className="font-playfair font-semibold text-blue-gray-900 mb-3 flex items-center gap-2">
            <BookOpen className="h-4 w-4" />
            Indice
          </h4>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
            {pages.map((page, index) => (
              <button
                key={page.id}
                onClick={() => goToPage(index)}
                className={`text-left p-2 rounded text-sm transition-colors ${
                  index === currentPage
                    ? 'bg-sage-200 text-sage-900 font-medium'
                    : 'text-sage-700 hover:bg-sage-100'
                }`}
              >
                {index + 1}. {page.title}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}