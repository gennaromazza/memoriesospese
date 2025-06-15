import React from "react";

interface YouTubeEmbedProps {
  videoUrl: string;
}

// Funzione per estrarre l'ID del video da un URL di YouTube
function getYouTubeVideoId(url: string): string {
  try {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : "";
  } catch (error) {
    
    return "";
  }
}

export default function YouTubeEmbed({ videoUrl }: YouTubeEmbedProps) {
  if (!videoUrl || videoUrl.trim() === "") {
    return null;
  }

  const videoId = getYouTubeVideoId(videoUrl);
  
  if (!videoId) {
    return null;
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-8 mt-6">
      <div className="bg-white p-6 rounded-lg shadow-sm">
        <h3 className="text-lg font-semibold mb-4">Video del matrimonio</h3>
        <div className="relative w-full pb-[56.25%]">
          <iframe 
            src={`https://www.youtube.com/embed/${videoId}`}
            title="Video del matrimonio"
            className="absolute top-0 left-0 w-full h-full rounded-lg"
            frameBorder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          ></iframe>
        </div>
      </div>
    </div>
  );
}