import { describe, expect, it } from 'vitest';
import {
  buildImageExperienceConfiguratorUrl,
  IMAGE_EXPERIENCE_CONFIGURATOR_URL,
} from './image-experience';

describe('Image Experience campaign attribution', () => {
  it('keeps only UTM parameters and fbclid', () => {
    expect(buildImageExperienceConfiguratorUrl(
      '?utm_source=meta&utm_medium=paid-social&utm_campaign=fiera&fbclid=abc&coupon=secret',
    )).toBe(
      `${IMAGE_EXPERIENCE_CONFIGURATOR_URL}?utm_source=meta&utm_medium=paid-social&utm_campaign=fiera&fbclid=abc`,
    );
  });

  it('does not add a question mark when no allowed parameter is present', () => {
    expect(buildImageExperienceConfiguratorUrl('?debug=true'))
      .toBe(IMAGE_EXPERIENCE_CONFIGURATOR_URL);
  });
});