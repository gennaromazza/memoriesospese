import { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { Camera, Heart, Shield, Zap, Users, Download, FileText, Crown, Check, Star } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { createUrl } from '../lib/basePath';

export default function Landing() {
  const [, navigate] = useLocation();

  const features = [
    {
      icon: <Camera className="h-8 w-8 text-sage-600" />,
      title: "Gallerie Private Sicure",
      description: "Crea gallerie protette da password per ogni matrimonio. I tuoi clienti accedono facilmente ai loro ricordi speciali."
    },
    {
      icon: <Heart className="h-8 w-8 text-sage-600" />,
      title: "Interazioni Sociali",
      description: "Gli ospiti possono mettere like, commentare e condividere i loro momenti preferiti, creando un'esperienza coinvolgente."
    },
    {
      icon: <Shield className="h-8 w-8 text-sage-600" />,
      title: "Upload Ospiti Controllato",
      description: "Permetti agli ospiti di caricare le loro foto mantenendo il controllo totale sulla tua galleria professionale."
    },
    {
      icon: <Zap className="h-8 w-8 text-sage-600" />,
      title: "Voice Memos Privati",
      description: "Funzionalità unica per registrare messaggi vocali privati agli sposi, sbloccabili in momenti speciali."
    },
    {
      icon: <Users className="h-8 w-8 text-sage-600" />,
      title: "Gestione Clienti",
      description: "Dashboard completa per gestire tutti i tuoi matrimoni, clienti e gallerie in un unico posto."
    },
    {
      icon: <Download className="h-8 w-8 text-sage-600" />,
      title: "Download e Export",
      description: "Scarica gallerie complete in ZIP e esporta dati clienti in CSV per la tua gestione aziendale."
    }
  ];

  const plans = [
    {
      name: "Free",
      price: "0€",
      period: "sempre",
      description: "Perfetto per iniziare",
      features: [
        "2 gallerie attive",
        "10 foto per galleria",
        "Upload ospiti",
        "Interazioni base",
        "Voice memos"
      ],
      limitations: [
        "Watermark Memorie Sospese",
        "No download ZIP",
        "No export CSV"
      ],
      cta: "Inizia Gratis",
      popular: false
    },
    {
      name: "Starter",
      price: "9€",
      period: "mese",
      description: "Per fotografi emergenti",
      features: [
        "5 gallerie attive",
        "5.000 foto per galleria",
        "Upload ospiti illimitato",
        "Tutte le interazioni sociali",
        "Voice memos avanzati",
        "Supporto email"
      ],
      limitations: [
        "Watermark Memorie Sospese",
        "No download ZIP",
        "No export CSV"
      ],
      cta: "Scegli Starter",
      popular: false
    },
    {
      name: "Pro",
      price: "29€",
      period: "mese",
      description: "Per professionisti attivi",
      features: [
        "Gallerie illimitate",
        "25.000 foto per galleria",
        "Upload ospiti illimitato",
        "Tutte le interazioni sociali",
        "Voice memos premium",
        "Watermark personalizzato",
        "Export CSV clienti",
        "Supporto prioritario"
      ],
      limitations: [
        "No download ZIP"
      ],
      cta: "Scegli Pro",
      popular: true
    },
    {
      name: "Premium",
      price: "49€",
      period: "mese",
      description: "Per studi fotografici",
      features: [
        "Tutto illimitato",
        "Foto illimitate per galleria",
        "Upload ospiti illimitato",
        "Tutte le funzionalità sociali",
        "Voice memos premium",
        "Watermark personalizzato",
        "Download ZIP gallerie complete",
        "Export CSV avanzato",
        "Supporto prioritario 24/7",
        "Gestione multi-utente"
      ],
      limitations: [],
      cta: "Scegli Premium",
      popular: false
    }
  ];

  const testimonials = [
    {
      name: "Marco Rossi",
      role: "Wedding Photographer",
      content: "Memorie Sospese ha rivoluzionato il mio business. I miei clienti adorano l'esperienza interattiva e io ho tutto sotto controllo.",
      rating: 5
    },
    {
      name: "Elena Bianchi",
      role: "Studio Fotografico",
      content: "Finalmente una piattaforma pensata per noi fotografi. La gestione delle gallerie è semplice e i clienti sono entusiasti.",
      rating: 5
    },
    {
      name: "Alessandro Verde",
      role: "Fotografo Freelance",
      content: "I voice memos sono un tocco geniale. Ogni matrimonio diventa un'esperienza unica e memorabile per gli sposi.",
      rating: 5
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-off-white via-sage-50 to-blue-gray-50">
      {/* Navigation */}
      <nav className="bg-white/80 backdrop-blur-sm border-b border-sage-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-gradient-to-r from-sage-600 to-blue-gray-600 rounded-lg flex items-center justify-center">
                <Camera className="h-6 w-6 text-white" />
              </div>
              <span className="text-xl font-bold text-blue-gray-900 hidden sm:inline">Memorie Sospese</span>
              <span className="text-lg font-bold text-blue-gray-900 sm:hidden">MS</span>
            </div>
            <div className="hidden md:flex items-center space-x-4">
              <Link href={createUrl('/pricing')}>
                <Button variant="ghost" className="text-blue-gray-700 hover:text-sage-600">
                  Prezzi
                </Button>
              </Link>
              <Link href={createUrl('/photographer-login')}>
                <Button variant="outline" className="border-sage-300 text-sage-700 hover:bg-sage-50">
                  Accedi
                </Button>
              </Link>
              <Link href={createUrl('/photographer-register')}>
                <Button className="bg-gradient-to-r from-sage-600 to-blue-gray-600 hover:from-sage-700 hover:to-blue-gray-700">
                  Inizia Gratis
                </Button>
              </Link>
            </div>
            <div className="md:hidden">
              <Link href={createUrl('/photographer-register')}>
                <Button size="sm" className="bg-gradient-to-r from-sage-600 to-blue-gray-600 hover:from-sage-700 hover:to-blue-gray-700">
                  Registrati
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="py-12 sm:py-20 px-4">
        <div className="max-w-7xl mx-auto text-center">
          <Badge variant="outline" className="mb-6 px-4 sm:px-6 py-2 text-sage-700 border-sage-300 text-sm sm:text-base">
            Nuova piattaforma per fotografi di matrimonio
          </Badge>
          <h1 className="text-3xl sm:text-5xl md:text-7xl font-bold text-blue-gray-900 mb-6 leading-tight">
            Le Tue Foto di Matrimonio
            <br />
            <span className="bg-gradient-to-r from-sage-600 to-blue-gray-600 bg-clip-text text-transparent">
              Mai Così Coinvolgenti
            </span>
          </h1>
          <p className="text-lg sm:text-xl text-blue-gray-600 mb-8 max-w-3xl mx-auto leading-relaxed px-4">
            Crea gallerie interattive che trasformano ogni matrimonio in un'esperienza sociale unica. 
            I tuoi clienti e i loro ospiti vivranno i ricordi come mai prima d'ora.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center px-4">
            <Button 
              size="lg" 
              className="bg-gradient-to-r from-sage-600 to-blue-gray-600 hover:from-sage-700 hover:to-blue-gray-700 px-6 sm:px-8 py-3 text-base sm:text-lg"
              onClick={() => navigate(createUrl('/photographer-register'))}
            >
              Inizia Gratis per 30 Giorni
            </Button>
            <Button 
              size="lg" 
              variant="outline" 
              className="border-sage-300 text-sage-700 hover:bg-sage-50 px-6 sm:px-8 py-3 text-base sm:text-lg"
              onClick={() => navigate(createUrl('/demo'))}
            >
              Vedi Demo Live
            </Button>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-12 sm:py-20 px-4 bg-white">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12 sm:mb-16">
            <h2 className="text-2xl sm:text-4xl font-bold text-blue-gray-900 mb-4">
              Tutto Quello Che Serve al Tuo Business
            </h2>
            <p className="text-lg sm:text-xl text-blue-gray-600 max-w-3xl mx-auto px-4">
              Funzionalità pensate specificamente per fotografi di matrimonio che vogliono offrire un'esperienza premium
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
            {features.map((feature, index) => (
              <Card key={index} className="border-sage-200 hover:shadow-lg transition-all duration-300 hover:border-sage-300">
                <CardHeader>
                  <div className="mb-4">{feature.icon}</div>
                  <CardTitle className="text-xl text-blue-gray-900">{feature.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-blue-gray-600">{feature.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section className="py-12 sm:py-20 px-4 bg-gradient-to-br from-sage-50 to-blue-gray-50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12 sm:mb-16">
            <h2 className="text-2xl sm:text-4xl font-bold text-blue-gray-900 mb-4">
              Prezzi Trasparenti per Ogni Esigenza
            </h2>
            <p className="text-lg sm:text-xl text-blue-gray-600 max-w-3xl mx-auto px-4">
              Dal fotografo emergente allo studio affermato, c'è un piano perfetto per te
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-8">
            {plans.map((plan, index) => (
              <Card 
                key={index} 
                className={`relative border-2 transition-all duration-300 hover:shadow-lg ${
                  plan.popular 
                    ? 'border-sage-400 shadow-lg scale-105' 
                    : 'border-sage-200 hover:border-sage-300'
                }`}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                    <Badge className="bg-gradient-to-r from-sage-600 to-blue-gray-600 text-white px-4 py-1">
                      <Star className="w-3 h-3 mr-1" />
                      Più Popolare
                    </Badge>
                  </div>
                )}
                <CardHeader className="text-center">
                  <CardTitle className="text-2xl text-blue-gray-900">{plan.name}</CardTitle>
                  <div className="text-4xl font-bold text-sage-600 mb-2">
                    {plan.price}
                    <span className="text-lg text-blue-gray-500">/{plan.period}</span>
                  </div>
                  <p className="text-blue-gray-600">{plan.description}</p>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    {plan.features.map((feature, idx) => (
                      <div key={idx} className="flex items-center text-sm">
                        <Check className="h-4 w-4 text-sage-600 mr-2 flex-shrink-0" />
                        <span className="text-blue-gray-700">{feature}</span>
                      </div>
                    ))}
                  </div>
                  {plan.limitations.length > 0 && (
                    <div className="border-t border-sage-200 pt-4 space-y-2">
                      {plan.limitations.map((limitation, idx) => (
                        <div key={idx} className="flex items-center text-sm text-blue-gray-500">
                          <span className="mr-2">✗</span>
                          <span>{limitation}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <Button 
                    className={`w-full mt-6 ${
                      plan.popular 
                        ? 'bg-gradient-to-r from-sage-600 to-blue-gray-600 hover:from-sage-700 hover:to-blue-gray-700' 
                        : 'bg-sage-600 hover:bg-sage-700'
                    }`}
                    onClick={() => navigate(createUrl('/register'))}
                  >
                    {plan.cta}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-12 sm:py-20 px-4 bg-white">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12 sm:mb-16">
            <h2 className="text-2xl sm:text-4xl font-bold text-blue-gray-900 mb-4">
              Cosa Dicono i Fotografi
            </h2>
            <p className="text-lg sm:text-xl text-blue-gray-600">
              Storie di successo dai nostri clienti
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
            {testimonials.map((testimonial, index) => (
              <Card key={index} className="border-sage-200 hover:shadow-lg transition-all duration-300">
                <CardHeader>
                  <div className="flex items-center space-x-1 mb-2">
                    {[...Array(testimonial.rating)].map((_, i) => (
                      <Star key={i} className="h-4 w-4 fill-sage-500 text-sage-500" />
                    ))}
                  </div>
                  <CardTitle className="text-lg text-blue-gray-900">{testimonial.name}</CardTitle>
                  <p className="text-sage-600">{testimonial.role}</p>
                </CardHeader>
                <CardContent>
                  <p className="text-blue-gray-600 italic">"{testimonial.content}"</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-12 sm:py-20 px-4 bg-gradient-to-r from-sage-600 to-blue-gray-600">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-2xl sm:text-4xl font-bold text-white mb-4">
            Pronto a Trasformare il Tuo Business?
          </h2>
          <p className="text-lg sm:text-xl text-sage-100 mb-8 px-4">
            Unisciti a centinaia di fotografi che hanno già scelto Memorie Sospese
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center px-4">
            <Button 
              size="lg" 
              className="bg-white text-sage-600 hover:bg-sage-50 px-6 sm:px-8 py-3 text-base sm:text-lg font-semibold"
              onClick={() => navigate(createUrl('/photographer-register'))}
            >
              Inizia la Prova Gratuita
            </Button>
            <Button 
              size="lg" 
              variant="outline" 
              className="border-white text-white hover:bg-white hover:text-sage-600 px-6 sm:px-8 py-3 text-base sm:text-lg"
              onClick={() => navigate(createUrl('/contact'))}
            >
              Contatta il Team
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-blue-gray-900 text-white py-12 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-4 gap-8">
            <div>
              <div className="flex items-center space-x-3 mb-4">
                <div className="w-8 h-8 bg-gradient-to-r from-sage-600 to-blue-gray-600 rounded-lg flex items-center justify-center">
                  <Camera className="h-5 w-5 text-white" />
                </div>
                <span className="text-lg font-bold">Memorie Sospese</span>
              </div>
              <p className="text-blue-gray-300 text-sm">
                La piattaforma per fotografi di matrimonio che trasforma ogni evento in un'esperienza sociale unica.
              </p>
            </div>
            <div>
              <h3 className="font-semibold mb-4">Prodotto</h3>
              <ul className="space-y-2 text-sm text-blue-gray-300">
                <li><Link href={createUrl('/features')}>Funzionalità</Link></li>
                <li><Link href={createUrl('/pricing')}>Prezzi</Link></li>
                <li><Link href={createUrl('/demo')}>Demo</Link></li>
                <li><Link href={createUrl('/updates')}>Aggiornamenti</Link></li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold mb-4">Supporto</h3>
              <ul className="space-y-2 text-sm text-blue-gray-300">
                <li><Link href={createUrl('/help')}>Centro Assistenza</Link></li>
                <li><Link href={createUrl('/contact')}>Contatti</Link></li>
                <li><Link href={createUrl('/tutorials')}>Tutorial</Link></li>
                <li><Link href={createUrl('/community')}>Community</Link></li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold mb-4">Azienda</h3>
              <ul className="space-y-2 text-sm text-blue-gray-300">
                <li><Link href={createUrl('/about')}>Chi Siamo</Link></li>
                <li><Link href={createUrl('/careers')}>Carriere</Link></li>
                <li><Link href={createUrl('/privacy')}>Privacy</Link></li>
                <li><Link href={createUrl('/terms')}>Termini</Link></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-blue-gray-800 mt-8 pt-8 text-center text-sm text-blue-gray-400">
            <p>&copy; 2025 Memorie Sospese. Tutti i diritti riservati.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}