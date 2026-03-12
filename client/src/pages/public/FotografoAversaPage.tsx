import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { useSEO } from "@/hooks/useSEO";
import { Camera, Video, Image, MapPin, Phone, Mail, Star, Check, ChevronRight } from "lucide-react";

export default function FotografoAversaPage() {
  useSEO({
    title: "Fotografo Aversa | Matrimoni, Battesimi, Cerimonie | Image Studio",
    description: "Fotografo professionista ad Aversa per matrimoni, battesimi e cerimonie. Gennaro Mazzacane di Image Studio: 10+ anni di esperienza, 500+ matrimoni. Senza costi di trasferta nell'agro aversano.",
    canonical: "/fotografo-aversa",
    keywords: "fotografo Aversa, fotografo matrimoni Aversa, fotografo battesimi Aversa, fotografo cerimonie Aversa, fotografo agro aversano, fotografo Sant'Arpino, fotografo Succivo",
  });

  const comuni = [
    "Aversa", "Sant'Arpino", "Succivo", "Casal di Principe", "Frignano",
    "Parete", "Carinaro", "Lusciano", "Teverola", "San Marcellino",
    "Villa di Briano", "Orta di Atella", "Trentola-Ducenta", "Gricignano di Aversa",
    "Cesa", "Giugliano in Campania", "Marano di Napoli", "Qualiano"
  ];

  const servizi = [
    {
      icon: <Camera className="h-8 w-8 text-terracotta" />,
      titolo: "Fotografia Matrimoni",
      descrizione: "Reportage emozionale completo dalla preparazione alla festa. Stile documentaristico ed elegante.",
      href: "/portfolio/matrimonio"
    },
    {
      icon: <Image className="h-8 w-8 text-terracotta" />,
      titolo: "Battesimi e Cerimonie",
      descrizione: "Battesimi, comunioni e cresime documentati con cura e sensibilità per ogni famiglia.",
      href: "/portfolio/battesimo"
    },
    {
      icon: <Video className="h-8 w-8 text-terracotta" />,
      titolo: "Video iMaGe Vision",
      descrizione: "Film matrimoniali cinematografici ad alta qualità che rivivono la tua storia per sempre.",
      href: "/vision"
    },
  ];

  const pacchetti = [
    {
      nome: "Essenziale",
      prezzo: "da €2.000",
      descrizione: "Ideale per cerimonie e ricevimenti fino a 6 ore",
      incluso: ["Reportage fotografico completo", "Galleria digitale Memorie Sospese", "Consegna entro 12 settimane", "File ad alta risoluzione"]
    },
    {
      nome: "Premium",
      prezzo: "da €2.800",
      descrizione: "Il pacchetto più scelto per matrimoni completi",
      incluso: ["Reportage fotografico completo", "Album fotografico professionale", "Galleria digitale Memorie Sospese", "Consegna entro 10 settimane", "File ad alta risoluzione", "Seconda fotografa inclusa"],
      highlight: true
    },
    {
      nome: "Luxury",
      prezzo: "da €3.500",
      descrizione: "Esperienza fotografica e video completa",
      incluso: ["Reportage fotografico completo", "Video iMaGe Vision", "Album fotografico premium", "Galleria digitale Memorie Sospese", "Seconda fotografa inclusa", "Drone (se consentito)", "Consegna prioritaria"]
    }
  ];

  const faq = [
    {
      domanda: "Quanto costa un fotografo di matrimonio ad Aversa?",
      risposta: "I nostri pacchetti partono da €2.000. Non è previsto alcun costo di trasferta per matrimoni nell'area di Aversa e nella provincia di Caserta e Napoli. Contattaci per un preventivo personalizzato e gratuito."
    },
    {
      domanda: "In quali comuni operate senza costi di trasferta?",
      risposta: "Operiamo senza trasferta ad Aversa e in tutti i comuni dell'agro aversano: Sant'Arpino, Succivo, Casal di Principe, Frignano, Parete, Carinaro, Lusciano, Teverola, San Marcellino, Giugliano e tutta la provincia di Caserta e Napoli."
    },
    {
      domanda: "Fotografate anche battesimi e comunioni ad Aversa?",
      risposta: "Sì, offriamo servizi fotografici professionali per battesimi, comunioni e cresime ad Aversa e nei comuni limitrofi. Contattaci per verificare disponibilità."
    },
    {
      domanda: "Come si prenota una consulenza gratuita?",
      risposta: "Puoi prenotare una consulenza gratuita direttamente online nella sezione Consulenze. Offriamo incontri di persona ad Aversa o in videocall per discutere le tue esigenze."
    },
    {
      domanda: "Entro quando vengono consegnate le foto?",
      risposta: "La consegna della galleria digitale avviene entro 10-12 settimane dalla data dell'evento, a seconda del pacchetto scelto."
    }
  ];

  return (
    <div className="min-h-screen bg-white font-sans">
      {/* Hero */}
      <section className="relative bg-gradient-to-br from-[#2C3A2C] to-[#4A5E4A] text-white py-24 px-4">
        <div className="max-w-5xl mx-auto text-center">
          <div className="flex items-center justify-center gap-2 mb-4 text-[#c4724a]/80 text-sm font-medium tracking-widest uppercase">
            <MapPin className="h-4 w-4" />
            <span>Aversa (CE) · Campania · Italia</span>
          </div>
          <h1 className="text-4xl md:text-6xl font-playfair mb-6 leading-tight">
            Fotografo ad Aversa
          </h1>
          <p className="text-xl md:text-2xl text-white/80 mb-4 max-w-3xl mx-auto">
            <span className="text-[#c4724a] font-semibold">Gennaro Mazzacane</span> · Image Studio
          </p>
          <p className="text-lg text-white/70 mb-10 max-w-2xl mx-auto">
            Matrimoni, battesimi e cerimonie nell'agro aversano e in tutta la Campania.
            Oltre 10 anni di esperienza, 500+ matrimoni documentati.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/consulenze">
              <Button className="bg-[#c4724a] hover:bg-[#a85d3b] text-white px-8 py-6 text-lg rounded-full">
                Consulenza Gratuita
                <ChevronRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
            <Link href="/portfolio">
              <Button variant="outline" className="border-white/40 text-white hover:bg-white/10 px-8 py-6 text-lg rounded-full bg-transparent">
                Guarda il Portfolio
              </Button>
            </Link>
          </div>
          <div className="flex items-center justify-center gap-8 mt-12 text-white/60 text-sm">
            <div className="flex items-center gap-1">
              <Star className="h-4 w-4 fill-[#c4724a] text-[#c4724a]" />
              <span>5.0 · 150+ recensioni</span>
            </div>
            <div>500+ matrimoni</div>
            <div>10+ anni esperienza</div>
          </div>
        </div>
      </section>

      {/* Servizi */}
      <section className="py-20 px-4 bg-[#F5EFE6]/30">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-playfair text-center text-[#2C3A2C] mb-4">
            Servizi Fotografici ad Aversa
          </h2>
          <p className="text-center text-gray-600 mb-12 max-w-2xl mx-auto">
            Dalla cerimonia al ricevimento, documentiamo ogni momento con cura e passione.
          </p>
          <div className="grid md:grid-cols-3 gap-8">
            {servizi.map((s) => (
              <Link key={s.titolo} href={s.href}>
                <div className="bg-white rounded-2xl p-8 shadow-sm hover:shadow-md transition-shadow cursor-pointer group border border-gray-100">
                  <div className="mb-5">{s.icon}</div>
                  <h3 className="text-xl font-playfair text-[#2C3A2C] mb-3 group-hover:text-[#c4724a] transition-colors">
                    {s.titolo}
                  </h3>
                  <p className="text-gray-600 text-sm leading-relaxed">{s.descrizione}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Pacchetti Prezzi */}
      <section className="py-20 px-4">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-playfair text-center text-[#2C3A2C] mb-4">
            Pacchetti e Prezzi
          </h2>
          <p className="text-center text-gray-600 mb-12">
            Nessun costo di trasferta per matrimoni ad Aversa e provincia.
          </p>
          <div className="grid md:grid-cols-3 gap-6">
            {pacchetti.map((p) => (
              <div
                key={p.nome}
                className={`rounded-2xl p-8 border-2 flex flex-col ${
                  p.highlight
                    ? "border-[#c4724a] bg-[#c4724a]/5 shadow-lg relative"
                    : "border-gray-200 bg-white"
                }`}
              >
                {p.highlight && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#c4724a] text-white text-xs font-semibold px-4 py-1 rounded-full">
                    Più scelto
                  </div>
                )}
                <h3 className="text-2xl font-playfair text-[#2C3A2C] mb-1">{p.nome}</h3>
                <p className="text-3xl font-bold text-[#c4724a] mb-2">{p.prezzo}</p>
                <p className="text-sm text-gray-500 mb-6">{p.descrizione}</p>
                <ul className="space-y-2 flex-1">
                  {p.incluso.map((item) => (
                    <li key={item} className="flex items-start gap-2 text-sm text-gray-600">
                      <Check className="h-4 w-4 text-[#6b7f6b] mt-0.5 flex-shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
                <Link href="/consulenze">
                  <Button
                    className={`w-full mt-6 rounded-full ${
                      p.highlight
                        ? "bg-[#c4724a] hover:bg-[#a85d3b] text-white"
                        : "bg-[#2C3A2C] hover:bg-[#1a231a] text-white"
                    }`}
                  >
                    Richiedi Preventivo
                  </Button>
                </Link>
              </div>
            ))}
          </div>
          <p className="text-center text-sm text-gray-500 mt-6">
            I prezzi sono indicativi. Ogni preventivo è personalizzato in base alle tue esigenze.
          </p>
        </div>
      </section>

      {/* Comuni Serviti */}
      <section className="py-20 px-4 bg-[#2C3A2C] text-white">
        <div className="max-w-5xl mx-auto text-center">
          <MapPin className="h-8 w-8 text-[#c4724a] mx-auto mb-4" />
          <h2 className="text-3xl md:text-4xl font-playfair mb-4">
            Comuni Serviti
          </h2>
          <p className="text-white/70 mb-10">
            Fotografia professionale nell'agro aversano senza costi di trasferta.
          </p>
          <div className="flex flex-wrap justify-center gap-3 mb-10">
            {comuni.map((comune) => (
              <span
                key={comune}
                className="bg-white/10 hover:bg-white/20 transition-colors px-4 py-2 rounded-full text-sm text-white/90"
              >
                {comune}
              </span>
            ))}
          </div>
          <p className="text-white/60 text-sm">
            Disponibili anche per Napoli, Caserta, Salerno, Costiera Amalfitana e tutta Italia.
          </p>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-20 px-4 bg-[#F5EFE6]/30">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-playfair text-center text-[#2C3A2C] mb-12">
            Domande Frequenti
          </h2>
          <div className="space-y-6">
            {faq.map((f) => (
              <div key={f.domanda} className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
                <h3 className="font-semibold text-[#2C3A2C] mb-2">{f.domanda}</h3>
                <p className="text-gray-600 text-sm leading-relaxed">{f.risposta}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Contatti */}
      <section className="py-20 px-4 bg-white">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-playfair text-[#2C3A2C] mb-4">
            Parliamoci
          </h2>
          <p className="text-gray-600 mb-10 text-lg">
            Raccontaci il tuo evento. Offriamo una consulenza gratuita di persona ad Aversa o in videocall.
          </p>
          <div className="flex flex-col sm:flex-row gap-6 justify-center mb-10">
            <a
              href="tel:+393347103142"
              className="flex items-center gap-3 bg-[#F5EFE6] hover:bg-[#ede4d5] transition-colors px-6 py-4 rounded-2xl text-[#2C3A2C] font-medium"
            >
              <Phone className="h-5 w-5 text-[#c4724a]" />
              +39 334 710 3142
            </a>
            <a
              href="mailto:info@memoriesospese.it"
              className="flex items-center gap-3 bg-[#F5EFE6] hover:bg-[#ede4d5] transition-colors px-6 py-4 rounded-2xl text-[#2C3A2C] font-medium"
            >
              <Mail className="h-5 w-5 text-[#c4724a]" />
              info@memoriesospese.it
            </a>
          </div>
          <Link href="/consulenze">
            <Button className="bg-[#c4724a] hover:bg-[#a85d3b] text-white px-10 py-6 text-lg rounded-full">
              Prenota Consulenza Gratuita
              <ChevronRight className="ml-2 h-5 w-5" />
            </Button>
          </Link>
          <p className="text-gray-400 text-sm mt-6">
            <Link href="/" className="hover:text-[#c4724a] transition-colors">
              ← Torna alla Homepage
            </Link>
          </p>
        </div>
      </section>
    </div>
  );
}
