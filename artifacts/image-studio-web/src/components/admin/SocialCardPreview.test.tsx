import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { blogSocialImage } from '@shared/social-metadata';
import SocialCardPreview from './SocialCardPreview';

describe('SocialCardPreview', () => {
  it('shows the resolved image alt text and warns only for a section fallback', () => {
    const sectionFallback = blogSocialImage({ title: 'Una storia' });
    const fallbackMarkup = renderToStaticMarkup(
      <SocialCardPreview
        image={sectionFallback}
        title="Una storia"
        description="Una descrizione"
        url="imagestudiofotografico.com/blog/una-storia"
        testId="social-preview"
      />,
    );

    expect(fallbackMarkup).toContain('role="alert"');
    expect(fallbackMarkup).toContain('Testo alternativo:');
    expect(fallbackMarkup).toContain(sectionFallback.alt);
    expect(fallbackMarkup).toContain(`src="${sectionFallback.url}"`);

    const selectedImage = blogSocialImage({
      title: 'Una storia',
      coverImage: 'https://cdn.example/copertina.jpg',
      coverImageAlt: 'Copertina della storia',
    });
    const selectedMarkup = renderToStaticMarkup(
      <SocialCardPreview
        image={selectedImage}
        title="Una storia"
        description="Una descrizione"
        url="imagestudiofotografico.com/blog/una-storia"
        testId="social-preview"
      />,
    );

    expect(selectedMarkup).toContain('alt="Copertina della storia"');
    expect(selectedMarkup).not.toContain('role="alert"');
  });
});
