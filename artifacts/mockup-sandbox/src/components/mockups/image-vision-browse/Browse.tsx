import './_group.css';
import { useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, ArrowUpRight, ChevronDown, CirclePlay, Film, Play, X } from 'lucide-react';
import danieleClaudia from './assets/daniele-claudia.jpg';
import gennaroLudovica from './assets/gennaro-ludovica.jpg';
import pasqualeAnita from './assets/pasquale-anita.jpg';

type FilmItem = {
  id: number;
  title: string;
  couple: string;
  place: string;
  duration: string;
  image: string;
  category: string;
  description: string;
  story: string;
  storyTitle: string;
};

const films: FilmItem[] = [
  {
    id: 1, title: 'Una promessa sotto le stelle', couple: 'Daniele & Claudia', place: 'Caserta · 12 ottobre 2024', duration: '8 min 42 sec', image: danieleClaudia, category: 'Emozioni',
    description: 'Una sera d’ottobre, una promessa sussurrata e il cielo di Caserta che si accende di luce. Il loro giorno, senza copione.',
    storyTitle: 'Daniele e Claudia — una festa sotto le stelle',
    story: '«Quando sono partiti i fuochi, ci siamo cercati con lo sguardo. In quel momento c’eravamo solo noi, e tutte le persone che amiamo intorno.» Una giornata elegante e piena di risate, celebrata tra il giardino e le sale di una dimora storica.'
  },
  {
    id: 2, title: 'Dove il tempo si ferma', couple: 'Gennaro & Ludovica', place: 'Napoli · 28 settembre 2024', duration: '10 min 16 sec', image: gennaroLudovica, category: 'Intimi',
    description: 'Tra archi antichi e luce morbida, Gennaro e Ludovica si ritrovano nel silenzio di un abbraccio.',
    storyTitle: 'Gennaro e Ludovica — il tempo di un sì',
    story: '«Ci piaceva l’idea di un matrimonio che ci somigliasse: intimo, pieno di dettagli, con Napoli sempre sullo sfondo.» Una cerimonia raccolta, un cortile di pietra e tutta la dolcezza di un giorno vissuto senza fretta.'
  },
  {
    id: 3, title: 'La felicità ha passi leggeri', couple: 'Pasquale & Anita', place: 'Aversa · 7 settembre 2024', duration: '7 min 58 sec', image: pasqualeAnita, category: 'Feste', 
    description: 'Un pomeriggio luminoso, una corsa improvvisata e la gioia contagiosa di Anita e Pasquale.',
    storyTitle: 'Pasquale e Anita — il giorno più allegro',
    story: '«A un certo punto Pasquale mi ha presa in braccio e non riuscivamo più a smettere di ridere.» Una festa all’aperto, amici vicini e piccoli momenti spontanei diventati il ricordo più bello.'
  },
  {
    id: 4, title: 'Il giardino delle promesse', couple: 'Luca & Martina', place: 'Aversa · 21 giugno 2024', duration: '9 min 12 sec', image: danieleClaudia, category: 'Emozioni',
    description: 'Un racconto luminoso tra alberi secolari, promesse sincere e una festa che non voleva finire.',
    storyTitle: 'Luca e Martina — promesse in giardino',
    story: '«Abbiamo scelto quel giardino perché ci sembrava casa. Tutto il resto è successo da sé.» Una cerimonia all’aperto, fiori di stagione e una lunga tavolata sotto le luci.'
  },
  {
    id: 5, title: 'Tra pietra e mare', couple: 'Andrea & Sofia', place: 'Procida · 15 giugno 2024', duration: '11 min 03 sec', image: gennaroLudovica, category: 'Intimi',
    description: 'La luce del golfo, le strade di Procida e una storia che torna sempre al mare.',
    storyTitle: 'Andrea e Sofia — un’isola per due',
    story: '«Siamo cresciuti guardando il mare. Volevamo che fosse parte del nostro giorno, come lo è di ogni giorno insieme.» Una celebrazione intima tra vicoli colorati e una terrazza sul porto.'
  },
  {
    id: 6, title: 'Tutta la notte davanti', couple: 'Marco & Giulia', place: 'Napoli · 1 giugno 2024', duration: '8 min 35 sec', image: pasqualeAnita, category: 'Feste',
    description: 'Gli ultimi raggi del sole, una pista piena e la sensazione che la notte sia appena cominciata.',
    storyTitle: 'Marco e Giulia — fino all’ultima canzone',
    story: '«La nostra canzone è partita quando nessuno se l’aspettava. Poi sono arrivati tutti gli amici.» Una giornata piena di energia, con una festa che ha trasformato ogni momento in una pista da ballo.'
  },
  {
    id: 7, title: 'La luce che ci somiglia', couple: 'Francesco & Elena', place: 'Caserta · 18 maggio 2024', duration: '9 min 47 sec', image: danieleClaudia, category: 'Emozioni',
    description: 'Un film delicato, fatto di gesti piccoli e di tutte le persone che hanno accompagnato il loro cammino.',
    storyTitle: 'Francesco ed Elena — una luce gentile',
    story: '«Non volevamo pose, volevamo ricordarci davvero.» Una cerimonia intima e un ricevimento pieno di abbracci, raccontati con la naturalezza di una giornata tutta loro.'
  },
  {
    id: 8, title: 'Ritorno a casa', couple: 'Antonio & Chiara', place: 'Aversa · 4 maggio 2024', duration: '7 min 21 sec', image: gennaroLudovica, category: 'Intimi',
    description: 'Un sì nella città in cui tutto è cominciato, con le voci della famiglia a fare da colonna sonora.',
    storyTitle: 'Antonio e Chiara — la strada di casa',
    story: '«Sposarci qui era il nostro modo per dire grazie a chi c’è sempre stato.» Una giornata semplice e autentica, tra i luoghi dell’infanzia e la famiglia riunita.'
  },
  {
    id: 9, title: 'Un’estate tutta nostra', couple: 'Salvatore & Irene', place: 'Caserta · 20 aprile 2024', duration: '10 min 02 sec', image: pasqualeAnita, category: 'Feste',
    description: 'Un pomeriggio d’aprile che sa già d’estate, con abbracci lunghi e brindisi sotto il cielo aperto.',
    storyTitle: 'Salvatore e Irene — la prima estate',
    story: '«Ci siamo promessi di festeggiare ogni traguardo così: con le persone che fanno parte della nostra storia.» Una festa vivace tra ulivi, tavoli all’aperto e brindisi fino a sera.'
  },
];

const shelves = [
  { id: 'featured', eyebrow: 'Una selezione per voi', title: 'Storie da rivivere', ids: [1, 2, 3, 4, 5, 6] },
  { id: 'emotion', eyebrow: 'Sguardi che restano', title: 'Emozioni senza copione', ids: [1, 4, 7, 2, 5] },
  { id: 'celebrations', eyebrow: 'Il bello di esserci', title: 'Feste, abbracci, famiglia', ids: [3, 6, 9, 8, 4] },
];

function Shelf({ title, eyebrow, items, onSelect }: { title: string; eyebrow: string; items: FilmItem[]; onSelect: (film: FilmItem) => void }) {
  const track = useRef<HTMLDivElement>(null);
  const scroll = (direction: number) => track.current?.scrollBy({ left: direction * Math.max(300, (track.current?.clientWidth ?? 600) * 0.72), behavior: 'smooth' });
  return (
    <section className="mb-11 md:mb-14" aria-label={title}>
      <div className="mb-4 flex items-end justify-between px-5 md:px-10">
        <div>
          <p className="mb-1 text-[10px] font-bold uppercase tracking-[.22em] text-[#bf8c78]">{eyebrow}</p>
          <h2 className="text-[22px] leading-tight text-[#f4efe8] md:text-[28px]">{title}</h2>
        </div>
        <div className="hidden gap-2 md:flex">
          <button onClick={() => scroll(-1)} aria-label={`Film precedenti: ${title}`} className="grid h-9 w-9 place-items-center rounded-full border border-white/15 bg-[#1a211e] text-[#d8ded6] transition hover:border-[#aab7a1] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#aab7a1]"><ArrowLeft size={16}/></button>
          <button onClick={() => scroll(1)} aria-label={`Film successivi: ${title}`} className="grid h-9 w-9 place-items-center rounded-full border border-white/15 bg-[#1a211e] text-[#d8ded6] transition hover:border-[#aab7a1] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#aab7a1]"><ArrowRight size={16}/></button>
        </div>
      </div>
      <div ref={track} className="film-shelf flex gap-3 overflow-x-auto px-5 pb-4 md:gap-4 md:px-10" role="list">
        {items.map((film, i) => (
          <button key={`${film.id}-${i}`} type="button" role="listitem" onClick={() => onSelect(film)} aria-label={`Apri ${film.title}, film di ${film.couple}`} className="film-card group relative w-[76vw] max-w-[318px] shrink-0 overflow-hidden rounded-[13px] border border-white/[.08] bg-[#202924] text-left transition duration-300 hover:z-10 hover:-translate-y-1 hover:border-[#aab7a1]/70 focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#aab7a1] sm:w-[43vw] md:w-[31vw] lg:w-[25vw] xl:w-[22vw]">
            <div className="relative aspect-video overflow-hidden">
              <img src={film.image} alt={`Fotogramma del film ${film.title}`} className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.06] group-focus-visible:scale-[1.06]" />
              <div className="absolute inset-0 bg-gradient-to-t from-[#111714]/90 via-transparent to-black/10" />
              <span className="absolute bottom-3 right-3 rounded bg-black/75 px-2 py-1 text-[10px] font-semibold text-white/90">{film.duration}</span>
              <span className="absolute inset-0 grid place-items-center opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"><span className="grid h-12 w-12 place-items-center rounded-full border border-white/60 bg-[#111714]/50 text-white backdrop-blur-sm"><Play size={19} fill="currentColor"/></span></span>
            </div>
            <div className="px-3.5 pb-3 pt-2.5 md:px-4 md:pb-4">
              <h3 className="truncate font-['DM_Sans'] text-[14px] font-bold text-[#f4efe8] md:text-[15px]">{film.title}</h3>
              <p className="mt-1 text-[11px] text-[#c7cec7]/65">{film.couple} <span className="px-1 text-[#bf8c78]">·</span> {film.place.split(' · ')[0]}</p>
              <p className="film-preview mt-2 line-clamp-2 text-[11px] leading-[1.55] text-[#e0e3dc]/80">{film.description}</p>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}

export function Browse() {
  const [selected, setSelected] = useState<FilmItem | null>(null);
  const [playing, setPlaying] = useState(false);
  const [category, setCategory] = useState('Tutti');
  const categories = ['Tutti', 'Emozioni', 'Intimi', 'Feste'];
  const visibleShelves = category === 'Tutti' ? shelves : shelves.filter((shelf) => shelf.id === 'featured' || shelf.ids.some((id) => films.find((film) => film.id === id)?.category === category));
  const filteredFilms = category === 'Tutti' ? films : films.filter((film) => film.category === category);

  return (
    <div className="image-vision-browse min-h-[100dvh] overflow-hidden">
      <header className="relative z-20 flex h-[70px] items-center justify-between border-b border-white/[.06] bg-[#111714]/90 px-5 backdrop-blur-md md:px-10">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-full border border-[#aab7a1]/45 text-[#aab7a1]"><Film size={16}/></span>
          <span className="font-['DM_Sans'] text-[17px] font-extrabold tracking-[-.06em] text-[#f4efe8]">iMaGe <span className="text-[#aab7a1]">VISION</span></span>
        </div>
        <nav className="hidden items-center gap-7 text-[12px] font-semibold text-[#c7cec7]/75 md:flex">
          <a className="text-[#f4efe8]" href="#film">Film</a><a className="transition hover:text-[#aab7a1]" href="#stories">Real Wedding</a><a className="transition hover:text-[#aab7a1]" href="#collection">La raccolta</a>
        </nav>
        <a href="#collection" className="inline-flex items-center gap-2 rounded-md border border-[#aab7a1]/40 px-3.5 py-2 text-[11px] font-bold text-[#e9eee5] transition hover:bg-[#aab7a1]/10 md:px-4">Sfoglia i film <ChevronDown size={13}/></a>
      </header>

      <main>
        <section id="film" className="browse-hero relative isolate flex min-h-[515px] items-end overflow-hidden md:min-h-[600px]">
          <img src={danieleClaudia} alt="" className="absolute inset-0 -z-20 h-full w-full object-cover object-center" />
          <div className="absolute inset-0 -z-10 bg-gradient-to-r from-[#111714] via-[#111714]/70 to-transparent md:via-[#111714]/50" />
          <div className="absolute inset-0 -z-10 bg-gradient-to-t from-[#111714] via-[#111714]/25 to-[#111714]/10" />
          <div className="w-full px-5 pb-12 pt-16 md:px-12 md:pb-16 lg:px-16">
            <div className="max-w-[640px]">
              <p className="mb-4 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.24em] text-[#bf8c78]"><span className="h-px w-7 bg-[#bf8c78]"/>Image Studio presenta</p>
              <h1 className="max-w-[560px] text-[43px] leading-[1.02] tracking-[-.035em] text-[#f4efe8] sm:text-[55px] md:text-[72px]">Image <em className="text-[#aab7a1]">Vision</em></h1>
              <p className="mt-3 text-[11px] font-bold uppercase tracking-[.2em] text-[#f4efe8]/75 md:text-[13px]">Film di matrimonio</p>
              <p className="mt-5 max-w-[490px] text-[13px] leading-6 text-[#d8ded6]/85 md:text-[15px] md:leading-7">I vostri film, raccontati con uno sguardo cinematografico e pronti da rivivere. Storie vere, realizzate ad Aversa, Napoli e Caserta.</p>
              <div className="mt-7 flex flex-wrap gap-3">
                <button onClick={() => { setSelected(films[0]); setPlaying(true); }} className="inline-flex min-h-11 items-center gap-2 rounded-md bg-[#bf806b] px-5 text-[12px] font-bold text-white transition hover:bg-[#a96d5c] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"><Play size={15} fill="currentColor"/> Guarda il film</button>
                <a href="#collection" className="inline-flex min-h-11 items-center gap-2 rounded-md border border-white/20 bg-[#1d2622]/75 px-5 text-[12px] font-bold text-white transition hover:bg-white/10"><CirclePlay size={16}/> Esplora la raccolta</a>
              </div>
              <p className="mt-6 text-[10px] font-semibold tracking-[.12em] text-[#c7cec7]/65">IN PRIMO PIANO <span className="mx-2 text-[#bf8c78]">/</span> DANIELE &amp; CLAUDIA <span className="mx-2">·</span> CASERTA</p>
            </div>
          </div>
        </section>

        <div className="relative z-10 -mt-2 pb-20 pt-7 md:pt-10">
          <div className="mb-8 flex flex-col justify-between gap-4 px-5 md:mb-10 md:flex-row md:items-end md:px-10">
            <div><p className="text-[10px] font-bold uppercase tracking-[.2em] text-[#bf8c78]">Una raccolta di storie vere</p><h2 className="mt-2 text-[25px] text-[#f4efe8] md:text-[32px]">Ogni amore ha il suo film.</h2></div>
            <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Filtra film">
              {categories.map((item) => <button key={item} onClick={() => setCategory(item)} aria-pressed={category === item} className={`shrink-0 rounded-full border px-3.5 py-2 text-[10px] font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#aab7a1] ${category === item ? 'border-[#aab7a1] bg-[#aab7a1] text-[#111714]' : 'border-white/15 text-[#d8ded6]/75 hover:border-[#aab7a1]/60 hover:text-white'}`}>{item}</button>)}
            </div>
          </div>

              {visibleShelves.map((shelf) => <Shelf key={`${shelf.id}-${category}`} title={shelf.title} eyebrow={shelf.eyebrow} items={shelf.ids.map((id) => films.find((film) => film.id === id)!).filter((film) => category === 'Tutti' || film.category === category)} onSelect={(film) => { setSelected(film); setPlaying(false); }}/>)}

          <section id="collection" className="mx-5 mt-3 border-t border-white/[.08] pt-8 md:mx-10">
            <div className="mb-5 flex items-end justify-between"><div><p className="text-[10px] font-bold uppercase tracking-[.2em] text-[#bf8c78]">La raccolta</p><h2 className="mt-1 text-[22px] text-[#f4efe8]">Tutti i film</h2></div><span className="text-[11px] text-[#aab7a1]">{filteredFilms.length} storie</span></div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {filteredFilms.map((film) => <button key={film.id} onClick={() => { setSelected(film); setPlaying(false); }} className="group overflow-hidden rounded-lg border border-white/[.08] bg-[#1a211e] text-left transition hover:-translate-y-1 hover:border-[#aab7a1]/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#aab7a1]">
                <div className="relative aspect-video overflow-hidden"><img src={film.image} alt={`Fotogramma: ${film.couple}`} className="h-full w-full object-cover transition duration-500 group-hover:scale-105"/><span className="absolute bottom-2 right-2 rounded bg-black/75 px-1.5 py-1 text-[9px]">{film.duration}</span></div>
                <div className="p-3"><h3 className="truncate font-['DM_Sans'] text-[12px] font-bold">{film.title}</h3><p className="mt-1 text-[10px] text-[#c7cec7]/60">{film.couple}</p></div>
              </button>)}
            </div>
          </section>
          <section id="stories" className="mx-5 mt-12 rounded-xl border border-[#aab7a1]/20 bg-[#1a211e] p-5 md:mx-10 md:flex md:items-center md:justify-between md:p-8">
            <div><p className="text-[10px] font-bold uppercase tracking-[.2em] text-[#aab7a1]">Dal film alla storia</p><h2 className="mt-2 text-[22px] text-[#f4efe8]">Dietro ogni immagine, una storia vera.</h2><p className="mt-2 max-w-xl text-[12px] leading-6 text-[#c7cec7]/70">Ritrovate i dettagli, le parole e i luoghi del giorno che ha dato vita al vostro film.</p></div>
            <button onClick={() => { setSelected(films[1]); setPlaying(false); }} className="mt-5 inline-flex min-h-11 shrink-0 items-center gap-2 rounded-md border border-[#aab7a1]/40 px-4 text-[11px] font-bold text-[#e8ece4] transition hover:bg-[#aab7a1]/10 md:ml-8 md:mt-0">Scopri un Real Wedding <ArrowUpRight size={14}/></button>
          </section>
        </div>
      </main>

      {selected && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 p-0 backdrop-blur-sm sm:items-center sm:p-5" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) { setSelected(null); setPlaying(false); } }}>
          <section role="dialog" aria-modal="true" aria-labelledby="film-title" className="relative max-h-[94dvh] w-full max-w-[900px] overflow-y-auto rounded-t-2xl border border-white/10 bg-[#151d19] shadow-2xl sm:rounded-2xl">
            <button onClick={() => { setSelected(null); setPlaying(false); }} aria-label="Chiudi dettagli" className="absolute right-3 top-3 z-20 grid h-9 w-9 place-items-center rounded-full bg-black/60 text-white transition hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#aab7a1]"><X size={18}/></button>
            <div className="relative aspect-video max-h-[45vh] overflow-hidden bg-black">
              {playing ? <div className="absolute inset-0 grid place-items-center bg-[#111714]"><div className="text-center"><CirclePlay className="mx-auto mb-3 text-[#aab7a1]" size={48}/><p className="font-['DM_Sans'] text-lg font-bold">Anteprima del film</p><p className="mt-1 text-xs text-[#c7cec7]/65">La riproduzione completa sarà disponibile qui</p></div></div> : <><img src={selected.image} alt={`Film di matrimonio: ${selected.title}`} className="h-full w-full object-cover"/><div className="absolute inset-0 bg-gradient-to-t from-[#151d19] via-transparent to-black/10"/></>}
            </div>
            <div className="grid gap-7 px-5 pb-7 pt-2 md:grid-cols-[1.15fr_.85fr] md:px-8 md:pb-9">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[.18em] text-[#bf8c78]">Image Vision · Film di matrimonio</p>
                <h2 id="film-title" className="mt-2 text-[27px] leading-tight text-[#f4efe8] md:text-[34px]">{selected.title}</h2>
                <p className="mt-2 text-[11px] font-semibold text-[#aab7a1]">{selected.couple} <span className="px-1 text-[#bf8c78]">·</span> {selected.place} <span className="px-1 text-[#bf8c78]">·</span> {selected.duration}</p>
                <p className="mt-4 text-[13px] leading-6 text-[#d8ded6]/80">{selected.description}</p>
                <button onClick={() => setPlaying((state) => !state)} className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-md bg-[#bf806b] px-5 text-[12px] font-bold text-white transition hover:bg-[#a96d5c] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"><Play size={15} fill="currentColor"/>{playing ? 'Riavvia il film' : 'Riproduci il film'}</button>
              </div>
              <aside className="rounded-xl border border-[#aab7a1]/20 bg-[#aab7a1]/[.055] p-4 md:p-5">
                <p className="text-[9px] font-bold uppercase tracking-[.2em] text-[#aab7a1]">La storia dietro il film</p>
                <h3 className="mt-2 text-[17px] leading-snug text-[#f4efe8]">{selected.storyTitle}</h3>
                <p className="mt-3 text-[12px] leading-[1.75] text-[#d8ded6]/75">{selected.story}</p>
                <a href={`/real-wedding/${selected.couple.toLocaleLowerCase('it-IT').replaceAll(' ', '-')}`} onClick={() => setSelected(null)} className="mt-4 inline-flex min-h-10 items-center gap-2 border-t border-[#aab7a1]/15 pt-3 text-[11px] font-bold text-[#aab7a1] transition hover:text-[#d5dfcc] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#aab7a1]">Leggi il Real Wedding completo <ArrowUpRight size={14}/></a>
              </aside>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

export default Browse;
