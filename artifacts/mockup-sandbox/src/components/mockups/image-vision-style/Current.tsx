import { Camera } from 'lucide-react';
import danieleThumbnail from './assets/daniele-claudia.jpg';
import gennaroThumbnail from './assets/gennaro-ludovica.jpg';
import pasqualeThumbnail from './assets/pasquale-anita.jpg';
import './_group.css';

const videos = [
  { title: 'Daniele e Claudia', category: 'Matrimoni', thumbnailUrl: danieleThumbnail },
  { title: 'Matrimonio Gennaro e Ludovica', category: 'Matrimoni', thumbnailUrl: gennaroThumbnail },
  { title: 'Pasquale e Anita', category: 'Matrimoni', thumbnailUrl: pasqualeThumbnail },
];

export function Current() {
  return (
    <section className="image-vision-preview min-h-screen bg-gradient-to-b from-gray-900 via-gray-800 to-black px-4 py-12 text-white sm:py-16 md:py-20">
      <div className="mx-auto max-w-7xl">
        <header className="mb-8 text-center sm:mb-10 md:mb-12">
          <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-terracotta/20">
            <Camera className="h-8 w-8 text-terracotta" />
          </div>
          <h2
            className="mb-3 text-3xl font-black uppercase tracking-tight sm:mb-4 sm:text-4xl md:text-5xl"
            style={{ fontFamily: 'Impact, "Arial Black", sans-serif' }}
          >
            iMaGe Vision
          </h2>
          <p className="text-base text-gray-300 sm:text-lg md:text-xl">
            I nostri ultimi video: emozioni in movimento
          </p>
        </header>

        <div className="mb-8 grid gap-6 md:grid-cols-3 sm:gap-8">
          {videos.map((video) => (
            <a key={video.title} href="#vision" className="group block">
              <article className="cursor-pointer overflow-hidden rounded-xl bg-gray-800 transition-all duration-300 hover:-translate-y-1 hover:bg-gray-700 hover:shadow-2xl">
                <div className="relative aspect-video overflow-hidden">
                  <img
                    src={video.thumbnailUrl}
                    alt={video.title}
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                  />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/90">
                      <div className="ml-1 h-0 w-0 border-b-[12px] border-l-[20px] border-t-[12px] border-b-transparent border-l-terracotta border-t-transparent" />
                    </div>
                  </div>
                </div>
                <div className="p-4">
                  <h3 className="mb-2 line-clamp-2 font-semibold text-white transition-colors group-hover:text-terracotta">
                    {video.title}
                  </h3>
                  <span className="text-xs text-gray-400">{video.category}</span>
                </div>
              </article>
            </a>
          ))}
        </div>

        <div className="text-center">
          <a
            href="#vision"
            className="inline-flex h-auto max-w-full items-center whitespace-normal rounded-md bg-terracotta px-5 py-3 text-center font-medium leading-snug text-white shadow-lg transition-all hover:bg-terracotta/90 hover:shadow-xl"
          >
            <Camera className="mr-2 h-5 w-5 shrink-0" />
            Scopri tutti i Video
          </a>
        </div>
      </div>
    </section>
  );
}
