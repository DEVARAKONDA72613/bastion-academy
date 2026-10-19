import type { MetadataRoute } from 'next';

const siteUrl = 'https://bastion-academy.vercel.app';

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date('2026-10-18T00:00:00.000Z');
  return [
    { url: `${siteUrl}/login`, lastModified, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${siteUrl}/register`, lastModified, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${siteUrl}/privacy`, lastModified, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${siteUrl}/terms`, lastModified, changeFrequency: 'yearly', priority: 0.3 },
  ];
}
