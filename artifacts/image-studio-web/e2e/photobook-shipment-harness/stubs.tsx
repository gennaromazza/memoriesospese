import React from 'react';
export default function Placeholder() { return null; }
export function MockupStatusLine() { return <p>Mockup confermato (fixture isolata)</p>; }
export const GalleryService = { getAllGalleriesForAdmin: async () => [] };
export const getAllJobs = async () => [];
export const getAllLabs = async () => (await fetch('/api/labs')).json();
export function useToast() { return { toast: () => {} }; }
