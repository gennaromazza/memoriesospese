import { Camera } from 'lucide-react';
import type { CSSProperties } from 'react';
import danieleThumbnail from './assets/daniele-claudia.jpg';
import gennaroThumbnail from './assets/gennaro-ludovica.jpg';
import pasqualeThumbnail from './assets/pasquale-anita.jpg';
import './BlueRefined.css';

const videos = [
  { title: 'Daniele e Claudia', category: 'Matrimoni', thumbnailUrl: danieleThumbnail },
  { title: 'Matrimonio Gennaro e Ludovica', category: 'Matrimoni', thumbnailUrl: gennaroThumbnail },
  { title: 'Pasquale e Anita', category: 'Matrimoni', thumbnailUrl: pasqualeThumbnail },
];

export function BlueRefined() {
  return (
    <section className="blue-refined">
      <div className="blue-refined__inner">
        <header className="blue-refined__header">
          <div className="blue-refined__mark" aria-hidden="true">
            <Camera />
          </div>
          <h2>iMaGe Vision</h2>
          <span className="blue-refined__rule" aria-hidden="true" />
          <p>I nostri ultimi video: emozioni in movimento</p>
        </header>

        <div className="blue-refined__grid">
          {videos.map((video, index) => (
            <a key={video.title} href="#vision" className="blue-refined__link">
              <article className="blue-refined__card" style={{ '--card-order': index } as CSSProperties}>
                <div className="blue-refined__image">
                  <img src={video.thumbnailUrl} alt={video.title} />
                  <div className="blue-refined__play" aria-hidden="true">
                    <span />
                  </div>
                </div>
                <div className="blue-refined__caption">
                  <h3>{video.title}</h3>
                  <span>{video.category}</span>
                  <i aria-hidden="true" />
                </div>
              </article>
            </a>
          ))}
        </div>

        <div className="blue-refined__action">
          <a href="#vision">
            <Camera aria-hidden="true" />
            <span>Scopri tutti i Video</span>
            <span className="blue-refined__arrow" aria-hidden="true">↗</span>
          </a>
        </div>
      </div>
    </section>
  );
}
