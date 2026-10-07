import React from 'react';

interface GoogleMapProps {
  address: string;
  className?: string;
}

export default function GoogleMap({ address, className = 'w-full h-full' }: GoogleMapProps) {
  // URL encode the address for use in the Google Maps embed URL
  const encodedAddress = encodeURIComponent(address);
  
  return (
    <div className={className}>
      <iframe
        title="Google Maps"
        width="100%"
        height="100%"
        style={{ border: 0, borderRadius: '0.375rem' }}
        loading="lazy"
        allowFullScreen
        referrerPolicy="no-referrer-when-downgrade"
        src={`https://www.google.com/maps/embed/v1/place?key=AIzaSyBFw0Qbyq9zTFTd-tUY6dZWTgaQzuU17R8&q=${encodedAddress}`}
      ></iframe>
    </div>
  );
}