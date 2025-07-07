// Analytics placeholder per Firebase
// Questo file può essere esteso con Firebase Analytics quando necessario

export function trackEvent(eventName: string, parameters?: Record<string, any>) {
  // Implementazione analytics placeholder
  console.log('Analytics event:', eventName, parameters);
}

export function trackPageView(page: string) {
  // Track page view
  console.log('Page view:', page);
}

export function setUserProperties(properties: Record<string, any>) {
  // Set user properties
  console.log('User properties:', properties);
}