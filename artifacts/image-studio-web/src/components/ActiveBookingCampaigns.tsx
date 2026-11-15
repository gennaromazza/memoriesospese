import { useLocation } from "wouter";
import useEmblaCarousel from "embla-carousel-react";
import Autoplay from "embla-carousel-autoplay";
import {
  Calendar,
  Clock,
  Sparkles,
} from "lucide-react";
import type { BookingCampaignFE } from "@shared/booking-types";
import { Button } from "@/components/ui/button";
import { FloralDivider } from "@/components/WeddingIllustrations";

interface ActiveBookingCampaignsProps {
  campaigns: BookingCampaignFE[];
}

export default function ActiveBookingCampaigns({
  campaigns,
}: ActiveBookingCampaignsProps) {
  const [, navigate] = useLocation();
  const [emblaRef] = useEmblaCarousel({ loop: true, align: "center" }, [
    Autoplay({ delay: 5000, stopOnInteraction: false }),
  ]);

  if (campaigns.length === 0) return null;

  return (
    <section className="relative overflow-hidden bg-light-mint/40 py-12 sm:py-16 md:py-20">
      <div className="absolute inset-0 opacity-5">
        <div
          className="absolute inset-0"
          style={{ backgroundColor: "hsl(var(--sage) / 0.05)" }}
        />
      </div>

      <div className="relative z-10 mx-auto max-w-7xl px-4">
        {campaigns.length === 1 ? (
          (() => {
            const campaign = campaigns[0];
            const formatDate = (date: Date) =>
              date.toLocaleDateString("it-IT", {
                day: "numeric",
                month: "long",
                year: "numeric",
              });
            const daysLeft = Math.ceil(
              (campaign.dataFine.getTime() - new Date().getTime()) /
                (1000 * 60 * 60 * 24),
            );

            return (
              <div className="overflow-hidden rounded-3xl border border-sage/10 bg-off-white shadow-2xl">
                {campaign.immagineSlider && (
                  <div className="w-full">
                    <img
                      src={campaign.immagineSlider}
                      alt={campaign.nome}
                      className="block h-auto max-h-[70vh] w-full bg-cream/40 object-contain"
                      loading="lazy"
                    />
                  </div>
                )}

                <div className="flex flex-col items-center gap-8 p-6 sm:p-8 md:flex-row md:p-12">
                  <div className="flex-1 space-y-6 text-center md:text-left">
                    <div className="inline-flex items-center gap-2 rounded-full bg-sage/10 px-4 py-2">
                      <Sparkles className="h-4 w-4 text-sage" />
                      <span className="text-xs font-semibold uppercase tracking-wider text-sage">
                        Prenotazioni Aperte
                      </span>
                    </div>

                    {!campaign.immagineSlider && (
                      <h2 className="break-words font-playfair text-3xl leading-tight text-blue-gray sm:text-4xl md:text-5xl">
                        {campaign.nome}
                      </h2>
                    )}

                    <div className="flex flex-wrap justify-center gap-4 md:justify-start">
                      <div className="flex items-center gap-2 rounded-xl border border-sage/10 bg-sage/5 px-4 py-2">
                        <Calendar className="h-4 w-4 text-sage" />
                        <span className="text-sm font-medium text-blue-gray">
                          {formatDate(campaign.dataInizio)} —{" "}
                          {formatDate(campaign.dataFine)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 rounded-xl border border-terracotta/30 bg-cream/50 px-4 py-2">
                        <Clock className="h-4 w-4 text-terracotta" />
                        <span className="text-sm font-bold text-dark-sage">
                          {daysLeft} giorni rimasti
                        </span>
                      </div>
                    </div>

                    {campaign.descrizione && (
                      <p className="text-lg leading-relaxed text-dark-sage">
                        {campaign.descrizione}
                      </p>
                    )}
                  </div>

                  <div className="shrink-0">
                    <Button
                      onClick={() => navigate(`/prenota/${campaign.code}`)}
                      size="lg"
                      className="bg-[hsl(120_7%_38%)] px-8 py-6 text-lg font-bold text-off-white shadow-lg transition-all hover:bg-[hsl(120_7%_34%)] hover:shadow-xl"
                      data-testid={`button-book-campaign-${campaign.id}`}
                    >
                      <Calendar className="mr-2 h-5 w-5" />
                      Prenota Subito
                    </Button>
                    <p className="mt-3 text-center text-xs text-blue-gray/80">
                      Posti limitati disponibili
                    </p>
                  </div>
                </div>

                <div className="flex justify-center pb-6">
                  <FloralDivider className="h-8 w-32 text-sage/20" />
                </div>
              </div>
            );
          })()
        ) : (
          <div>
            <div className="mb-12 text-center">
              <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-sage/10 px-6 py-3">
                <Sparkles className="h-5 w-5 text-sage" />
                <span className="text-sm font-semibold uppercase tracking-wider text-sage">
                  Prenotazioni Aperte
                </span>
              </div>
              <h2 className="mb-2 font-playfair text-3xl text-blue-gray sm:text-4xl">
                Offerte Speciali
              </h2>
              <p className="text-xl text-dark-sage">
                Approfitta delle nostre promozioni stagionali
              </p>
            </div>

            <div className="overflow-hidden" ref={emblaRef}>
              <div className="flex">
                {campaigns.map((campaign) => {
                  const formatDate = (date: Date) =>
                    date.toLocaleDateString("it-IT", {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    });
                  const daysLeft = Math.ceil(
                    (campaign.dataFine.getTime() - new Date().getTime()) /
                      (1000 * 60 * 60 * 24),
                  );

                  return (
                    <div
                      key={campaign.id}
                      className="min-w-0 flex-[0_0_100%] px-4"
                    >
                      <div className="overflow-hidden rounded-3xl border border-sage/10 bg-off-white shadow-xl">
                        {campaign.immagineSlider && (
                          <img
                            src={campaign.immagineSlider}
                            alt={campaign.nome}
                            className="block h-auto max-h-[70vh] w-full bg-cream/40 object-contain"
                            loading="lazy"
                          />
                        )}

                        <div className="p-6 text-center sm:p-8 md:p-12">
                          {!campaign.immagineSlider && (
                            <h3 className="mb-4 break-words font-playfair text-2xl leading-tight text-blue-gray sm:text-3xl md:text-4xl">
                              {campaign.nome}
                            </h3>
                          )}

                          <div className="mb-6 flex flex-wrap justify-center gap-3">
                            <div className="flex items-center gap-2 rounded-xl border border-sage/10 bg-sage/5 px-4 py-2">
                              <Calendar className="h-4 w-4 text-sage" />
                              <span className="text-sm font-medium text-blue-gray">
                                {formatDate(campaign.dataInizio)} —{" "}
                                {formatDate(campaign.dataFine)}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 rounded-xl border border-terracotta/30 bg-cream/50 px-4 py-2">
                              <Clock className="h-4 w-4 text-terracotta" />
                              <span className="text-sm font-bold text-dark-sage">
                                {daysLeft} giorni rimasti
                              </span>
                            </div>
                          </div>

                          {campaign.descrizione && (
                            <p className="mb-8 text-lg leading-relaxed text-dark-sage">
                              {campaign.descrizione}
                            </p>
                          )}

                          <Button
                            onClick={() =>
                              navigate(`/prenota/${campaign.code}`)
                            }
                            size="lg"
                            className="bg-[hsl(120_7%_38%)] px-8 py-4 font-bold text-off-white shadow-lg transition-all hover:bg-[hsl(120_7%_34%)] hover:shadow-xl"
                            data-testid={`button-book-campaign-${campaign.id}`}
                          >
                            <Calendar className="mr-2 h-5 w-5" />
                            Prenota Subito
                          </Button>
                        </div>

                        <div className="flex justify-center pb-6">
                          <FloralDivider className="h-8 w-32 text-sage/20" />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="mt-8 flex justify-center gap-2">
              {campaigns.map((campaign, index) => (
                <div
                  key={campaign.id}
                  className="h-2 w-2 cursor-pointer rounded-full bg-sage/30 transition-colors hover:bg-sage/60"
                  aria-label={`Campagna ${index + 1}`}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
