import { Camera, MapPin } from 'lucide-react';
import './_group.css';

const demoVideos = [
  {
    title: 'Daniele e Claudia',
    category: 'Matrimoni',
    thumbnailUrl: '/__mockup/images/aversa-image-vision/daniele-claudia.jpg',
    duration: '04:32',
  },
  {
    title: 'Matrimonio Gennaro e Ludovica',
    category: 'Matrimoni',
    thumbnailUrl: '/__mockup/images/aversa-image-vision/gennaro-ludovica.jpg',
    duration: '05:18',
  },
  {
    title: 'Pasquale e Anita',
    category: 'Matrimoni',
    thumbnailUrl: '/__mockup/images/aversa-image-vision/pasquale-anita.jpg',
    duration: '03:46',
  },
];

const studioAddress = 'Via Quinto Orazio Flacco 5 - Aversa';
const mapEmbedUrl = `https://maps.google.com/maps?q=${encodeURIComponent(studioAddress)}&t=&z=16&ie=UTF8&iwloc=&output=embed`;

export function Proposal() {
  return (
    <main className="aversa-image-vision aversa-image-vision__proposal">
      <section className="aversa-image-vision__vision">
        <div className="aversa-image-vision__inner">
          <header className="aversa-image-vision__header">
            <div className="aversa-image-vision__mark" aria-hidden="true">
              <Camera />
            </div>
            <h2>Image Vision</h2>
            <p>I nostri ultimi video: emozioni in movimento</p>
          </header>

          <div className="aversa-image-vision__grid">
            {demoVideos.map((video) => (
              <a key={video.title} href="#vision" className="aversa-image-vision__card">
                <article>
                  <div className="aversa-image-vision__image">
                    <img src={video.thumbnailUrl} alt={video.title} loading="lazy" />
                    <div className="aversa-image-vision__play-shade" aria-hidden="true">
                      <span className="aversa-image-vision__play"><span /></span>
                    </div>
                    <span className="aversa-image-vision__duration">{video.duration}</span>
                  </div>
                  <div className="aversa-image-vision__caption">
                    <h3>{video.title}</h3>
                    <span>{video.category}</span>
                  </div>
                </article>
              </a>
            ))}
          </div>

          <div className="aversa-image-vision__action">
            <a href="#vision" className="aversa-image-vision__all-videos">
              <Camera aria-hidden="true" size={20} />
              Scopri tutti i Video
            </a>
          </div>
        </div>
      </section>

      <section className="aversa-image-vision__location">
        <div className="aversa-image-vision__inner">
          <header className="aversa-image-vision__location-header">
            <div className="aversa-image-vision__location-mark" aria-hidden="true">
              <MapPin />
            </div>
            <h2>Dove Ci Troviamo</h2>
            <p>Vieni a trovarci nel nostro studio</p>
          </header>
          <div className="aversa-image-vision__location-card aversa-image-vision__map-card">
            <iframe
              className="aversa-image-vision__map-frame"
              src={mapEmbedUrl}
              title={`Mappa dello studio Image Studio, ${studioAddress}`}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              allowFullScreen
            />
            <div className="aversa-image-vision__map-overlay">
              <MapPin className="aversa-image-vision__location-pin" aria-hidden="true" />
              <h3>Ci trovi qui</h3>
              <p>{studioAddress}</p>
              <a
                className="aversa-image-vision__map-button"
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(studioAddress)}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <MapPin size={20} aria-hidden="true" />
                Apri in Google Maps
              </a>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
